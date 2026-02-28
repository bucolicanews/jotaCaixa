import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError } from '@/utils/toast';
import { v4 as uuidv4 } from 'uuid';

const TIPO_BANCO_PURO = 'banco_puro';
const CONTA_BANCO_PURO = 'banco_puro';

const DEFAULTS = ['TARIFA', 'IOF', 'JUROS', 'ENCARGOS', 'MANUTENCAO', 'ANUIDADE'];

export interface PalavraChaveBanco {
  id: string;
  termo: string;
}

export function useChavesBancoPuro() {
  const { ownerId } = useSessao();
  const [palavrasChave, setPalavrasChave] = useState<PalavraChaveBanco[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchPalavras = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('conciliacao_regras')
        .select('id, descricao_extrato')
        .eq('proprietario_id', ownerId)
        .eq('tipo_lancamento', TIPO_BANCO_PURO);

      if (error) {
        showError('Erro ao carregar palavras-chave: ' + error.message);
        return;
      }

      if (!data || data.length === 0) {
        await inserirDefaults();
        return;
      }

      setPalavrasChave(data.map(r => ({ id: r.id, termo: r.descricao_extrato })));
    } finally {
      setLoading(false);
    }
  }, [ownerId]);

  const inserirDefaults = useCallback(async () => {
    if (!ownerId) return;
    const payload = DEFAULTS.map(termo => ({
      id: uuidv4(),
      proprietario_id: ownerId,
      descricao_extrato: termo,
      conta_contabil_id: CONTA_BANCO_PURO,
      tipo_lancamento: TIPO_BANCO_PURO,
    }));
    const { data, error } = await supabase
      .from('conciliacao_regras')
      .insert(payload)
      .select('id, descricao_extrato');
    if (!error && data) {
      setPalavrasChave(data.map(r => ({ id: r.id, termo: r.descricao_extrato })));
    }
  }, [ownerId]);

  const adicionarPalavra = useCallback(async (termo: string): Promise<boolean> => {
    if (!ownerId || !termo.trim()) return false;
    const termoUpper = termo.trim().toUpperCase();
    const jaExiste = palavrasChave.some(p => p.termo.toUpperCase() === termoUpper);
    if (jaExiste) return false;

    const { data, error } = await supabase
      .from('conciliacao_regras')
      .insert({
        id: uuidv4(),
        proprietario_id: ownerId,
        descricao_extrato: termoUpper,
        conta_contabil_id: CONTA_BANCO_PURO,
        tipo_lancamento: TIPO_BANCO_PURO,
      })
      .select('id, descricao_extrato')
      .single();

    if (error) {
      showError('Erro ao adicionar palavra-chave: ' + error.message);
      return false;
    }

    setPalavrasChave(prev => [...prev, { id: data.id, termo: data.descricao_extrato }]);
    return true;
  }, [ownerId, palavrasChave]);

  const removerPalavra = useCallback(async (id: string): Promise<boolean> => {
    const { error } = await supabase
      .from('conciliacao_regras')
      .delete()
      .eq('id', id);

    if (error) {
      showError('Erro ao remover palavra-chave: ' + error.message);
      return false;
    }

    setPalavrasChave(prev => prev.filter(p => p.id !== id));
    return true;
  }, []);

  const isBancoPuro = useCallback((descricao: string): boolean => {
    if (!descricao) return false;
    const lower = descricao.toLowerCase();
    return palavrasChave.some(p => lower.includes(p.termo.toLowerCase()));
  }, [palavrasChave]);

  useEffect(() => {
    fetchPalavras();
  }, [fetchPalavras]);

  return { palavrasChave, loading, adicionarPalavra, removerPalavra, isBancoPuro, fetchPalavras };
}
