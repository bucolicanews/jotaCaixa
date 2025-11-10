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
  if (conta.startsWith('3')) return 'Patrimonio Liquido';
  if (conta.startsWith('4') || conta.startsWith('5')) return 'Resultado';
  return 'Outros';
};

/**
 * Função de comparação para ordenar códigos contábeis hierarquicamente.
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
 * Regra: A conta sintética soma apenas o saldo das suas filhas DIRETAS.
 */
const consolidateBalances = (contas: ContaBalanco[]): ContaBalanco[] => {
    // 1. Cria um mapa de saldos iniciais (apenas analíticas e PL/Resultado)
    const saldoAnaliticoMap: Record<string, number> = contas
        .filter(c => c.Analitica === 'Sim' || c.tipo_principal === 'Resultado' || c.tipo_principal === 'Patrimonio Liquido')
        .reduce((acc, c) => {
            acc[c.Conta] = c.saldo_final;
            return acc;
        }, {} as Record<string, number>);

    // 2. Cria um mapa para armazenar os saldos consolidados (incluindo sintéticas)
    const saldoConsolidadoMap: Record<string, number> = { ...saldoAnaliticoMap };

    // 3. Ordena as contas sintéticas do mais específico para o mais geral (ordem decrescente)
    // Isso garante que 1.0.1 seja processado antes de 1.
    const sinteticas = contas.filter(c => c.Analitica === 'Não').sort((a, b) => compareContas(b, a));

    // 4. Consolida de baixo para cima
    for (const contaSintetica of sinteticas) {
        let totalConsolidado = 0;
        
        // Calcula o nível da conta sintética (número de pontos + 1)
        const nivelPai = contaSintetica.Conta.split('.').filter(p => p.length > 0).length;
        const nivelFilhoDireto = nivelPai + 1;
        
        // Itera sobre todas as contas para encontrar as filhas DIRETAS
        for (const conta of contas) {
            // 4.1. Verifica se é filha (começa com o prefixo do pai + '.')
            if (conta.Conta.startsWith(contaSintetica.Conta + '.') && conta.Conta !== contaSintetica.Conta) {
                
                // 4.2. Verifica se é filha DIRETA (o nível é exatamente o próximo)
                const nivelConta = conta.Conta.split('.').filter(p => p.length > 0).length;
                
                if (nivelConta === nivelFilhoDireto) {
                    // Se for filha direta, soma o saldo consolidado dela (que já deve estar no mapa)
                    const saldoFilho = saldoConsolidadoMap[conta.Conta];
                    if (saldoFilho !== undefined) {
                        totalConsolidado += saldoFilho;
                    }
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
        
        // Se for conta de saldo (Ativo/Passivo), o saldo é Inicial + Movimentos
        if (pc.is_conta_saldo) {
            saldo_final = saldoInicial + movimentos;
        } 
        // Se for conta de Resultado (Receita/Despesa), o saldo é apenas Movimentos
        else if (pc.is_conta_resultado) {
            saldo_final = movimentos;
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
      const contaNivel1 = contasBalanco.find(c => c.Conta === contaCodigo);
      return contaNivel1?.saldo_final || 0;
  };
  
  const totalAtivo = getSaldoNivel1('1');
  const totalPassivo = getSaldoNivel1('2');
  const totalPatrimonioLiquido = getSaldoNivel1('3');
    
  const resultadoLiquido = contasBalanco
    .filter(c => c.tipo_principal === 'Resultado')
    .reduce((sum, c) => sum + c.saldo_final, 0);

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