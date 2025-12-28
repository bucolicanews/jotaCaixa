import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from './use-sessao';
import { useContabilConfig } from './use-contabil-config';
import { useOwner } from './use-owner'; // NOVO IMPORT

interface UseCapitalSocialReturn {
  temCapitalSocial: boolean;
  carregando: boolean;
  refetch: () => void;
}

export function useCapitalSocial(): UseCapitalSocialReturn {
  const { usuario } = useSessao();
  const { ownerId } = useOwner(); // USANDO useOwner
  const { configMap } = useContabilConfig();
  const [temCapitalSocial, setTemCapitalSocial] = useState(false);
  const [carregando, setCarregando] = useState(true);

  const verificarCapitalSocial = useCallback(async () => {
    if (!ownerId) { // USANDO ownerId
      setCarregando(false);
      return;
    }

    setCarregando(true);

    const plCode = configMap['Patrimonio Liquido'] || '3';

    try {
        // Busca lançamentos que são de Capital Social (Conta PL)
        const { data, error } = await supabase
          .from('lancamentos')
          .select('id, conta_contabil_id, plano_contas:conta_contabil_id(Conta)')
          .eq('proprietario_id', ownerId) // FILTRANDO PELO ownerId
          .not('conta_contabil_id', 'is', null)
          .limit(100);

        if (error) {
          console.error('Erro ao verificar capital social:', error);
          setTemCapitalSocial(false);
          setCarregando(false);
          return;
        }

        const temLancamentoPL = (data || []).some((l: any) => {
          const conta = l.plano_contas?.Conta;
          // Verifica se a conta é do grupo Patrimônio Líquido (PL)
          return conta && conta.startsWith(plCode);
        });

        setTemCapitalSocial(temLancamentoPL);
    } catch (e) {
        console.error('Erro inesperado ao verificar capital social:', e);
        setTemCapitalSocial(false);
    } finally {
        setCarregando(false);
    }
  }, [ownerId, configMap]);

  useEffect(() => {
    verificarCapitalSocial();
  }, [verificarCapitalSocial]);

  return {
    temCapitalSocial,
    carregando,
    refetch: verificarCapitalSocial,
  };
}