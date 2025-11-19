import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { useSessao } from './use-sessao';
import { PlanoContas } from '@/types/plano-contas';
import { Lancamento } from '@/types/lancamento';
import { useContabilConfig } from './use-contabil-config';
import { format } from 'date-fns';

interface ContaDRE extends PlanoContas {
  saldo_final: number;
  tipo_dre: 'Receita' | 'Custo' | 'Despesa' | 'Resultado';
  filhas: ContaDRE[];
}

interface DREHook {
  contas: ContaDRE[];
  loading: boolean;
  totalReceita: number;
  totalCusto: number;
  totalDespesa: number;
  resultadoLiquido: number;
  refetch: () => void;
}

export const useDRE = (filtroPeriodo: { from: Date | undefined, to: Date | undefined } | undefined): DREHook => {
  const { usuario } = useSessao();
  const { configMap } = useContabilConfig();
  const [dre, setDre] = useState<ContaDRE[]>([]);
  const [loading, setLoading] = useState(true);
  
  const dataInicio = filtroPeriodo?.from;
  const dataFim = filtroPeriodo?.to;

  const calcularSaldo = useCallback((lancamentos: Lancamento[], conta: PlanoContas) => {
    let saldo = 0;
    
    // Determine if the account is Devedora (Custo, Despesa) or Credora (Receita)
    const contaPrefix = conta.Conta.split('.')[0];
    
    // Custo (5) e Despesa (6) são Devedoras. Receita (4) é Credora.
    const isDevedora = [configMap.Custo, configMap.Despesa].includes(contaPrefix); 
    
    for (const lancamento of lancamentos) {
        const valor = parseFloat(lancamento.valor);
        
        if (isDevedora) {
            // Contas Devedoras (Custo, Despesa): Entrada (Débito) aumenta (+), Saída (Crédito) diminui (-)
            if (lancamento.tipo === 'Entrada') {
                saldo += valor;
            } else if (lancamento.tipo === 'Saida') {
                saldo -= valor;
            }
        } else {
            // Contas Credoras (Receita): Entrada (Débito) diminui (-), Saída (Crédito) aumenta (+)
            if (lancamento.tipo === 'Entrada') {
                saldo -= valor;
            } else if (lancamento.tipo === 'Saida') {
                saldo += valor;
            }
        }
    }
    return saldo;
  }, [configMap]);

  const getSomaPorTipo = useCallback((contas: ContaDRE[], prefix: string) => {
    // Busca a soma do saldo_final de todas as contas que começam com o prefixo
    return contas.filter(c => c.Conta.startsWith(prefix)).reduce((sum, c) => sum + c.saldo_final, 0);
  }, []);

  const calcularSaldosRecursivo = useCallback((contas: PlanoContas[], lancamentos: Lancamento[]): ContaDRE[] => {
    
    const mapContas = (contas: PlanoContas[]): ContaDRE[] => {
        return contas.map(conta => {
            const lancamentosDaConta = lancamentos.filter(l => l.conta_contabil_id === conta.id);
            const saldo = calcularSaldo(lancamentosDaConta, conta);
            
            // Determine the DRE type based on prefix
            const prefix = conta.Conta.split('.')[0];
            let tipo_dre: ContaDRE['tipo_dre'] = 'Resultado';
            
            if (prefix === (configMap.Receita || '4')) tipo_dre = 'Receita';
            else if (prefix === (configMap.Custo || '5')) tipo_dre = 'Custo';
            else if (prefix === (configMap.Despesa || '6')) tipo_dre = 'Despesa';

            return {
                ...conta,
                saldo_final: saldo, 
                tipo_dre: tipo_dre,
                filhas: [], // Simplified
            } as ContaDRE;
        });
    };
    
    // Filter only Result accounts (4, 5, 6)
    const contasResultado = contas.filter(c => c.is_conta_resultado);
    
    return mapContas(contasResultado);
  }, [calcularSaldo, configMap]);

  const fetchDRE = useCallback(async () => {
    if (!usuario?.id || !dataInicio || !dataFim) {
      setLoading(false);
      return;
    }

    setLoading(true);
    
    // CORREÇÃO: Usando o fuso horário local para definir o início e o fim do dia
    const startOfDayLocal = format(dataInicio, 'yyyy-MM-dd') + 'T00:00:00-03:00'; // Assumindo UTC-3 (America/Sao_Paulo)
    const endOfDayLocal = format(dataFim, 'yyyy-MM-dd') + 'T23:59:59-03:00'; // Assumindo UTC-3 (America/Sao_Paulo)
    
    // 1. Buscar todas as contas de resultado (4, 5, 6)
    const { data: contasData, error: contasError } = await supabase
        .from('plano_contas')
        .select('*')
        .eq('proprietario_id', usuario.id)
        .eq('is_conta_resultado', true)
        .order('Conta');

    if (contasError) {
        showError('Erro ao carregar Plano de Contas para DRE: ' + contasError.message);
        setLoading(false);
        return;
    }
    
    // 2. Buscar lançamentos dentro do período
    const { data: lancamentosData, error: lancamentosError } = await supabase
        .from('lancamentos')
        .select('*')
        .eq('proprietario_id', usuario.id)
        .gte('data_movimentacao', startOfDayLocal)
        .lte('data_movimentacao', endOfDayLocal);

    if (lancamentosError) {
        showError('Erro ao carregar lançamentos para DRE: ' + lancamentosError.message);
        setLoading(false);
        return;
    }
    
    const contasPlanas = contasData as PlanoContas[];
    const dreCalculada = calcularSaldosRecursivo(contasPlanas, lancamentosData as Lancamento[]);
    
    setDre(dreCalculada);
    setLoading(false);
  }, [usuario?.id, dataInicio, dataFim, calcularSaldosRecursivo]);

  useEffect(() => {
    fetchDRE();
  }, [fetchDRE]);

  // Funções de soma para o resumo da DRE
  const totalReceita = getSomaPorTipo(dre, configMap.Receita || '4');
  const totalCusto = getSomaPorTipo(dre, configMap.Custo || '5');
  const totalDespesa = getSomaPorTipo(dre, configMap.Despesa || '6');
  
  const resultadoLiquido = totalReceita - totalCusto - totalDespesa;

  return {
    contas: dre,
    loading,
    totalReceita,
    totalCusto,
    totalDespesa,
    resultadoLiquido,
    refetch: fetchDRE,
  };
};