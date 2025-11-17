import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface StripeConfigData {
  id: string | null;
  stripe_publishable_key: string;
  stripe_secret_key: string;
  conta_sintetica_id: string | null; // Conta Banco/Caixa (Ativo)
  historico_padrao_id: string | null;
  conta_receber_id: string | null; // Conta Patrimonial (CR)
  conta_resultado_id: string | null; // Conta Receita (DRE)
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
 * Nota: Este hook agora usa uma Edge Function para contornar problemas de RLS.
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
      // --- LOG PARA DEBUG ---
      console.log('useStripeConfigAdmin: Sending adminId:', adminId);
      
      // Chamada para a Edge Function que usa a Service Role Key
      const { data, error: invokeError } = await supabase.functions.invoke('get-admin-stripe-config', {
          body: { adminId },
      });

      if (invokeError) {
          console.error('Edge Function Invoke Error:', invokeError);
          setError('Falha na comunicação com o servidor: ' + invokeError.message);
          setConfig(null);
          return;
      }
      
      if (data?.error) {
          console.error('Edge Function returned error:', data.error);
          setError('Erro ao carregar configurações: ' + data.error);
          setConfig(null);
          return;
      }
      
      const fetchedConfig = data?.config;

      if (fetchedConfig) {
        setConfig(fetchedConfig as StripeConfigData);
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