import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { useSessao } from './use-sessao';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { PlanoContas } from '@/types/plano-contas';
import { SaldoConta } from '@/types/saldo-conta';
import { format } from 'date-fns';
import { useContabilConfig, ContabilConfigMap } from './use-contabil-config'; // Importando ContabilConfigMap

interface ContaBalanco extends PlanoContas {
  saldo_final: number;
  tipo_principal: 'Ativo' | 'Passivo' | 'Patrimonio Liquido' | 'Resultado' | 'Outros';
}

interface BalancoData {
  contas: ContaBalanco[];
  totalAtivo: number;
  totalPassivo: number; // Passivo (código 2)
  totalPatrimonioLiquido: number; // Patrimônio Líquido (código 3)
  resultadoLiquido: number; // Resultado do Exercício (Receita - Custo - Despesa)
  totalPassivoPL: number; // NOVO: Total do lado direito (2 + 3 + Resultado)
  carregando: boolean;
  refetch: () => void;
}

/**
 * Determina o tipo de DRE (Receita, Custo, Despesa) com base no código da conta
 * e no mapeamento de configuração.
 */
const getTipoDRE = (conta: string, configMap: ContabilConfigMap): ContaBalanco['tipo_principal'] => {
  const nivel1 = conta.split('.')[0];
  
  if (nivel1 === configMap.Receita) return 'Resultado';
  if (nivel1 === configMap.Custo) return 'Resultado';
  if (nivel1 === configMap.Despesa) return 'Resultado';
  
  if (nivel1 === configMap.Ativo) return 'Ativo';
  if (nivel1 === configMap.Passivo) return 'Passivo';
  if (nivel1 === configMap['Patrimonio Liquido']) return 'Patrimonio Liquido';
  
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
 */
const consolidateBalances = (contas: ContaBalanco[]): ContaBalanco[] => {
    // 1. Cria um mapa para armazenar os saldos consolidados (inicialmente com saldos base)
    const saldoConsolidadoMap: Record<string, number> = contas
        .reduce((acc, c) => {
            // Se for analítica, usa o saldo calculado. Se for sintética, começa com 0.
            acc[c.Conta] = c.Analitica === 'Sim' ? c.saldo_final : 0;
            return acc;
        }, {} as Record<string, number>);

    // 2. Ordena as contas sintéticas do mais específico para o mais geral (ordem decrescente)
    const sinteticas = contas.filter(c => c.Analitica === 'Não').sort((a, b) => compareContas(b, a));

    // 3. Consolida: Cada sintética soma o saldo de seus descendentes diretos e indiretos
    for (const contaSintetica of sinteticas) {
        let totalConsolidado = 0;
        
        // O prefixo de busca é o código da conta sintética seguido por um ponto
        const prefixoBusca = contaSintetica.Conta + '.';
        
        // Itera sobre todas as contas para encontrar as filhas (diretas e indiretas)
        for (const conta of contas) {
            // 4.1. Verifica se é descendente (começa com o prefixo do pai + '.')
            if (conta.Conta.startsWith(prefixoBusca)) {
                
                // 4.2. Se for uma conta analítica, soma o saldo final dela.
                // Se for uma conta sintética, soma o saldo consolidado dela (que já deve estar no mapa).
                const saldoDescendente = saldoConsolidadoMap[conta.Conta];
                
                if (saldoDescendente !== undefined) {
                    totalConsolidado += saldoDescendente;
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
  const { configMap, loading: loadingConfig } = useContabilConfig(); // USANDO HOOK DE CONFIGURAÇÃO
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
    if (!empresaId || !endDateISO || loadingConfig) {
      setCarregando(false);
      return;
    }
    
    setCarregando(true);
    
    const ativoCode = configMap.Ativo || '1';
    const passivoCode = configMap.Passivo || '2';
    const plCode = configMap['Patrimonio Liquido'] || '3';
    const receitaCode = configMap.Receita || '4';
    const custoCode = configMap.Custo || '5';
    const despesaCode = configMap.Despesa || '6';
    
    // CORREÇÃO 1: Incluir contas de nível 1 explicitamente na cláusula OR
    const orClause = [
        `Conta.eq.${ativoCode}`,
        `Conta.like.${ativoCode}.%`,
        `Conta.eq.${passivoCode}`,
        `Conta.like.${passivoCode}.%`,
        `Conta.eq.${plCode}`,
        `Conta.like.${plCode}.%`,
        `Conta.eq.${receitaCode}`,
        `Conta.like.${receitaCode}.%`,
        `Conta.eq.${custoCode}`,
        `Conta.like.${custoCode}.%`,
        `Conta.eq.${despesaCode}`,
        `Conta.like.${despesaCode}.%`,
    ].join(',');
    
    try {
      // 1. Buscar Plano de Contas
      const { data: planoContasData, error: pcError } = await supabase
        .from('plano_contas')
        .select('*')
        .eq('proprietario_id', empresaId)
        .or(orClause) // USANDO CLÁUSULA DINÂMICA
        .order('Conta', { ascending: true });
        
      if (pcError) throw pcError;
      const planoContas = planoContasData as PlanoContas[];
      
      // 2. Buscar Contas de Saldo (para saldos iniciais)
      const { data: saldoContasData, error: scError } = await supabase
        .from('saldo_contas')
        .select('id, conta_contabil_id, saldo_inicial')
        .eq('proprietario_id', empresaId);
        
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
      
      // 4. Calcular o saldo de cada conta contábil (apenas analíticas)
      const movimentosMap = lancamentosData.reduce((acc, l) => {
        if (l.conta_contabil_id) {
          const conta = planoContas.find(pc => pc.id === l.conta_contabil_id);
          const tipoPrincipal = conta ? getTipoDRE(conta.Conta, configMap) : 'Outros';
          
          let valor = 0;
          
          // Contas de Natureza Devedora (Ativo, Custo, Despesa)
          const isDevedora = tipoPrincipal === 'Ativo' || 
                             (tipoPrincipal === 'Resultado' && (conta?.Conta.startsWith(custoCode) || conta?.Conta.startsWith(despesaCode)));

          // Contas de Natureza Credora (Passivo, PL, Receita)
          const isCredora = tipoPrincipal === 'Passivo' || 
                            tipoPrincipal === 'Patrimonio Liquido' || 
                            (tipoPrincipal === 'Resultado' && conta?.Conta.startsWith(receitaCode));

          // CORREÇÃO 2: Lógica de Débito/Crédito
          if (isDevedora) {
              // Débito (Entrada) aumenta, Crédito (Saída) diminui
              valor = l.tipo === 'Entrada' ? l.valor : -l.valor;
          } else if (isCredora) {
              // Crédito (Entrada) aumenta, Débito (Saída) diminui
              // Nota: No nosso sistema, Recebimento/Receita é 'Entrada', Pagamento/Despesa é 'Saida'.
              // Para contas Credoras (Passivo, PL, Receita), o saldo aumenta com 'Entrada' (Crédito) e diminui com 'Saída' (Débito).
              valor = l.tipo === 'Entrada' ? l.valor : -l.valor;
          }
          
          acc[l.conta_contabil_id] = (acc[l.conta_contabil_id] || 0) + valor;
        }
        return acc;
      }, {} as Record<string, number>);
      
      // 5. Calcular o saldo base (apenas analíticas e sintéticas que podem ter saldo inicial)
      let contasCalculadas: ContaBalanco[] = planoContas.map(pc => {
        const saldoInicial = saldoInicialMap[pc.id] || 0;
        const movimentos = movimentosMap[pc.id] || 0;
        
        let saldo_final = 0;
        const tipoPrincipal = getTipoDRE(pc.Conta, configMap);
        
        // Se for conta de saldo (Caixa/Banco) ou Patrimonial, o saldo é Inicial + Movimentos
        if (pc.is_conta_caixa_banco || pc.is_conta_patrimonial) {
            saldo_final = saldoInicial + movimentos;
        } 
        // Se for conta de Resultado (DRE), o saldo é apenas o movimento do período
        else if (pc.is_conta_resultado) {
            saldo_final = movimentos;
        }
        // Se for Patrimônio Líquido (PL), o saldo é Inicial + Movimentos
        else if (tipoPrincipal === 'Patrimonio Liquido') {
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
          tipo_principal: tipoPrincipal,
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
  }, [empresaId, endDateISO, refreshKey, loadingConfig, configMap]);

  useEffect(() => {
    if (!carregandoSessao && empresaId && !loadingConfig) {
      fetchBalanco();
    }
  }, [carregandoSessao, empresaId, fetchBalanco, loadingConfig]);
  
  // 8. Calcular totais
  // NOVO CÁLCULO: Busca o saldo consolidado da conta de nível 1 (ex: '1')
  const getTotalPorGrupo = (codigoBase: string) => {
      // Soma todas as contas (analíticas e sintéticas) que pertencem a um grupo
      return contasBalanco
          .filter(c => c.Conta === codigoBase || c.Conta.startsWith(`${codigoBase}.`))
          .reduce((sum, c) => sum + (c.saldo_final || 0), 0);
  };
  
  const totalAtivo = getTotalPorGrupo(configMap.Ativo || '1');
  const totalPassivoBase = getTotalPorGrupo(configMap.Passivo || '2'); // Passivo (código 2)
  const totalPLBase = getTotalPorGrupo(configMap['Patrimonio Liquido'] || '3'); // Patrimônio Líquido (código 3)
    
  // O Resultado Líquido é a soma de todas as contas de Resultado (Receita - Custo - Despesa)
  const totalReceita = contasBalanco
      .filter(c => c.tipo_principal === 'Resultado' && c.Conta.startsWith(configMap.Receita || '4'))
      .reduce((sum, c) => sum + c.saldo_final, 0);
      
  const totalCusto = contasBalanco
      .filter(c => c.tipo_principal === 'Resultado' && c.Conta.startsWith(configMap.Custo || '5'))
      .reduce((sum, c) => sum + c.saldo_final, 0);
      
  const totalDespesa = contasBalanco
      .filter(c => c.tipo_principal === 'Resultado' && c.Conta.startsWith(configMap.Despesa || '6'))
      .reduce((sum, c) => sum + c.saldo_final, 0);
      
  const resultadoLiquido = totalReceita - totalCusto - totalDespesa;
  
  // NOVO CÁLCULO: Total do lado direito (Passivo + PL + Resultado Líquido)
  const totalPassivoPL = totalPassivoBase + totalPLBase + resultadoLiquido;

  return {
    contas: contasBalanco,
    totalAtivo,
    totalPassivo: totalPassivoBase, // Retorna o Passivo real (código 2)
    totalPatrimonioLiquido: totalPLBase, // Retorna o PL real (código 3)
    resultadoLiquido,
    totalPassivoPL, // NOVO RETORNO
    carregando,
    refetch,
  };
}