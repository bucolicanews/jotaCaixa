import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { useSessao } from './use-sessao';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { PlanoContas } from '@/types/plano-contas';
import { format } from 'date-fns';
import { DateRange } from 'react-day-picker';

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
 * Determina o tipo de DRE (Receita, Custo, Despesa) com base no código da conta.
 * Regra Contábil Simplificada:
 * 3.x.x = Receita
 * 4.x.x = Custo
 * 5.x.x = Despesa
 */
const getTipoDRE = (conta: string): ContaDRE['tipo_dre'] => {
  if (conta.startsWith('3')) return 'Receita';
  if (conta.startsWith('4')) return 'Custo';
  if (conta.startsWith('5')) return 'Despesa';
  return 'Resultado'; // Contas de resultado (lucro/prejuízo)
};

/**
 * Função de comparação para ordenar códigos contábeis hierarquicamente.
 * Ex: 4.2.2.01.0004 deve vir depois de 4.2.2.01.
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
    // 1. Cria um mapa de saldos por ID
    const saldoMap: Record<string, number> = contas.reduce((acc, c) => {
        acc[c.id] = c.saldo_final;
        return acc;
    }, {} as Record<string, number>);

    // 2. Ordena as contas do mais específico para o mais geral (ordem decrescente)
    // Isso garante que as filhas sejam processadas antes dos pais.
    const sortedContas = [...contas].sort((a, b) => compareContas(b, a));

    // 3. Consolida de baixo para cima
    for (const conta of sortedContas) {
        if (conta.Analitica === 'Sim') continue; // Apenas contas sintéticas (Analitica='Não') consolidam

        // Percorre todas as contas para encontrar as filhas diretas
        for (const child of contas) {
            // Verifica se o filho começa com o código do pai E não é o próprio pai
            if (child.Conta.startsWith(conta.Conta + '.') && child.Conta !== conta.Conta) {
                // Se o filho for analítico, seu saldo já está no saldoMap.
                // Se o filho for sintético, seu saldo já foi consolidado (devido à ordenação).
                const saldoFilho = saldoMap[child.id];
                
                // Adiciona o saldo do filho ao saldo do pai
                saldoMap[conta.id] = (saldoMap[conta.id] || 0) + saldoFilho;
            }
        }
    }
    
    // 4. Atualiza a lista de contas com os saldos consolidados
    return contas.map(c => ({
        ...c,
        saldo_final: saldoMap[c.id] !== undefined ? saldoMap[c.id] : c.saldo_final,
    }));
};


export function useDRE(filtroPeriodo: DateRange | undefined): DREData {
  const { usuario, perfil, role, carregando: carregandoSessao } = useSessao();
  const [contasDRE, setContasDRE] = useState<ContaDRE[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const getEmpresaId = () => {
    if (role === 'Admin') return usuario?.id || null;
    if (role === 'Cliente') return (perfil as ClienteProfile)?.id || null;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id || null;
    return null;
  };
  
  const empresaId = getEmpresaId();
  
  const startDateISO = filtroPeriodo?.from ? format(filtroPeriodo.from, 'yyyy-MM-dd') : undefined;
  const endDateISO = filtroPeriodo?.to ? format(filtroPeriodo.to, 'yyyy-MM-dd') : undefined;

  const refetch = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  const fetchDRE = useCallback(async () => {
    if (!empresaId || !startDateISO || !endDateISO) {
      setCarregando(false);
      return;
    }
    
    setCarregando(true);
    
    try {
      // 1. Buscar Plano de Contas (apenas contas de resultado: 3, 4, 5)
      const { data: planoContasData, error: pcError } = await supabase
        .from('plano_contas')
        .select('*')
        .eq('proprietario_id', empresaId)
        .or('Conta.like.3.%,Conta.like.4.%,Conta.like.5.%')
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
          // Receita (3.x.x) é Entrada (+), Despesa/Custo (4.x.x, 5.x.x) é Saída (-)
          const conta = planoContas.find(pc => pc.id === l.conta_contabil_id);
          const tipoDRE = conta ? getTipoDRE(conta.Conta) : 'Resultado';
          
          let valor = 0;
          
          if (tipoDRE === 'Receita') {
              // Receita: Entrada é positiva, Saída é negativa (estorno)
              valor = l.tipo === 'Entrada' ? l.valor : -l.valor;
          } else if (tipoDRE === 'Custo' || tipoDRE === 'Despesa') {
              // Custo/Despesa: Saída é positiva (aumenta o custo), Entrada é negativa (estorno)
              valor = l.tipo === 'Saida' ? l.valor : -l.valor;
          }
          
          acc[l.conta_contabil_id] = (acc[l.conta_contabil_id] || 0) + valor;
        }
        return acc;
      }, {} as Record<string, number>);
      
      // 4. Mapear e calcular saldos base (apenas analíticas)
      let contasCalculadas: ContaDRE[] = planoContas
        .filter(pc => pc.Analitica === 'Sim')
        .map(pc => {
            const saldo_final = movimentosMap[pc.id] || 0;
            
            return {
                ...pc,
                saldo_final,
                tipo_dre: getTipoDRE(pc.Conta),
            };
        });
        
      // 5. Adicionar contas sintéticas com saldo 0 para consolidação
      const sinteticas = planoContas
        .filter(pc => pc.Analitica === 'Não')
        .map(pc => ({
            ...pc,
            saldo_final: 0,
            tipo_dre: getTipoDRE(pc.Conta),
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
  }, [empresaId, startDateISO, endDateISO, refreshKey]);

  useEffect(() => {
    if (!carregandoSessao && empresaId && startDateISO && endDateISO) {
      fetchDRE();
    }
  }, [carregandoSessao, empresaId, startDateISO, endDateISO, fetchDRE]);
  
  // 8. Calcular totais
  const getSomaPorTipo = (tipo: ContaDRE['tipo_dre']) => {
      // Soma todas as contas sintéticas que pertencem à categoria principal (3, 4 ou 5)
      // O filtro 'Analitica === Não' garante que estamos somando apenas os totais consolidados.
      const prefix = tipo === 'Receita' ? '3' : (tipo === 'Custo' ? '4' : (tipo === 'Despesa' ? '5' : ''));
      
      if (!prefix) return 0;
      
      return contasDRE
          .filter(c => c.Analitica === 'Não' && c.Conta.startsWith(prefix))
          .reduce((sum, c) => sum + c.saldo_final, 0);
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