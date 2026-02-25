import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { v4 as uuidv4 } from 'uuid';

export interface LancamentoContabil {
  id?: string;
  proprietario_id: string;
  conta_contabil_id: string;
  data_movimentacao: string;
  tipo: 'Entrada' | 'Saida';
  valor: number;
  descricao: string;
  origem: 'lancamento_manual_cp' | 'lancamento_manual_cr' | 'contrato_assinado';
  documento: string;
  conciliado?: boolean;
}

interface UseLancamentosContabeisReturn {
  lancamentos: LancamentoContabil[];
  lancamentosExistentes: LancamentoContabil[];
  loading: boolean;
  salvar: (lancamentos: Omit<LancamentoContabil, 'id'>[], substituirTodos?: boolean) => Promise<boolean>;
  deletarPorDocumento: (parcelaId: string, apenasManual?: boolean) => Promise<boolean>;
  refetch: () => void;
}

export function useLancamentosContabeis(parcelaId: string | null, proprietarioId?: string): UseLancamentosContabeisReturn {
  const [lancamentos, setLancamentos] = useState<LancamentoContabil[]>([]);
  const [lancamentosExistentes, setLancamentosExistentes] = useState<LancamentoContabil[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const refetch = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  useEffect(() => {
    if (!parcelaId) {
      setLancamentos([]);
      setLancamentosExistentes([]);
      return;
    }

    const fetchLancamentos = async () => {
      setLoading(true);

      let query = supabase
        .from('lancamentos')
        .select('id, proprietario_id, conta_contabil_id, data_movimentacao, tipo, valor, descricao, origem, documento, conciliado')
        .eq('documento', parcelaId)
        .order('data_movimentacao', { ascending: true });

      if (proprietarioId) {
        query = query.eq('proprietario_id', proprietarioId);
      }

      const { data, error } = await query;

      if (error) {
        showError('Erro ao carregar lançamentos: ' + error.message);
        setLancamentos([]);
        setLancamentosExistentes([]);
      } else {
        const todos = (data || []) as LancamentoContabil[];
        const manuais = todos.filter(l => l.origem === 'lancamento_manual_cp' || l.origem === 'lancamento_manual_cr');
        setLancamentos(manuais);
        setLancamentosExistentes(todos);
      }
      setLoading(false);
    };

    fetchLancamentos();
  }, [parcelaId, proprietarioId, refreshKey]);

  const deletarPorDocumento = useCallback(async (docId: string, apenasManual: boolean = true): Promise<boolean> => {
    let query = supabase.from('lancamentos').delete().eq('documento', docId);
    if (apenasManual) {
      query = query.in('origem', ['lancamento_manual_cp', 'lancamento_manual_cr']);
    }
    const { error } = await query;
    if (error) {
      showError('Erro ao deletar lançamentos: ' + error.message);
      return false;
    }
    return true;
  }, []);

  const salvar = useCallback(async (novosLancamentos: Omit<LancamentoContabil, 'id'>[], substituirTodos: boolean = false): Promise<boolean> => {
    if (novosLancamentos.length === 0) return false;

    const docId = novosLancamentos[0].documento;
    const deletado = await deletarPorDocumento(docId, !substituirTodos);
    if (!deletado) return false;

    const lancamentosComId = novosLancamentos.map(l => ({
      ...l,
      id: uuidv4(),
      conciliado: false,
    }));

    const { error } = await supabase.from('lancamentos').insert(lancamentosComId);

    if (error) {
      showError('Erro ao salvar lançamentos: ' + error.message);
      return false;
    }

    showSuccess('Lançamentos contábeis salvos com sucesso!');
    setRefreshKey(prev => prev + 1);
    return true;
  }, [deletarPorDocumento]);

  return { lancamentos, lancamentosExistentes, loading, salvar, deletarPorDocumento, refetch };
}
