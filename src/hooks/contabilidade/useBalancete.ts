import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { useSessao } from '../use-sessao';
import { PlanoContas } from '@/types/plano-contas';
import { Lancamento } from '@/types/lancamento';
import { useContabilConfig } from '../use-contabil-config';
import { format } from 'date-fns';
import { DateRange } from 'react-day-picker';

// Tipo auxiliar para a conta
interface ContaBalancete extends PlanoContas {
  saldo_inicial: number;
  total_debito: number;
  total_credito: number;
  saldo_final: number;
  natureza_final: 'Devedora' | 'Credora';
}

interface TotaisBalancete {
    totalDebito: number;
    totalCredito: number;
    totalSaldoFinal: number;
}

interface BalanceteHook {
  contas: ContaBalancete[];
  totais: TotaisBalancete;
  carregando: boolean;
  refetch: () => void;
}

// NOVO TIPO AUXILIAR
interface SaldoInicialMap {
    [contaContabilId: string]: number;
}

/**
 * Hook para calcular o Balancete de Verificação.
 * O Balancete mostra o saldo inicial, o movimento (Débito/Crédito) do período
 * e o saldo final de TODAS as contas (analíticas e sintéticas).
 */
export const useBalancete = (filtroPeriodo: DateRange | undefined): BalanceteHook => {
  const { usuario } = useSessao();
  const { configMap } = useContabilConfig();
  const [balancete, setBalancete] = useState<ContaBalancete[]>([]);
  const [totais, setTotais] = useState<TotaisBalancete>({ totalDebito: 0, totalCredito: 0, totalSaldoFinal: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const refetch = useCallback(() => {
      setRefreshKey(prev => prev + 1);
  }, []);

  // 1. Função para determinar a natureza da conta (Devedora/Credora)
  const getNatureza = useCallback((conta: PlanoContas): 'Devedora' | 'Credora' => {
    const prefix = conta.Conta.split('.')[0];
    // Ativo (1) é Devedora. Passivo (2), PL (3), Receita (4), Custo (5), Despesa (6) são Credoras.
    return prefix === (configMap.Ativo || '1') ? 'Devedora' : 'Credora';
  }, [configMap]);

  // 2. Função para calcular o saldo de uma conta (Débito/Crédito)
  const calcularMovimento = useCallback((lancamentos: Lancamento[], conta: PlanoContas) => {
    let totalDebito = 0;
    let totalCredito = 0;
    
    for (const lancamento of lancamentos) {
        const valor = Math.abs(parseFloat(lancamento.valor)); // Valor absoluto
        
        // Débito: Lançamento com tipo 'Entrada'
        if (lancamento.tipo === 'Entrada') {
            totalDebito += valor;
        } 
        // Crédito: Lançamento com tipo 'Saida'
        else if (lancamento.tipo === 'Saida') {
            totalCredito += valor;
        }
    }
    
    return { totalDebito, totalCredito };
  }, []);
  
  // 3. Função para calcular o Saldo Inicial (acumulado antes do período)
  const calcularSaldoInicial = useCallback((conta: PlanoContas, lancamentosAnteriores: Lancamento[], saldosIniciais: SaldoInicialMap) => {
    let saldo = saldosIniciais[conta.id] || 0;
    const natureza = getNatureza(conta);
    
    for (const lancamento of lancamentosAnteriores) {
        const valor = Math.abs(parseFloat(lancamento.valor));
        
        if (natureza === 'Devedora') {
            // Devedora (Ativo): Entrada (+) / Saída (-)
            if (lancamento.tipo === 'Entrada') saldo += valor;
            else if (lancamento.tipo === 'Saida') saldo -= valor;
        } else { 
            // Credora (Passivo, PL, Resultado): Entrada (-) / Saída (+)
            if (lancamento.tipo === 'Entrada') saldo -= valor;
            else if (lancamento.tipo === 'Saida') saldo += valor;
        }
    }
    return saldo;
  }, [getNatureza]);

  // 4. Função principal de cálculo
  const calcularBalancete = useCallback((contas: PlanoContas[], lancamentosPeriodo: Lancamento[], lancamentosAnteriores: Lancamento[], saldosIniciais: SaldoInicialMap): ContaBalancete[] => {
    
    // Mapeamento de lançamentos por conta contábil ID
    const lancamentosPeriodoMap = lancamentosPeriodo.reduce((acc, l) => {
        if (l.conta_contabil_id) {
            acc[l.conta_contabil_id] = acc[l.conta_contabil_id] || [];
            acc[l.conta_contabil_id].push(l);
        }
        return acc;
    }, {} as Record<string, Lancamento[]>);
    
    const lancamentosAnterioresMap = lancamentosAnteriores.reduce((acc, l) => {
        if (l.conta_contabil_id) {
            acc[l.conta_contabil_id] = acc[l.conta_contabil_id] || [];
            acc[l.conta_contabil_id].push(l);
        }
        return acc;
    }, {} as Record<string, Lancamento[]>);

    // 4.1. Calcula saldos e movimentos para contas analíticas
    const contasAnaliticasCalculadas: ContaBalancete[] = contas
        .filter(c => c.Analitica === 'Sim')
        .map(conta => {
            const lancamentosDoPeriodo = lancamentosPeriodoMap[conta.id] || [];
            const lancamentosAntes = lancamentosAnterioresMap[conta.id] || [];
            
            const saldoInicial = calcularSaldoInicial(conta, lancamentosAntes, saldosIniciais);
            const { totalDebito, totalCredito } = calcularMovimento(lancamentosDoPeriodo, conta);
            
            const natureza = getNatureza(conta);
            let saldoFinal = saldoInicial + totalDebito - totalCredito;
            
            // Se a natureza for Credora, o saldo final é Crédito - Débito
            if (natureza === 'Credora') {
                // Para contas credoras, o saldo final é Saldo Inicial + Crédito - Débito
                saldoFinal = saldoInicial + totalCredito - totalDebito;
            }
            
            // Ajuste final: Se o saldo for negativo, inverte a natureza para fins de exibição
            const naturezaFinal = saldoFinal >= 0 ? natureza : (natureza === 'Devedora' ? 'Credora' : 'Devedora');
            
            return {
                ...conta,
                saldo_inicial: saldoInicial,
                total_debito: totalDebito,
                total_credito: totalCredito,
                saldo_final: saldoFinal,
                natureza_final: naturezaFinal,
            } as ContaBalancete;
        });
        
    // 4.2. Agrega saldos para contas sintéticas
    const contasSinteticasCalculadas: ContaBalancete[] = contas
        .filter(c => c.Analitica === 'Não')
        .map(contaSintetica => {
            const prefixo = contaSintetica.Conta;
            
            // Soma os valores das contas analíticas filhas
            const filhas = contasAnaliticasCalculadas.filter(c => c.Conta.startsWith(prefixo));
            
            const totalDebito = filhas.reduce((sum, c) => sum + c.total_debito, 0);
            const totalCredito = filhas.reduce((sum, c) => sum + c.total_credito, 0);
            const saldoInicial = filhas.reduce((sum, c) => sum + c.saldo_inicial, 0);
            const saldoFinal = filhas.reduce((sum, c) => sum + c.saldo_final, 0);
            
            const natureza = getNatureza(contaSintetica);
            const naturezaFinal = saldoFinal >= 0 ? natureza : (natureza === 'Devedora' ? 'Credora' : 'Devedora');

            return {
                ...contaSintetica,
                saldo_inicial: saldoInicial,
                total_debito: totalDebito,
                total_credito: totalCredito,
                saldo_final: saldoFinal,
                natureza_final: naturezaFinal,
            } as ContaBalancete;
        });
        
    // 4.3. Combina e ordena
    const balanceteCompleto = [...contasSinteticasCalculadas, ...contasAnaliticasCalculadas]
        .sort((a, b) => a.Conta.localeCompare(b.Conta));
        
    return balanceteCompleto;
  }, [calcularMovimento, calcularSaldoInicial, getNatureza]);

  const fetchBalancete = useCallback(async () => {
    if (!usuario?.id || !filtroPeriodo?.from || !filtroPeriodo?.to) {
      setLoading(false);
      return;
    }

    setLoading(true);
    
    const dataInicio = filtroPeriodo.from;
    const dataFim = filtroPeriodo.to;
    
    // Datas formatadas para o banco (meio-dia UTC para evitar problemas de fuso)
    const startOfPeriod = format(dataInicio, 'yyyy-MM-dd') + 'T00:00:00Z';
    const endOfPeriod = format(dataFim, 'yyyy-MM-dd') + 'T23:59:59Z';
    const beforePeriod = format(dataInicio, 'yyyy-MM-dd') + 'T00:00:00Z'; // Lançamentos antes do período

    // 1. Buscar Plano de Contas (apenas analíticas e sintéticas)
    const { data: contasData, error: contasError } = await supabase
        .from('plano_contas')
        .select('*')
        .eq('proprietario_id', usuario.id)
        .order('Conta');

    if (contasError) {
        showError('Erro ao carregar Plano de Contas: ' + contasError.message);
        setLoading(false);
        return;
    }
    
    // 2. Buscar Lançamentos do Período
    const { data: lancamentosPeriodoData, error: lpError } = await supabase
        .from('lancamentos')
        .select('valor, tipo, conta_contabil_id, origem')
        .eq('proprietario_id', usuario.id)
        .gte('data_movimentacao', startOfPeriod)
        .lte('data_movimentacao', endOfPeriod)
        .neq('origem', 'movimentacao_direta_estornada'); // Ignora lançamentos originais estornados

    if (lpError) {
        showError('Erro ao carregar lançamentos do período: ' + lpError.message);
        setLoading(false);
        return;
    }
    
    // 3. Buscar Lançamentos Anteriores (para Saldo Inicial)
    const { data: lancamentosAnterioresData, error: laError } = await supabase
        .from('lancamentos')
        .select('valor, tipo, conta_contabil_id, origem')
        .eq('proprietario_id', usuario.id)
        .lt('data_movimentacao', beforePeriod)
        .neq('origem', 'movimentacao_direta_estornada'); // Ignora lançamentos originais estornados

    if (laError) {
        showError('Erro ao carregar lançamentos anteriores: ' + laError.message);
        setLoading(false);
        return;
    }
    
    // 4. Buscar saldos iniciais de contas patrimoniais (da tabela saldo_contas)
    const { data: saldosIniciaisData } = await supabase
        .from('saldo_contas')
        .select('conta_contabil_id, saldo_inicial')
        .eq('proprietario_id', usuario.id)
        .not('conta_contabil_id', 'is', null);
        
    const saldosIniciaisMap: SaldoInicialMap = (saldosIniciaisData || []).reduce((acc, s) => {
        if (s.conta_contabil_id) {
            acc[s.conta_contabil_id] = (acc[s.conta_contabil_id] || 0) + s.saldo_inicial;
        }
        return acc;
    }, {} as SaldoInicialMap);

    const contasPlanas = contasData as PlanoContas[];
    const balanceteCalculado = calcularBalancete(
        contasPlanas, 
        lancamentosPeriodoData as Lancamento[], 
        lancamentosAnterioresData as Lancamento[],
        saldosIniciaisMap
    );
    
    // 5. Calcular Totais
    const totalDebito = balanceteCalculado.filter(c => c.Analitica === 'Sim').reduce((sum, c) => sum + c.total_debito, 0);
    const totalCredito = balanceteCalculado.filter(c => c.Analitica === 'Sim').reduce((sum, c) => sum + c.total_credito, 0);
    const totalSaldoFinal = balanceteCalculado.filter(c => c.Analitica === 'Sim').reduce((sum, c) => sum + c.saldo_final, 0);

    setBalancete(balanceteCalculado);
    setTotais({ totalDebito, totalCredito, totalSaldoFinal });
    setLoading(false);
  }, [usuario?.id, filtroPeriodo, calcularBalancete]);

  useEffect(() => {
    fetchBalancete();
  }, [fetchBalancete, refreshKey]);

  return {
    contas: balancete,
    totais,
    carregando: loading,
    refetch,
  };
};