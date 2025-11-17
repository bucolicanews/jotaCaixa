import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { useSessao } from './use-sessao';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { PlanoContas } from '@/types/plano-contas';
import { SaldoConta } from '@/types/saldo-conta';
import { format } from 'date-fns';
import { useContabilConfig, ContabilConfigMap } from './use-contabil-config';

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
  totalPassivoPL: number; // Total do lado direito (2 + 3 + Resultado)
  carregando: boolean;
  refetch: () => void;
}

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
 * Consolidação robusta:
 * 1. Inicializa o mapa de saldos consolidados com 0 para todas as contas.
 * 2. Itera sobre as contas analíticas (que têm saldo base calculado) e propaga esse saldo
 *    para todos os seus ancestrais sintéticos.
 * 3. O saldo final de uma conta sintética é a soma de todos os saldos propagados.
 */
const consolidateBalances = (contas: ContaBalanco[]): ContaBalanco[] => {
    const consolidated: Record<string, number> = {};
    const contaMap: Record<string, ContaBalanco> = {};

    // 1. Inicializa o mapa de saldos e o mapa de contas
    for (const c of contas) {
        consolidated[c.Conta] = 0;
        contaMap[c.Conta] = c;
    }

    // 2. Itera sobre as contas analíticas (que têm o saldo base)
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
                // Se o pai é sintético, adiciona o saldo base
                consolidated[parentCode] = (consolidated[parentCode] || 0) + saldoBase;
            }
            
            currentCode = parentCode;
        }
    }

    // 3. Atualiza objetos de conta com saldo_final consolidado
    return contas.map(c => ({
        ...c,
        saldo_final: consolidated[c.Conta] ?? 0,
    }));
};

export function useBalancoPatrimonial(endDate: Date | undefined): BalancoData {
  const { usuario, perfil, role, carregando: carregandoSessao } = useSessao();
  const { configMap, loading: loadingConfig } = useContabilConfig();
  const [contasBalanco, setContasBalanco] = useState<ContaBalanco[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const getEmpresaId = () => {
    if (role === 'Admin') return usuario?.id || null;
    if (role === 'Cliente') return (perfil as ClienteProfile)?.id || null;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id || null; // FIX: proprietario_id -> cliente_id
    return null;
  };

  const empresaId = getEmpresaId();
  const endDateISO = endDate ? format(endDate, 'yyyy-MM-dd') : undefined;

  const refetch = useCallback(() => setRefreshKey(k => k + 1), []);

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

    const orClause = [
      `Conta.eq.${ativoCode}`, `Conta.like.${ativoCode}.%`,
      `Conta.eq.${passivoCode}`, `Conta.like.${passivoCode}.%`,
      `Conta.eq.${plCode}`, `Conta.like.${plCode}.%`,
      `Conta.eq.${receitaCode}`, `Conta.like.${receitaCode}.%`,
      `Conta.eq.${custoCode}`, `Conta.like.${custoCode}.%`,
      `Conta.eq.${despesaCode}`, `Conta.like.${despesaCode}.%`,
    ].join(',');

    try {
      const { data: planoContasData, error: pcError } = await supabase
        .from('plano_contas')
        .select('*')
        .eq('proprietario_id', empresaId)
        .or(orClause)
        .order('Conta', { ascending: true });

      if (pcError) throw pcError;
      const planoContas = planoContasData as PlanoContas[];

      const { data: saldoContasData, error: scError } = await supabase
        .from('saldo_contas')
        .select('id, conta_contabil_id, saldo_inicial')
        .eq('proprietario_id', empresaId);

      if (scError) throw scError;
      const saldoContas = saldoContasData as SaldoConta[];

      const saldoInicialMap = saldoContas.reduce((acc, sc) => {
        if (sc.conta_contabil_id) acc[sc.conta_contabil_id] = (acc[sc.conta_contabil_id] || 0) + sc.saldo_inicial;
        return acc;
      }, {} as Record<string, number>);

      const { data: lancamentosData, error: lError } = await supabase
        .from('lancamentos')
        .select('valor, tipo, conta_contabil_id')
        .eq('proprietario_id', empresaId)
        .lte('data_movimentacao', endDateISO);

      if (lError) throw lError;

      const movimentosMap = (lancamentosData || []).reduce((acc, l: any) => {
        if (l.conta_contabil_id) {
          const conta = planoContas.find(pc => pc.id === l.conta_contabil_id);
          const tipoPrincipal = conta ? getTipoDRE(conta.Conta, configMap) : 'Outros';

          let valor = 0;
          
          if (tipoPrincipal === 'Ativo' || tipoPrincipal === 'Passivo' || tipoPrincipal === 'Patrimonio Liquido') {
              // Contas Patrimoniais (Ativo/Passivo/PL)
              // Ativo (1.x.x): Entrada = Débito (+), Saída = Crédito (-)
              // Passivo/PL (2.x.x/3.x.x): Entrada = Crédito (+), Saída = Débito (-)
              
              const isAtivo = tipoPrincipal === 'Ativo';
              
              if (isAtivo) {
                  valor = l.tipo === 'Entrada' ? l.valor : -l.valor;
              } else {
                  // Passivo/PL: Inverte o sinal do lançamento para refletir o saldo credor
                  valor = l.tipo === 'Entrada' ? l.valor : -l.valor;
              }
              
          } else if (tipoPrincipal === 'Resultado' && conta?.is_conta_resultado) {
              // Contas de Resultado (4.x.x, 5.x.x, 6.x.x)
              // Receita (4.x.x): Entrada = Crédito (+), Saída = Débito (-)
              // Custo/Despesa (5.x.x/6.x.x): Entrada = Débito (+), Saída = Crédito (-)
              
              const isReceita = conta.Conta.startsWith(receitaCode);
              
              if (isReceita) {
                  // Receita: Entrada (Crédito) = +, Saída (Débito) = -
                  valor = l.tipo === 'Entrada' ? l.valor : -l.valor;
              } else {
                  // Custo/Despesa: Entrada (Débito) = +, Saída (Crédito) = -
                  valor = l.tipo === 'Saida' ? -l.valor : l.valor; // Inverte o sinal para que o saldo seja positivo
              }
          }

          acc[l.conta_contabil_id] = (acc[l.conta_contabil_id] || 0) + (valor || 0);
        }
        return acc;
      }, {} as Record<string, number>);

      // 5. Calcular o saldo base (apenas analíticas)
      let contasCalculadas: ContaBalanco[] = (planoContas || []).map(pc => {
        const saldoInicial = saldoInicialMap[pc.id] || 0;
        const movimentos = movimentosMap[pc.id] || 0;
        const tipoPrincipal = getTipoDRE(pc.Conta, configMap);

        let saldo_final = 0;
        
        if (pc.Analitica === 'Sim') {
            // Saldo Analítico = Saldo Inicial + Movimentos
            saldo_final = saldoInicial + movimentos;
        } else {
            // Sintéticas e não analíticas começam com 0 (serão consolidadas)
            saldo_final = 0;
        }

        return {
          ...pc,
          saldo_final,
          tipo_principal: tipoPrincipal,
        } as ContaBalanco;
      });

      // 6. Consolidar saldos das contas analíticas para as sintéticas
      contasCalculadas = consolidateBalances(contasCalculadas);

      // 7. Ordenar para exibição
      contasCalculadas.sort(compareContas);

      setContasBalanco(contasCalculadas);

    } catch (error: any) {
      console.error('Erro ao calcular balanço:', error);
      showError('Falha ao carregar dados do balanço: ' + (error?.message || error));
      setContasBalanco([]);
    } finally {
      setCarregando(false);
    }
  }, [empresaId, endDateISO, refreshKey, loadingConfig, configMap]);

  useEffect(() => {
    if (!carregandoSessao && empresaId && !loadingConfig) fetchBalanco();
  }, [carregandoSessao, empresaId, fetchBalanco, loadingConfig]);
  
  // 8. Calcular totais
  const getSaldoConsolidadoNivel1 = (codigo: string) => {
    const found = contasBalanco.find(c => c.Conta === codigo);
    return found ? (found.saldo_final || 0) : 0;
  };

  const ativoCode = configMap.Ativo || '1';
  const passivoCode = configMap.Passivo || '2';
  const plCode = configMap['Patrimonio Liquido'] || '3';
  const receitaCode = configMap.Receita || '4';
  const custoCode = configMap.Custo || '5';
  const despesaCode = configMap.Despesa || '6';

  // Totais de Nível 1 (usando o saldo consolidado)
  const totalAtivo = getSaldoConsolidadoNivel1(ativoCode);
  const totalPassivoBase = getSaldoConsolidadoNivel1(passivoCode);
  const totalPatrimonioLiquido = getSaldoConsolidadoNivel1(plCode);
    
  // Resultado: usar os saldos consolidados dos níveis de DRE (4,5,6)
  const totalReceita = getSaldoConsolidadoNivel1(receitaCode);
  const totalCusto = getSaldoConsolidadoNivel1(custoCode);
  const totalDespesa = getSaldoConsolidadoNivel1(despesaCode);
      
  // Resultado Líquido: Receita - Custo - Despesa
  const resultadoLiquido = totalReceita - totalCusto - totalDespesa;
  
  // Total do lado direito (Passivo + PL + Resultado Líquido)
  const totalPassivoPL = (totalPassivoBase || 0) + (totalPatrimonioLiquido || 0) + (resultadoLiquido || 0);

  return {
    contas: contasBalanco,
    totalAtivo,
    totalPassivo: totalPassivoBase,
    totalPatrimonioLiquido,
    resultadoLiquido,
    totalPassivoPL,
    carregando,
    refetch,
  };
}