import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import Stripe from 'https://esm.sh/stripe@16.5.0?target=deno';

// Cabeçalhos CORS (para funcionar com o front-end)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('LOG 1: Starting checkout session creation.');

    // 1️⃣ Ler o corpo da requisição
    const body = await req.json();
    const { planoId, clienteId, email } = body;

    console.log(`LOG 2: Received data: planoId=${planoId}, clienteId=${clienteId}, email=${email}`);

    if (!planoId || !clienteId || !email) {
      return new Response(JSON.stringify({ error: 'Missing planoId, clienteId, or email' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2️⃣ Inicializar Supabase Client (usa as variáveis padrão do Supabase)
    const supabase = createClient(
      (Deno.env.get('SUPABASE_URL') as any)!,
      (Deno.env.get('SUPABASE_ANON_KEY') as any)!,
      { auth: { persistSession: false } }
    );

    // 3️⃣ Buscar a chave secreta Stripe (configuração do admin)
    console.log('LOG 3: Fetching Stripe secret key...');
    const { data: stripeConfig, error: configError } = await supabase
      .from('configuracoes_stripe')
      .select('stripe_secret_key')
      .not('proprietario_id', 'is', null) // Fetch the admin's config
      .limit(1)
      .single();

    if (configError && configError.code !== 'PGRST116') {
      console.error('❌ Database error fetching Stripe config:', configError);
      return new Response(JSON.stringify({ error: 'Database error fetching Stripe config.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!stripeConfig?.stripe_secret_key) {
      console.error('❌ No Stripe secret key found in configuracoes_stripe.');
      return new Response(JSON.stringify({ error: 'Stripe secret key not found. Admin must configure it.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const stripeSecretKey = stripeConfig.stripe_secret_key;
    console.log('LOG 4: Stripe secret key fetched. Starts with:', stripeSecretKey.slice(0, 8));

    // 4️⃣ Buscar detalhes do plano
    console.log(`LOG 5: Fetching plan details for ID: ${planoId}`);
    const { data: plano, error: planoError } = await supabase
      .from('planos')
      .select('nome, preco_mensal')
      .eq('id', planoId)
      .single();

    if (planoError || !plano) {
      console.error('❌ Plano not found:', planoError);
      return new Response(JSON.stringify({ error: 'Plano not found.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`LOG 6: Plan found: ${plano.nome}, Price: ${plano.preco_mensal}`);

    // 5️⃣ Inicializar Stripe
    console.log('LOG 7: Initializing Stripe...');
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2024-06-20',
    });

    const unitAmount = Math.round(plano.preco_mensal * 100);

    // 6️⃣ Corrigir URL base (em caso de ausência de referer)
    const referer = req.headers.get('referer');
    // Usando uma URL de fallback mais segura
    const baseUrl = referer || `https://${(Deno.env.get('SUPABASE_URL') as any)?.split('//')[1].split('.')[0]}.vercel.app/`; 

    console.log(`LOG 8: Creating Checkout Session. Base URL: ${baseUrl}`);

    // 7️⃣ Criar a sessão de checkout
    const session = await stripe.checkout.sessions.create({
      mode: 'payment', // Alterado para pagamento único
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'brl',
            product_data: { name: plano.nome },
            unit_amount: unitAmount,
            // Removido: recurring: { interval: 'month' },
          },
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}painel?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}vendas?payment=canceled`,
      metadata: { clienteId, planoId },
      customer_email: email,
    });

    console.log(`LOG 9: Session created successfully. URL: ${session.url}`);

    return new Response(JSON.stringify({ sessionId: session.id, url: session.url }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 FATAL ERROR in Edge Function:', error);
    const message = error instanceof Error ? error.message : 'Unknown error during checkout process.';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});