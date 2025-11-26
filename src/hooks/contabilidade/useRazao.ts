import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { useSessao } from '../use-sessao';
import { PlanoContas } from '@/types/plano-contas';
import { Lancamento } from '@/types/lancamento';
import { useContabilConfig } from '../use-contabil-config';
import { format, parseISO } from 'date-fns';
import { DateRange } from 'react-day-picker';

// Tipo auxiliar para a conta
interface ContaRazao extends PlanoContas {
  natureza_contabil: 'Devedora' | 'Credora';
}

interface LancamentoRazao extends Lancamento {
    saldo_anterior: number;
    saldo_acumulado: number;
}

interface RazaoHook {
  contas: ContaRazao[];
  lancamentosPorConta: Record<string, LancamentoRazao[]>;
  contasContabeis: PlanoContas[]; // Apenas analíticas
  carregando: boolean;
  refetch: () => void;
}

// NOVO TIPO AUXILIAR
interface SaldoInicialMap {
    [contaContabilId: string]: number;
}

/**
 * Hook para calcular o Livro Razão.
 * O Razão mostra o movimento detalhado (lançamentos) e o saldo acumulado
 * para cada conta analítica dentro de um período.
 */
export const useRazao = (filtroPeriodo: DateRange | undefined): RazaoHook => {
  const { usuario } = useSessao();
  const { configMap } = useContabilConfig();
  const [contas, setContas] = useState<ContaRazao[]>([]);
  const [lancamentosPorConta, setLancamentosPorConta] = useState<Record<string, LancamentoRazao[]>>({});
  const [contasContabeis, setContasContabeis] = useState<PlanoContas[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const refetch = useCallback(() => {
      setRefreshKey(prev => prev + 1);
  }, []);

  // 1. Função para determinar a natureza da conta (Devedora/Credora)
  const getNatureza = useCallback((conta: PlanoContas): 'Devedora' | 'Credora' => {
    const prefix = conta.Conta.split('.')[0];
    return prefix === (configMap.Ativo || '1') ? 'Devedora' : 'Credora';
  }, [configMap]);
  
  // 2. Função para calcular o Saldo Inicial (acumulado antes do período)
  const calcularSaldoInicial = useCallback((conta: PlanoContas, lancamentosAnteriores: Lancamento[], saldosIniciais: SaldoInicialMap) => {
    let saldo = saldosIniciais[conta.id] || 0;
    const natureza = getNatureza(conta);
    
    for (const lancamento of lancamentosAnteriores) {
        const valor = Math.abs(parseFloat(lancamento.valor));
        
        if (natureza === 'Devedora') {
            if (lancamento.tipo === 'Entrada') saldo += valor;
            else if (lancamento.tipo === 'Saida') saldo -= valor;
        } else { // Credora
            if (lancamento.tipo === 'Entrada') saldo -= valor;
            else if (lancamento.tipo === 'Saida') saldo += valor;
        }
    }
    return saldo;
  }, [getNatureza]);

  // 3. Função principal de cálculo
  const calcularRazao = useCallback((contasAnaliticas: PlanoContas[], lancamentosPeriodo: Lancamento[], lancamentosAnteriores: Lancamento[], saldosIniciais: SaldoInicialMap) => {
    
    const lancamentosPorContaMap: Record<string, LancamentoRazao[]> = {};
    const contasRazao: ContaRazao[] = [];

    for (const conta of contasAnaliticas) {
        const contaId = conta.id;
        const natureza = getNatureza(conta);
        
        // 3.1. Calcular Saldo Inicial
        const lancamentosAntes = lancamentosAnteriores.filter(l => l.conta_contabil_id === contaId);
        let saldoAcumulado = calcularSaldoInicial(conta, lancamentosAntes, saldosIniciais);
        
        // 3.2. Processar Lançamentos do Período
        const lancamentosDoPeriodo = lancamentosPeriodo.filter(l => l.conta_contabil_id === contaId)
            .sort((a, b) => parseISO(a.data_movimentacao).getTime() - parseISO(b.data_movimentacao).getTime());
            
        const lancamentosRazao: LancamentoRazao[] = [];
        
        for (const lancamento of lancamentosDoPeriodo) {
            const valor = Math.abs(parseFloat(lancamento.valor));
            const saldoAnterior = saldoAcumulado;
            
            if (natureza === 'Devedora') {
                if (lancamento.tipo === 'Entrada') saldoAcumulado += valor;
                else if (lancamento.tipo === 'Saida') saldoAcumulado -= valor;
            } else { // Credora
                if (lancamento.tipo === 'Entrada') saldoAcumulado -= valor;
                else if (lancamento.tipo === 'Saida') saldoAcumulado += valor;
            }
            
            lancamentosRazao.push({
                ...lancamento,
                valor, // Valor absoluto
                saldo_anterior: saldoAnterior,
                saldo_acumulado: saldoAcumulado,
            } as LancamentoRazao);
        }
        
        if (lancamentosRazao.length > 0 || saldoAcumulado !== 0) {
            lancamentosPorContaMap[contaId] = lancamentosRazao;
            contasRazao.push({ ...conta, natureza_contabil: natureza });
        }
    }
    
    return { contasRazao, lancamentosPorContaMap };
  }, [calcularSaldoInicial, getNatureza]);

  const fetchRazao = useCallback(async () => {
    if (!usuario?.id || !filtroPeriodo?.from || !filtroPeriodo?.to) {
      setLoading(false);
      return;
    }

    setLoading(true);
    
    const dataInicio = filtroPeriodo.from;
    const dataFim = filtroPeriodo.to;
    
    const startOfPeriod = format(dataInicio, 'yyyy-MM-dd') + 'T00:00:00Z';
    const endOfPeriod = format(dataFim, 'yyyy-MM-dd') + 'T23:59:59Z';
    const beforePeriod = format(dataInicio, 'yyyy-MM-dd') + 'T00:00:00Z';

    // 1. Buscar Plano de Contas (apenas analíticas)
    const { data: contasData, error: contasError } = await supabase
        .from('plano_contas')
        .select('*')
        .eq('proprietario_id', usuario.id)
        .eq('Analitica', 'Sim')
        .order('Conta');

    if (contasError) {
        showError('Erro ao carregar Plano de Contas: ' + contasError.message);
        setLoading(false);
        return;
    }
    
    // 2. Buscar TODOS os Lançamentos (para o período e anteriores)
    const { data: lancamentosData, error: lError } = await supabase
        .from('lancamentos')
        .select('valor, tipo, conta_contabil_id, data_movimentacao, descricao, origem')
        .eq('proprietario_id', usuario.id)
        .neq('origem', 'movimentacao_direta_estornada') // Ignora lançamentos originais estornados
        .order('data_movimentacao', { ascending: true });

    if (lError) {
        showError('Erro ao carregar lançamentos: ' + lError.message);
        setLoading(false);
        return;
    }
    
    // 3. Separar Lançamentos
    const lancamentosPeriodo = (lancamentosData as Lancamento[]).filter(l => 
        parseISO(l.data_movimentacao) >= parseISO(startOfPeriod) && 
        parseISO(l.data_movimentacao) <= parseISO(endOfPeriod)
    );
    
    const lancamentosAnteriores = (lancamentosData as Lancamento[]).filter(l => 
        parseISO(l.data_movimentacao) < parseISO(beforePeriod)
    );
    
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

    const contasAnaliticas = contasData as PlanoContas[];
    
    const { contasRazao, lancamentosPorContaMap } = calcularRazao(
        contasAnaliticas, 
        lancamentosPeriodo, 
        lancamentosAnteriores,
        saldosIniciaisMap
    );
    
    setContas(contasRazao);
    setLancamentosPorConta(lancamentosPorContaMap);
    setContasContabeis(contasAnaliticas);
    setLoading(false);
  }, [usuario?.id, filtroPeriodo, calcularRazao]);

  useEffect(() => {
    fetchRazao();
  }, [fetchRazao, refreshKey]);

  return {
    contas,
    lancamentosPorConta,
    contasContabeis,
    carregando: loading,
    refetch,
  };
};