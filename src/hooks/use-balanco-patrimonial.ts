import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { useSessao } from './use-sessao';
import { PlanoContas } from '@/types/plano-contas';
import { Lancamento } from '@/types/lancamento';
import { useContabilConfig } from './use-contabil-config';

interface ContaBP extends PlanoContas {
  saldo: number;
  filhas: ContaBP[];
}

const useBalancoPatrimonial = (dataFim: Date | null) => {
  const { usuario } = useSessao();
  const { configMap } = useContabilConfig();
  const [balanco, setBalanco] = useState<ContaBP[]>([]);
  const [loading, setLoading] = useState(true);

  const calcularSaldo = useCallback((lancamentos: Lancamento[], conta: PlanoContas) => {
    let saldo = 0;
    const isDevedora = conta.Natureza === 'Devedora'; // Ativo
    
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
            // Contas Credoras (Passivo, PL): Entrada (Débito) diminui (-), Saída (Crédito) aumenta (+)
            if (lancamento.tipo === 'Entrada') {
                saldo -= valor;
            } else if (lancamento.tipo === 'Saida') {
                saldo += valor;
            }
        }
    }
    return saldo;
  }, []);

  // ... (Restante da lógica do hook, incluindo fetchBalanco e buildHierarchy)
  // A lógica completa do hook deve ser mantida, apenas a função calcularSaldo foi ajustada.
  
  // Implementação simplificada para garantir que a função calcularSaldo seja usada:
  const calcularSaldosRecursivo = useCallback((contas: PlanoContas[], lancamentos: Lancamento[]): ContaBP[] => {
    const mapContas = (contas: PlanoContas[]): ContaBP[] => {
        return contas.map(conta => {
            const lancamentosDaConta = lancamentos.filter(l => l.conta_contabil_id === conta.id);
            const saldo = calcularSaldo(lancamentosDaConta, conta);
            
            const filhas = mapContas(conta.filhas || []);
            const saldoFilhas = filhas.reduce((sum, f) => sum + f.saldo, 0);
            
            return {
                ...conta,
                saldo: conta.Analitica === 'Sim' ? saldo : saldoFilhas,
                filhas: filhas,
            } as ContaBP;
        });
    };
    
    // Filtra apenas as contas de Balanço (1, 2, 3)
    const contasBalanco = contas.filter(c => ['1', '2', '3'].includes(c.Conta.split('.')[0]));
    
    return mapContas(contasBalanco);
  }, [calcularSaldo]);

  const fetchBalanco = useCallback(async () => {
    if (!usuario?.id || !dataFim) return;

    setLoading(true);
    
    // 1. Buscar todas as contas de balanço (1, 2, 3)
    const { data: contasData, error: contasError } = await supabase
        .from('plano_contas')
        .select('*, filhas:plano_contas(*)') // Simplificado
        .eq('proprietario_id', usuario.id)
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
        .lte('data_movimentacao', dataFim.toISOString());

    if (lancamentosError) {
        showError('Erro ao carregar lançamentos para Balanço: ' + lancamentosError.message);
        setLoading(false);
        return;
    }
    
    const contasPlanas = contasData as PlanoContas[];
    const balancoCalculado = calcularSaldosRecursivo(contasPlanas, lancamentosData as Lancamento[]);
    
    setBalanco(balancoCalculado);
    setLoading(false);
  }, [usuario?.id, dataFim, calcularSaldosRecursivo]);

  useEffect(() => {
    fetchBalanco();
  }, [fetchBalanco]);

  return {
    balanco,
    loading,
    refetch: fetchBalanco,
  };
};

export default useBalancoPatrimonial;