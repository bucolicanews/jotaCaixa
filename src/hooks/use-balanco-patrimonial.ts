import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { useSessao } from './use-sessao';
import { PlanoContas } from '@/types/plano-contas';
import { Lancamento } from '@/types/lancamento';
import { useContabilConfig } from './use-contabil-config';
import { format } from 'date-fns';
import { resolveOwnerContext } from '@/utils/owner';

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
  const { usuario, perfil, role } = useSessao();
  const { configMap } = useContabilConfig();
  const { ownerId } = resolveOwnerContext(role, perfil, usuario?.id);
  const [balanco, setBalanco] = useState<ContaBP[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0); // NOVO ESTADO

  const refetch = useCallback(() => {
      setRefreshKey(prev => prev + 1);
  }, []);

  const calcularSaldo = useCallback((lancamentos: Lancamento[], conta: PlanoContas, saldoInicial: number) => {
    let debitos = 0;
    let creditos = 0;

    for (const lancamento of lancamentos) {
        const valor = Math.abs(parseFloat(String(lancamento.valor)));
        const origem = lancamento.origem || '';
        if (origem.includes('estorno') || origem.includes('estornada')) continue;

        if (lancamento.tipo === 'Entrada') {
            debitos += valor;
        } else if (lancamento.tipo === 'Saida') {
            creditos += valor;
        }
    }

    const isDevedora = (conta as any).saldo_tipo === 'devedora';

    if (isDevedora) {
        return saldoInicial + debitos - creditos;
    } else {
        return saldoInicial + creditos - debitos;
    }
  }, []);

  const calcularSaldosRecursivo = useCallback((contas: PlanoContas[], lancamentos: Lancamento[], saldosIniciais: SaldoInicialMap): ContaBP[] => {
    
    const mapContas = (contas: PlanoContas[]): ContaBP[] => {
        return contas.map(conta => {
            // Filtra lançamentos que pertencem a esta conta E que não foram estornados
            const lancamentosDaConta = lancamentos.filter(l => 
                l.conta_contabil_id === conta.id && 
                l.origem !== 'movimentacao_direta_estornada' // IGNORA LANÇAMENTOS ORIGINAIS ESTORNADOS
            );
            
            const saldoInicial = saldosIniciais[conta.id] || 0;
            const saldo = calcularSaldo(lancamentosDaConta, conta, saldoInicial);
            
            let tipo_principal: ContaBP['tipo_principal'] = 'Outros';
            const saldoTipo = (conta as any).saldo_tipo;
            const prefix = conta.Conta.split('.')[0];
            
            if (prefix === (configMap.Ativo || '1')) {
                tipo_principal = 'Ativo';
            } else if (prefix === (configMap.Passivo || '2')) {
                tipo_principal = 'Passivo';
            } else if (prefix === (configMap['Patrimonio Liquido'] || '3')) {
                tipo_principal = 'Patrimonio Liquido';
            } else if (prefix === (configMap.Receita || '4')) {
                tipo_principal = 'Resultado';
            } else if (prefix === (configMap.Despesa || '5')) {
                tipo_principal = 'Resultado';
            }

            return {
                ...conta,
                saldo_final: saldo, 
                tipo_principal: tipo_principal,
                filhas: [], // Simplified
            } as ContaBP;
        });
    };
    
    // Processa TODAS as contas - o tipo_principal é determinado pelo prefixo
    return mapContas(contas);
  }, [calcularSaldo, configMap]);

  const fetchBalanco = useCallback(async () => {
    if (!ownerId || !dataFim) {
      return;
    }

    setLoading(true);
    
    // 1. Buscar TODAS as contas do plano de contas do proprietário
    const { data: contasData, error: contasError } = await supabase
        .from('plano_contas')
        .select('*')
        .eq('proprietario_id', ownerId)
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
        .eq('proprietario_id', ownerId)
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
        .eq('proprietario_id', ownerId)
        .not('conta_contabil_id', 'is', null);
        
    if (saldosError) {
        console.error('Erro ao buscar saldos iniciais:', saldosError);
    }
    
    const saldosIniciaisMap: SaldoInicialMap = (saldosIniciaisData || []).reduce((acc, s) => {
        if (s.conta_contabil_id) {
            acc[s.conta_contabil_id] = (acc[s.conta_contabil_id] || 0) + s.saldo_inicial;
        }
        return acc;
    }, {} as SaldoInicialMap);
    
    const contasPlanas = contasData as PlanoContas[];
    const balancoCalculado = calcularSaldosRecursivo(contasPlanas, lancamentosData as Lancamento[], saldosIniciaisMap);
    
    setBalanco(balancoCalculado);
    setLoading(false);
  }, [ownerId, dataFim, calcularSaldosRecursivo, refreshKey]); // Adicionando refreshKey

  useEffect(() => {
    fetchBalanco();
  }, [fetchBalanco]);

  // Calculate totals
  const totalAtivo = balanco.filter(c => c.tipo_principal === 'Ativo').reduce((sum, c) => sum + c.saldo_final, 0);
  const totalPassivo = balanco.filter(c => c.tipo_principal === 'Passivo').reduce((sum, c) => sum + c.saldo_final, 0);
  const totalPatrimonioLiquido = balanco.filter(c => c.tipo_principal === 'Patrimonio Liquido').reduce((sum, c) => sum + c.saldo_final, 0);
  
  // Calculate DRE result (Resultado Líquido)
  const getSomaPorTipo = (contas: ContaBP[], prefix: string) => {
    // Busca a soma do saldo_final de todas as contas que começam com o prefixo
    return contas.filter(c => c.Conta.startsWith(prefix)).reduce((sum, c) => sum + c.saldo_final, 0);
  };
  
  const totalReceita = getSomaPorTipo(balanco, configMap.Receita || '4');
  const totalDespesa = getSomaPorTipo(balanco, configMap.Despesa || '5');
  
  // Resultado Líquido = Receita - Despesa
  // Receita (credora) tem sinal negativo, Despesa (devedora) tem sinal negativo
  // Fórmula: -Receita - Despesa
  const resultadoLiquido = -totalReceita - totalDespesa;
  
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
    refetch, // EXPORTANDO O REFETCH
  };
};
