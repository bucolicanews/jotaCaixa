import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import Stripe from 'https://esm.sh/stripe@16.5.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { planoId, clienteId } = await req.json();

    if (!planoId || !clienteId) {
      return new Response(JSON.stringify({ error: 'Missing planoId or clienteId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Inicializar Supabase Client (para buscar a chave secreta)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        auth: { persistSession: false },
      }
    );

    // 2. Buscar a chave secreta do Stripe (configuração global)
    const { data: stripeConfig, error: configError } = await supabase
      .from('configuracoes_stripe')
      .select('stripe_secret_key')
      .is('empresa_id', null)
      .limit(1)
      .single();

    if (configError || !stripeConfig?.stripe_secret_key) {
      console.error('Stripe config error:', configError);
      return new Response(JSON.stringify({ error: 'Stripe secret key not configured.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Buscar detalhes do Plano
    const { data: plano, error: planoError } = await supabase
      .from('planos')
      .select('nome, preco_mensal')
      .eq('id', planoId)
      .single();

    if (planoError || !plano) {
      console.error('Plano not found:', planoError);
      return new Response(JSON.stringify({ error: 'Plano not found.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Inicializar Stripe
    const stripe = new Stripe(stripeConfig.stripe_secret_key, {
      apiVersion: '2024-06-20',
      httpClient: Stripe.createFetchHttpClient(),
    });

    // 5. Criar a Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription', // Assumindo que planos são assinaturas
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'brl',
            product_data: {
              name: plano.nome,
            },
            unit_amount: Math.round(plano.preco_mensal * 100), // Preço em centavos
            recurring: {
              interval: 'month',
            },
          },
          quantity: 1,
        },
      ],
      // URLs de redirecionamento (usando o domínio do cliente)
      success_url: `${req.headers.get('referer')}painel?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.get('referer')}vendas?payment=canceled`,
      
      // Metadados para identificar o cliente e o plano após o pagamento
      metadata: {
        clienteId: clienteId,
        planoId: planoId,
      },
      customer_email: (await req.json()).email, // Tenta usar o email passado no corpo
    });

    return new Response(JSON.stringify({ sessionId: session.id, url: session.url }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Stripe Checkout Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});