import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { useSessao } from './use-sessao';
import { PlanoContas } from '@/types/plano-contas';
import { Lancamento } from '@/types/lancamento';
import { useContabilConfig } from './use-contabil-config';
import { format } from 'date-fns';

interface ContaBP extends PlanoContas {
  saldo_final: number;
  tipo_principal: 'Ativo' | 'Passivo' | 'Patrimonio Liquido' | 'Resultado' | 'Outros';
  filhas: ContaBP[];
}

interface BalancoPatrimonialHook {
  contas: ContaBP[];
  totalAtivo: number;
  totalPassivo: number;
  totalPatrimonioLiquido: number;
  resultadoLiquido: number;
  totalPassivoPL: number;
  carregando: boolean;
  refetch: () => void;
}

// NOVO TIPO AUXILIAR
interface SaldoInicialMap {
    [contaContabilId: string]: number;
}

export const useBalancoPatrimonial = (dataFim: Date | null): BalancoPatrimonialHook => {
  const { usuario } = useSessao();
  const { configMap } = useContabilConfig();
  const [balanco, setBalanco] = useState<ContaBP[]>([]);
  const [loading, setLoading] = useState(true);

  const calcularSaldo = useCallback((lancamentos: Lancamento[], conta: PlanoContas, saldoInicial: number) => {
    let saldo = saldoInicial; // INCLUINDO SALDO INICIAL
    
    // Determine if the account is Devedora (Ativo) or Credora (Passivo, PL, Receita, Custo, Despesa)
    const contaPrefix = conta.Conta.split('.')[0];
    
    // CORREÇÃO CRÍTICA: Ativo (1) é Devedora. Passivo (2), PL (3), Receita (4), Custo (5) e Despesa (6) são Credoras.
    const isDevedora = [configMap.Ativo].includes(contaPrefix); 
    
    for (const lancamento of lancamentos) {
        const valor = parseFloat(lancamento.valor);
        
        if (isDevedora) {
            // Contas Devedoras (Ativo): Entrada (Débito) aumenta (+), Saída (Crédito) diminui (-)
            if (lancamento.tipo === 'Entrada') {
                saldo += valor;
            } else if (lancamento.tipo === 'Saida') {
                saldo -= valor;
            }
        } else {
            // Contas Credoras (Passivo, PL, Resultado): Entrada (Débito) diminui (-), Saída (Crédito) aumenta (+)
            if (lancamento.tipo === 'Entrada') {
                saldo -= valor;
            } else if (lancamento.tipo === 'Saida') {
                saldo += valor;
            }
        }
    }
    return saldo;
  }, [configMap]);

  const calcularSaldosRecursivo = useCallback((contas: PlanoContas[], lancamentos: Lancamento[], saldosIniciais: SaldoInicialMap): ContaBP[] => {
    
    const mapContas = (contas: PlanoContas[]): ContaBP[] => {
        return contas.map(conta => {
            const lancamentosDaConta = lancamentos.filter(l => l.conta_contabil_id === conta.id);
            const saldoInicial = saldosIniciais[conta.id] || 0; // Obtém o saldo inicial
            const saldo = calcularSaldo(lancamentosDaConta, conta, saldoInicial); // Passa o saldo inicial
            
            // Determine the main type based on prefix
            const prefix = conta.Conta.split('.')[0];
            let tipo_principal: ContaBP['tipo_principal'] = 'Outros';
            
            if (prefix === (configMap.Ativo || '1')) tipo_principal = 'Ativo';
            else if (prefix === (configMap.Passivo || '2')) tipo_principal = 'Passivo';
            else if (prefix === (configMap['Patrimonio Liquido'] || '3')) tipo_principal = 'Patrimonio Liquido';
            else if (conta.is_conta_resultado) tipo_principal = 'Resultado'; // Contas 4, 5, 6

            return {
                ...conta,
                saldo_final: saldo, 
                tipo_principal: tipo_principal,
                filhas: [], // Simplified
            } as ContaBP;
        });
    };
    
    // Filter only relevant accounts (Patrimonial and Result)
    const contasRelevantes = contas.filter(c => 
        c.is_conta_patrimonial || c.is_conta_resultado
    );
    
    return mapContas(contasRelevantes);
  }, [calcularSaldo, configMap]);

  const fetchBalanco = useCallback(async () => {
    if (!usuario?.id || !dataFim) return;

    setLoading(true);
    
    // 1. Buscar todas as contas relevantes (Patrimonial e Resultado)
    const { data: contasData, error: contasError } = await supabase
        .from('plano_contas')
        .select('*')
        .eq('proprietario_id', usuario.id)
        .or('is_conta_patrimonial.eq.true,is_conta_resultado.eq.true')
        .order('Conta');

    if (contasError) {
        showError('Erro ao carregar Plano de Contas para Balanço: ' + contasError.message);
        setLoading(false);
        return;
    }
    
    // 2. Buscar lançamentos até a data final
    const { data: lancamentosData, error: lancamentosError } = await supabase
        .from('lancamentos')
        .select('*')
        .eq('proprietario_id', usuario.id)
        .lte('data_movimentacao', format(dataFim, 'yyyy-MM-dd') + 'T23:59:59Z');

    if (lancamentosError) {
        showError('Erro ao carregar lançamentos para Balanço: ' + lancamentosError.message);
        setLoading(false);
        return;
    }
    
    // 3. Buscar saldos iniciais de contas patrimoniais (da tabela saldo_contas)
    const { data: saldosIniciaisData, error: saldosError } = await supabase
        .from('saldo_contas')
        .select('conta_contabil_id, saldo_inicial')
        .eq('proprietario_id', usuario.id)
        .not('conta_contabil_id', 'is', null);
        
    if (saldosError) {
        console.error('Erro ao buscar saldos iniciais:', saldosError);
    }
    
    const saldosIniciaisMap: SaldoInicialMap = (saldosIniciaisData || []).reduce((acc, s) => {
        if (s.conta_contabil_id) {
            // Se houver múltiplas entradas em saldo_contas para a mesma conta contábil, soma os saldos iniciais
            acc[s.conta_contabil_id] = (acc[s.conta_contabil_id] || 0) + s.saldo_inicial;
        }
        return acc;
    }, {} as SaldoInicialMap);
    
    const contasPlanas = contasData as PlanoContas[];
    const balancoCalculado = calcularSaldosRecursivo(contasPlanas, lancamentosData as Lancamento[], saldosIniciaisMap);
    
    setBalanco(balancoCalculado);
    setLoading(false);
  }, [usuario?.id, dataFim, calcularSaldosRecursivo]);

  useEffect(() => {
    fetchBalanco();
  }, [fetchBalanco]);

  // Calculate totals
  const totalAtivo = balanco.filter(c => c.tipo_principal === 'Ativo').reduce((sum, c) => sum + c.saldo_final, 0);
  const totalPassivo = balanco.filter(c => c.tipo_principal === 'Passivo').reduce((sum, c) => sum + c.saldo_final, 0);
  const totalPatrimonioLiquido = balanco.filter(c => c.tipo_principal === 'Patrimonio Liquido').reduce((sum, c) => sum + c.saldo_final, 0);
  
  // Calculate DRE result (Resultado Líquido)
  const getSomaPorTipo = (contas: ContaBP[], prefix: string) => {
    return contas.filter(c => c.Conta.startsWith(prefix)).reduce((sum, c) => sum + c.saldo_final, 0);
  };
  
  const totalReceita = getSomaPorTipo(balanco, configMap.Receita || '4');
  
  // Custo e Despesa são Credoras no Balanço, mas para o cálculo do Resultado Líquido,
  // precisamos do valor absoluto (positivo) para subtrair da Receita.
  const totalCusto = Math.abs(getSomaPorTipo(balanco, configMap.Custo || '5'));
  const totalDespesa = Math.abs(getSomaPorTipo(balanco, configMap.Despesa || '6'));
  
  const resultadoLiquido = totalReceita - totalCusto - totalDespesa;
  
  // Total Passivo + PL (incluindo o resultado líquido)
  const totalPassivoPL = totalPassivo + totalPatrimonioLiquido + resultadoLiquido;

  return {
    contas: balanco,
    totalAtivo,
    totalPassivo,
    totalPatrimonioLiquido,
    resultadoLiquido,
    totalPassivoPL,
    carregando: loading,
    refetch: fetchBalanco,
  };
};