import { useState, useEffect } from 'react';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';

interface StripeConfig {
  stripePromise: Promise<Stripe | null> | null;
  publishableKey: string | null;
  loading: boolean;
}

// Variável global para armazenar a promessa do Stripe
let stripePromiseCache: Promise<Stripe | null> | null = null;
let publishableKeyCache: string | null = null;

/**
 * Hook para carregar a chave publicável do Stripe e inicializar o objeto Stripe.
 * Assume que a chave é global (empresa_id IS NULL) e gerenciada pelo Admin.
 */
export function useStripeConfig(): StripeConfig {
  const [loading, setLoading] = useState(true);
  const [key, setKey] = useState<string | null>(publishableKeyCache);
  const [promise, setPromise] = useState<Promise<Stripe | null> | null>(stripePromiseCache);

  useEffect(() => {
    if (key && promise) {
      setLoading(false);
      return;
    }

    const fetchConfig = async () => {
      setLoading(true);
      try {
        // Busca a chave publicável global (empresa_id IS NULL)
        const { data, error } = await supabase
          .from('configuracoes_stripe')
          .select('stripe_publishable_key')
          .is('empresa_id', null)
          .limit(1)
          .single();

        if (error || !data) {
          showError('Falha ao carregar a chave do Stripe. Verifique as configurações.');
          setLoading(false);
          return;
        }

        const publishableKey = data.stripe_publishable_key;
        publishableKeyCache = publishableKey;
        setKey(publishableKey);

        // Inicializa o Stripe e armazena a promessa
        const stripePromise = loadStripe(publishableKey);
        stripePromiseCache = stripePromise;
        setPromise(stripePromise);
        
      } catch (e) {
        console.error('Erro ao inicializar Stripe:', e);
        showError('Erro crítico ao carregar o sistema de pagamento.');
      } finally {
        setLoading(false);
      }
    };

    if (!key) {
      fetchConfig();
    }
  }, [key, promise]);

  return { stripePromise: promise, publishableKey: key, loading };
}