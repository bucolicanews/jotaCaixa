import { useState, useEffect } from 'react';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';

interface StripeConfig {
  stripePromise: Promise<Stripe | null> | null;
  publishableKey: string | null;
  loading: boolean;
}

// Cache para evitar recarregar o Stripe para o mesmo proprietário
const stripePromiseCache: Record<string, Promise<Stripe | null>> = {};
const keyCache: Record<string, string> = {};

/**
 * Hook que carrega a chave publicável do Stripe com base no `proprietario_id`.
 * Este hook é usado no frontend (CheckoutPlano) e depende da política RLS de leitura.
 */
export function useStripeConfigClient(proprietarioId: string | null): StripeConfig {
  const [loading, setLoading] = useState(true);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);

  useEffect(() => {
    if (!proprietarioId) {
      setLoading(false);
      return;
    }

    // Verifica o cache primeiro
    if (proprietarioId in keyCache && proprietarioId in stripePromiseCache) {
      setPublishableKey(keyCache[proprietarioId]);
      setStripePromise(stripePromiseCache[proprietarioId]);
      setLoading(false);
      return;
    }

    const fetchStripeKey = async () => {
      setLoading(true);
      try {
        // Acesso direto à tabela, dependendo da política RLS "Authenticated users can read stripe configs"
        const { data, error } = await supabase
          .from('configuracoes_stripe')
          .select('stripe_publishable_key')
          .eq('proprietario_id', proprietarioId)
          .single();

        if (error || !data?.stripe_publishable_key) {
          // Não mostra erro se for PGRST116 (No rows found), apenas se for erro de permissão ou outro.
          if (error && error.code !== 'PGRST116') {
            console.error('Erro ao buscar chave publicável do Stripe:', error);
            showError('Falha ao carregar a configuração de pagamento.');
          }
          setLoading(false);
          return;
        }

        const key = data.stripe_publishable_key;
        keyCache[proprietarioId] = key;
        setPublishableKey(key);

        const promise = loadStripe(key);
        stripePromiseCache[proprietarioId] = promise;
        setStripePromise(promise);

      } catch (e) {
        console.error('Erro crítico ao inicializar Stripe:', e);
        showError('Erro crítico ao conectar ao sistema de pagamento.');
      } finally {
        setLoading(false);
      }
    };

    fetchStripeKey();
  }, [proprietarioId]);

  return {
    stripePromise,
    publishableKey,
    loading,
  };
}