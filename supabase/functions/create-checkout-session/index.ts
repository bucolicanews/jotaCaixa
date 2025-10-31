/// <reference types="https://deno.land/std@0.190.0/http/server.ts" />
/// <reference types="https://esm.sh/@supabase/supabase-js@2.45.0" />
/// <reference types="https://esm.sh/stripe@16.5.0?target=deno" />

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import Stripe from 'https://esm.sh/stripe@16.5.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('LOG: Starting checkout session creation.');
    
    // 1. Ler o corpo da requisição
    const body = await req.json();
    const { planoId, clienteId, email } = body;
    
    console.log(`LOG: Received data: planoId=${planoId}, clienteId=${clienteId}, email=${email}`);

    if (!planoId || !clienteId || !email) {
      return new Response(JSON.stringify({ error: 'Missing planoId, clienteId, or email' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Inicializar Supabase Client (para buscar a chave secreta)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        auth: { persistSession: false },
      }
    );

    // 3. Buscar a chave secreta do Stripe (configuração global)
    console.log('LOG: Fetching Stripe secret key...');
    const { data: stripeConfig, error: configError } = await supabase
      .from('configuracoes_stripe')
      .select('stripe_secret_key')
      .is('empresa_id', null)
      .limit(1)
      .single();

    if (configError || !stripeConfig?.stripe_secret_key) {
      console.error('ERROR: Stripe config error:', configError);
      return new Response(JSON.stringify({ error: 'Stripe secret key not configured or database error.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    console.log('LOG: Stripe secret key fetched successfully.');
    const stripeSecretKey = stripeConfig.stripe_secret_key;

    // 4. Buscar detalhes do Plano
    console.log(`LOG: Fetching plan details for ID: ${planoId}`);
    const { data: plano, error: planoError } = await supabase
      .from('planos')
      .select('nome, preco_mensal')
      .eq('id', planoId)
      .single();

    if (planoError || !plano) {
      console.error('ERROR: Plano not found:', planoError);
      return new Response(JSON.stringify({ error: 'Plano not found.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    console.log(`LOG: Plan found: ${plano.nome}, Price: ${plano.preco_mensal}`);

    // 5. Inicializar Stripe
    console.log('LOG: Initializing Stripe...');
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2024-06-20',
      httpClient: Stripe.createFetchHttpClient(),
    });
    
    const unitAmount = Math.round(plano.preco_mensal * 100);
    
    console.log(`LOG: Creating Checkout Session. Unit Amount: ${unitAmount}`);

    // 6. Criar a Stripe Checkout Session
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
            unit_amount: unitAmount, // Preço em centavos
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
      customer_email: email, // Usando o email extraído do corpo
    });
    
    console.log(`LOG: Session created successfully. URL: ${session.url}`);

    return new Response(JSON.stringify({ sessionId: session.id, url: session.url }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('FATAL ERROR in Edge Function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error during checkout process.';
    
    // Retorna 500 com a mensagem de erro detalhada no corpo
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});