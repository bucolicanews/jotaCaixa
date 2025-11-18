import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { useSessao } from './use-sessao';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { PlanoContas } from '@/types/plano-contas';
import { format } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { useContabilConfig, ContabilConfigMap } from './use-contabil-config'; // Importando ContabilConfigMap

interface ContaDRE extends PlanoContas {
  saldo_final: number;
  tipo_dre: 'Receita' | 'Custo' | 'Despesa' | 'Resultado';
}

interface DREData {
  contas: ContaDRE[];
  totalReceita: number;
  totalCusto: number;
  totalDespesa: number;
  resultadoLiquido: number;
  carregando: boolean;
  refetch: () => void;
}

/**
 * Determina o tipo de DRE (Receita, Custo, Despesa) com base no código da conta
 * e no mapeamento de configuração.
 */
const getTipoDRE = (conta: string, configMap: ContabilConfigMap): ContaDRE['tipo_dre'] => {
  const nivel1 = conta.split('.')[0];
  
  if (nivel1 === configMap.Receita) return 'Receita';
  if (nivel1 === configMap.Custo) return 'Custo';
  if (nivel1 === configMap.Despesa) return 'Despesa';
  
  return 'Resultado'; // Contas de resultado (lucro/prejuízo)
};

/**
 * Função de comparação para ordenar códigos contábeis hierarquicamente.
 */
const compareContas = (a: ContaDRE, b: ContaDRE): number => {
    const partsA = a.Conta.split('.').map(Number);
    const partsB = b.Conta.split('.').map(Number);

    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        const numA = partsA[i] || 0;
        const numB = partsB[i] || 0;

        if (numA !== numB) {
            return numA - numB;
        }
    }
    return partsA.length - partsB.length;
};

/**
 * Consolida os saldos das contas analíticas para as contas sintéticas.
 */
const consolidateBalances = (contas: ContaDRE[]): ContaDRE[] => {
    const consolidated: Record<string, number> = {};
    const contaMap: Record<string, ContaDRE> = {};

    for (const c of contas) {
        consolidated[c.Conta] = 0;
        contaMap[c.Conta] = c;
    }

    const analiticas = contas.filter(c => c.Analitica === 'Sim');

    for (const analitica of analiticas) {
        let currentCode = analitica.Conta;
        const saldoBase = analitica.saldo_final;
        
        // Propaga o saldo para a própria conta analítica
        consolidated[currentCode] = (consolidated[currentCode] || 0) + saldoBase;

        // Propaga o saldo para todos os ancestrais sintéticos
        while (currentCode.includes('.')) {
            const lastDot = currentCode.lastIndexOf('.');
            const parentCode = currentCode.substring(0, lastDot);
            
            const parentConta = contaMap[parentCode];
            
            if (parentConta && parentConta.Analitica === 'Não') {
                consolidated[parentCode] = (consolidated[parentCode] || 0) + saldoBase;
            }
            
            currentCode = parentCode;
        }
    }

    return contas.map(c => ({
        ...c,
        saldo_final: consolidated[c.Conta] ?? 0,
    }));
};


export function useDRE(filtroPeriodo: DateRange | undefined): DREData {
  const { usuario, perfil, role, carregando: carregandoSessao } = useSessao();
  const { configMap, loading: loadingConfig } = useContabilConfig(); // USANDO HOOK DE CONFIGURAÇÃO
  const [contasDRE, setContasDRE] = useState<ContaDRE[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const getEmpresaId = () => {
    if (role === 'Admin') return usuario?.id || null;
    if (role === 'Cliente') return (perfil as ClienteProfile)?.id || null;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id || null; // FIX: proprietario_id -> cliente_id
    return null;
  };
  
  const empresaId = getEmpresaId();
  
  const startDateISO = filtroPeriodo?.from ? format(filtroPeriodo.from, 'yyyy-MM-dd') : undefined;
  const endDateISO = filtroPeriodo?.to ? format(filtroPeriodo.to, 'yyyy-MM-dd') : undefined;

  const refetch = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  const fetchDRE = useCallback(async () => {
    if (!empresaId || !startDateISO || !endDateISO || loadingConfig) {
      setCarregando(false);
      return;
    }
    
    setCarregando(true);
    
    const receitaCode = configMap.Receita || '4'; // USANDO CÓDIGO CORRETO
    const custoCode = configMap.Custo || '5';
    const despesaCode = configMap.Despesa || '6';
    
    // Cria a cláusula OR dinâmica
    const orClause = [
        `Conta.like.${receitaCode}.%`,
        `Conta.like.${custoCode}.%`,
        `Conta.like.${despesaCode}.%`,
    ].join(',');
    
    try {
      // 1. Buscar Plano de Contas (apenas contas de resultado: Receita, Custo, Despesa)
      const { data: planoContasData, error: pcError } = await supabase
        .from('plano_contas')
        .select('*')
        .eq('proprietario_id', empresaId)
        .or(orClause) // USANDO CLÁUSULA DINÂMICA
        .order('Conta', { ascending: true });
        
      if (pcError) throw pcError;
      const planoContas = planoContasData as PlanoContas[];
      
      // 2. Buscar Lançamentos dentro do período
      const { data: lancamentosData, error: lError } = await supabase
        .from('lancamentos')
        .select('valor, tipo, conta_contabil_id')
        .eq('proprietario_id', empresaId)
        .gte('data_movimentacao', startDateISO)
        .lte('data_movimentacao', endDateISO);
        
      if (lError) throw lError;
      
      // 3. Calcular o saldo de cada conta contábil (apenas analíticas)
      const movimentosMap = lancamentosData.reduce((acc, l) => {
        if (l.conta_contabil_id) {
          const conta = planoContas.find(pc => pc.id === l.conta_contabil_id);
          
          // CORREÇÃO CRÍTICA: Apenas contas marcadas como is_conta_resultado devem ter movimento na DRE
          if (!conta || !conta.is_conta_resultado) {
              return acc;
          }
          
          const tipoDRE = getTipoDRE(conta.Conta, configMap); // USANDO CONFIG MAP
          
          let valor = 0;
          
          if (tipoDRE === 'Receita') {
              // Receita (Natureza Credora): Entrada (Débito) = -, Saída (Crédito) = +
              valor = l.tipo === 'Entrada' ? -l.valor : l.valor;
          } else if (tipoDRE === 'Custo' || tipoDRE === 'Despesa') {
              // Custo/Despesa (Natureza Devedora): Entrada (Débito) = +, Saída (Crédito) = -
              valor = l.tipo === 'Entrada' ? l.valor : -l.valor;
          }
          
          acc[l.conta_contabil_id] = (acc[l.conta_contabil_id] || 0) + valor;
        }
        return acc;
      }, {} as Record<string, number>);
      
      // 4. Mapear e calcular saldos base (apenas analíticas)
      let contasCalculadas: ContaDRE[] = planoContas
        .filter(pc => pc.Analitica === 'Sim' && pc.is_conta_resultado) // FILTRO ADICIONAL
        .map(pc => {
            const saldo_final = movimentosMap[pc.id] || 0;
            
            return {
                ...pc,
                saldo_final,
                tipo_dre: getTipoDRE(pc.Conta, configMap), // USANDO CONFIG MAP
            };
        });
        
      // 5. Adicionar contas sintéticas com saldo 0 para consolidação
      const sinteticas = planoContas
        .filter(pc => pc.Analitica === 'Não' && pc.is_conta_resultado) // Apenas sintéticas de resultado
        .map(pc => ({
            ...pc,
            saldo_final: 0,
            tipo_dre: getTipoDRE(pc.Conta, configMap), // USANDO CONFIG MAP
        }));
        
      contasCalculadas = [...contasCalculadas, ...sinteticas];
      
      // 6. Consolidar saldos das contas analíticas para as sintéticas
      contasCalculadas = consolidateBalances(contasCalculadas);
      
      // 7. Ordenar as contas consolidadas pelo código
      contasCalculadas.sort(compareContas);
      
      setContasDRE(contasCalculadas);

    } catch (error: any) {
      console.error('Erro ao calcular DRE:', error);
      showError('Falha ao carregar dados da DRE: ' + error.message);
      setContasDRE([]);
    } finally {
      setCarregando(false);
    }
  }, [empresaId, startDateISO, endDateISO, refreshKey, loadingConfig, configMap]);

  useEffect(() => {
    if (!carregandoSessao && empresaId && startDateISO && endDateISO && !loadingConfig) {
      fetchDRE();
    }
  }, [carregandoSessao, empresaId, startDateISO, endDateISO, fetchDRE, loadingConfig]);
  
  // 8. Calcular totais
  const getSomaPorTipo = (tipo: keyof ContabilConfigMap) => {
      const nivel1Code = configMap[tipo] || '0'; // Usa o código configurado
      
      // Soma apenas as contas de nível 1 (ex: '4', '5', '6')
      const total = contasDRE
          .filter(c => c.Analitica === 'Não' && c.Conta === nivel1Code)
          .reduce((sum, c) => sum + c.saldo_final, 0);
          
      // Se a conta de nível 1 não for sintética, tenta somar todas as analíticas que começam com o código
      if (total === 0) {
          return contasDRE
              .filter(c => c.Analitica === 'Sim' && c.Conta.startsWith(nivel1Code))
              .reduce((sum, c) => sum + c.saldo_final, 0);
      }
      
      return total;
  };
  
  const totalReceita = getSomaPorTipo('Receita');
  const totalCusto = getSomaPorTipo('Custo');
  const totalDespesa = getSomaPorTipo('Despesa');
  
  // Resultado Líquido = Receita - Custo - Despesa
  const resultadoLiquido = totalReceita - totalCusto - totalDespesa;

  return {
    contas: contasDRE,
    totalReceita,
    totalCusto,
    totalDespesa,
    resultadoLiquido,
    carregando,
    refetch,
  };
}