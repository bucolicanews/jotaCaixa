import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface StripeConfigData {
  id: string | null;
  stripe_publishable_key: string;
  stripe_secret_key: string;
  conta_sintetica_id: string | null;
  conta_receber_id: string | null;
  historico_padrao_id: string | null;
}

interface StripeConfigAdminHook {
  config: StripeConfigData | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Hook que busca a configuração COMPLETA do Stripe (incluindo a chave secreta)
 * para uso exclusivo na página de Configurações do Admin.
 * 
 * Nota: Este hook depende da política RLS que permite ao Admin ler sua própria linha.
 */
export function useStripeConfigAdmin(adminId: string | null): StripeConfigAdminHook {
  const [config, setConfig] = useState<StripeConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refetch = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  const fetchConfig = useCallback(async () => {
    if (!adminId) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const { data, error: fetchError } = await supabase
        .from('configuracoes_stripe')
        .select('id, stripe_publishable_key, stripe_secret_key, conta_sintetica_id, conta_receber_id, historico_padrao_id')
        .eq('proprietario_id', adminId)
        .limit(1)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        // Este é o erro que estamos tentando corrigir: "permission denied"
        console.error('Erro ao carregar configurações do Stripe (Admin):', fetchError);
        setError('Erro ao carregar configurações do Stripe: ' + fetchError.message);
        setConfig(null);
        return;
      }
      
      if (data) {
        setConfig(data as StripeConfigData);
      } else {
        setConfig(null);
      }

    } catch (e: any) {
      console.error('Erro inesperado ao buscar config Stripe:', e);
      setError(e.message || 'Erro inesperado.');
    } finally {
      setLoading(false);
    }
  }, [adminId, refreshKey]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  return {
    config,
    loading,
    error,
    refetch,
  };
}