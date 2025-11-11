import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { useSessao } from './use-sessao';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { PlanoContas } from '@/types/plano-contas';
import { SaldoConta } from '@/types/saldo-conta';
import { format } from 'date-fns';

interface ContaBalanco extends PlanoContas {
  saldo_final: number;
  tipo_principal: 'Ativo' | 'Passivo' | 'Patrimonio Liquido' | 'Resultado' | 'Outros';
}

interface BalancoData {
  contas: ContaBalanco[];
  totalAtivo: number;
  totalPassivo: number;
  totalPatrimonioLiquido: number;
  resultadoLiquido: number; // Adicionando resultado líquido para facilitar
  carregando: boolean;
  refetch: () => void;
}

const getTipoPrincipal = (conta: string): ContaBalanco['tipo_principal'] => {
  if (conta.startsWith('1')) return 'Ativo';
  if (conta.startsWith('2')) return 'Passivo';
  
  // Contas de Resultado (Receita, Custo, Despesa)
  if (conta.startsWith('4') || conta.startsWith('5')) return 'Resultado';
  
  // Contas de Patrimônio Líquido (3.x.x)
  if (conta.startsWith('3')) return 'Patrimonio Liquido';
  
  return 'Outros';
};

/**
 * Função de comparação para ordenar códigos contábeis hierarquicamente.
 * Ex: 4.2.2.01.0004 deve vir depois de 4.2.2.01.
 */
const compareContas = (a: ContaBalanco, b: ContaBalanco): number => {
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
 * A lógica foi simplificada para somar o saldo de TODAS as contas descendentes ANALÍTICAS.
 */
const consolidateBalances = (contas: ContaBalanco[]): ContaBalanco[] => {
    // 1. Cria um mapa de saldos base (apenas analíticas)
    const saldoAnaliticoMap: Record<string, number> = contas
        .filter(c => c.Analitica === 'Sim') // Apenas contas analíticas têm o saldo base calculado
        .reduce((acc, c) => {
            acc[c.Conta] = c.saldo_final;
            return acc;
        }, {} as Record<string, number>);

    // 2. Cria um mapa para armazenar os saldos consolidados (inicialmente com saldos base)
    const saldoConsolidadoMap: Record<string, number> = { ...saldoAnaliticoMap };

    // 3. Ordena as contas sintéticas do mais específico para o mais geral (ordem decrescente)
    const sinteticas = contas.filter(c => c.Analitica === 'Não').sort((a, b) => compareContas(b, a));

    // 4. Consolida: Cada sintética soma o saldo de seus descendentes analíticos
    for (const contaSintetica of sinteticas) {
        let totalConsolidado = 0;
        
        // Itera sobre TODAS as contas para encontrar as filhas ANALÍTICAS
        for (const conta of contas) {
            // Verifica se é descendente E se é ANALÍTICA
            // A conta sintética deve ser um prefixo da conta analítica, seguida por um ponto.
            if (conta.Analitica === 'Sim' && conta.Conta.startsWith(contaSintetica.Conta + '.')) {
                
                // Soma o saldo da conta analítica (que está no saldoAnaliticoMap)
                const saldoAnalitico = saldoAnaliticoMap[conta.Conta];
                
                if (saldoAnalitico !== undefined) {
                    totalConsolidado += saldoAnalitico;
                }
            }
        }
        
        // Armazena o saldo consolidado da sintética
        saldoConsolidadoMap[contaSintetica.Conta] = totalConsolidado;
    }
    
    // 5. Atualiza a lista de contas com os saldos consolidados
    return contas.map(c => {
        const saldo = saldoConsolidadoMap[c.Conta];
        return {
            ...c,
            saldo_final: saldo !== undefined ? saldo : c.saldo_final,
        };
    });
};


export function useBalancoPatrimonial(endDate: Date | undefined): BalancoData {
  const { usuario, perfil, role, carregando: carregandoSessao } = useSessao();
  const [contasBalanco, setContasBalanco] = useState<ContaBalanco[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const getEmpresaId = () => {
    if (role === 'Admin') return usuario?.id || null;
    if (role === 'Cliente') return (perfil as ClienteProfile)?.id || null;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id || null;
    return null;
  };
  
  const empresaId = getEmpresaId();
  const endDateISO = endDate ? format(endDate, 'yyyy-MM-dd') : undefined;

  const refetch = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  const fetchBalanco = useCallback(async () => {
    if (!empresaId || !endDateISO) {
      setCarregando(false);
      return;
    }
    
    setCarregando(true);
    
    try {
      // 1. Buscar Plano de Contas
      const { data: planoContasData, error: pcError } = await supabase
        .from('plano_contas')
        .select('*')
        .eq('proprietario_id', empresaId)
        .order('Conta', { ascending: true });
        
      if (pcError) throw pcError;
      const planoContas = planoContasData as PlanoContas[];
      
      // 2. Buscar Contas de Saldo (para saldos iniciais)
      const { data: saldoContasData, error: scError } = await supabase
        .from('saldo_contas')
        .select('id, conta_contabil_id, saldo_inicial')
        .eq('proprietario_id', empresaId); // CORRIGIDO: Usando proprietario_id
        
      if (scError) throw scError;
      const saldoContas = saldoContasData as SaldoConta[];
      
      const saldoInicialMap = saldoContas.reduce((acc, sc) => {
          if (sc.conta_contabil_id) {
              acc[sc.conta_contabil_id] = (acc[sc.conta_contabil_id] || 0) + sc.saldo_inicial;
          }
          return acc;
      }, {} as Record<string, number>);

      // 3. Buscar Lançamentos até a data final
      const { data: lancamentosData, error: lError } = await supabase
        .from('lancamentos')
        .select('valor, tipo, conta_contabil_id')
        .eq('proprietario_id', empresaId)
        .lte('data_movimentacao', endDateISO);
        
      if (lError) throw lError;
      
      // 4. Calcular o saldo de cada conta contábil (apenas analíticas e sintéticas que podem ter saldo inicial)
      const movimentosMap = lancamentosData.reduce((acc, l) => {
        if (l.conta_contabil_id) {
          // O valor é sempre somado/subtraído do saldo da conta contábil
          const valor = l.tipo === 'Entrada' ? l.valor : -l.valor;
          acc[l.conta_contabil_id] = (acc[l.conta_contabil_id] || 0) + valor;
        }
        return acc;
      }, {} as Record<string, number>);
      
      // 5. Calcular o saldo base (apenas analíticas e PL/Resultado)
      let contasCalculadas: ContaBalanco[] = planoContas.map(pc => {
        const saldoInicial = saldoInicialMap[pc.id] || 0;
        const movimentos = movimentosMap[pc.id] || 0;
        
        let saldo_final = 0;
        
        // Se for conta de saldo (Caixa/Banco) ou Patrimonial, o saldo é Inicial + Movimentos
        if (pc.is_conta_caixa_banco || pc.is_conta_patrimonial) {
            saldo_final = saldoInicial + movimentos;
        } 
        // Se for conta de Resultado (Receita/Despesa), o saldo é apenas Movimentos
        else if (pc.is_conta_resultado) {
            // Contas de Resultado (4.x.x e 5.x.x) têm saldo positivo para despesas/custos
            // Contas de Receita (3.x.x) têm saldo positivo para receitas
            
            // Lógica de sinal para DRE (Receita é Entrada, Despesa é Saída)
            const movimentosDRE = lancamentosData
                .filter(l => l.conta_contabil_id === pc.id)
                .reduce((sum, l) => {
                    if (pc.Conta.startsWith('3')) { // Receita
                        return sum + (l.tipo === 'Entrada' ? l.valor : -l.valor);
                    } else { // Custo/Despesa
                        return sum + (l.tipo === 'Saida' ? l.valor : -l.valor);
                    }
                }, 0);
            
            saldo_final = movimentosDRE;
        }
        // Se for Patrimônio Líquido (PL), o saldo é Inicial + Movimentos
        else if (getTipoPrincipal(pc.Conta) === 'Patrimonio Liquido') {
            saldo_final = saldoInicial + movimentos;
        }
        // Se for analítica, mas não é saldo/resultado/PL, o saldo é apenas Movimentos
        else if (pc.Analitica === 'Sim') {
            saldo_final = movimentos;
        }
        // Se for sintética pura, o saldo base é 0 (será consolidado depois)
        else {
            saldo_final = 0;
        }
        
        return {
          ...pc,
          saldo_final,
          tipo_principal: getTipoPrincipal(pc.Conta),
        };
      });
      
      // 6. Consolidar saldos das contas analíticas para as sintéticas
      contasCalculadas = consolidateBalances(contasCalculadas);
      
      // 7. Ordenar as contas consolidadas pelo código
      contasCalculadas.sort(compareContas);
      
      setContasBalanco(contasCalculadas);

    } catch (error: any) {
      console.error('Erro ao calcular balanço:', error);
      showError('Falha ao carregar dados do balanço: ' + error.message);
      setContasBalanco([]);
    } finally {
      setCarregando(false);
    }
  }, [empresaId, endDateISO, refreshKey]);

  useEffect(() => {
    if (!carregandoSessao && empresaId) {
      fetchBalanco();
    }
  }, [carregandoSessao, empresaId, fetchBalanco]);
  
  // 8. Calcular totais
  // NOVO CÁLCULO: Busca o saldo consolidado da conta de nível 1 (ex: '1')
  const getSaldoNivel1 = (contaCodigo: string) => {
      const contaNivel1 = contasBalanco.find((c: ContaBalanco) => c.Conta === contaCodigo);
      return contaNivel1?.saldo_final || 0;
  };
  
  const totalAtivo = getSaldoNivel1('1');
  const totalPassivo = getSaldoNivel1('2');
  
  // NOVO CÁLCULO PL: Soma apenas as contas de PL (3.x.x) que NÃO são contas de resultado
  const totalPatrimonioLiquido = contasBalanco
    .filter((c: ContaBalanco) => c.tipo_principal === 'Patrimonio Liquido' && !c.is_conta_resultado)
    .reduce((sum: number, c: ContaBalanco) => sum + c.saldo_final, 0);
    
  // O Resultado Líquido é a soma de todas as contas de Resultado (4.x.x e 5.x.x)
  const resultadoLiquido = contasBalanco
    .filter((c: ContaBalanco) => c.tipo_principal === 'Resultado')
    .reduce((sum: number, c: ContaBalanco) => sum + c.saldo_final, 0);

  return {
    contas: contasBalanco,
    totalAtivo,
    totalPassivo,
    totalPatrimonioLiquido,
    resultadoLiquido,
    carregando,
    refetch,
  };
}