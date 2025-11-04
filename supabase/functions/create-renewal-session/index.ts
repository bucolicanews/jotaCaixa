/// <reference lib="deno.ns" />
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import Stripe from 'https://esm.sh/stripe@16.5.0?target=deno';

// Cabeçalhos CORS
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('LOG 1: Starting renewal checkout session creation.');

    // 1️⃣ Ler o corpo da requisição
    const body = await req.json();
    const { planoId, clienteId, email, contaPagarId, valorCobrado, proprietarioId } = body;

    console.log(`LOG 2: Received data: planoId=${planoId}, clienteId=${clienteId}, email=${email}, contaPagarId=${contaPagarId}, valorCobrado=${valorCobrado}, proprietarioId=${proprietarioId}`);

    if (!planoId || !clienteId || !email || !contaPagarId || valorCobrado === undefined || valorCobrado === null || !proprietarioId) {
      return new Response(JSON.stringify({ error: 'Missing required fields (planoId, clienteId, email, contaPagarId, valorCobrado, proprietarioId)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2️⃣ Inicializar Supabase Client com SERVICE ROLE KEY
    const supabase = createClient(
      (Deno.env.get('SUPABASE_URL') as any)!,
      (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as any)!,
      { auth: { persistSession: false } }
    );

    // 3️⃣ Buscar a chave secreta Stripe do proprietário
    const { data: stripeConfig, error: configError } = await supabase
      .from('configuracoes_stripe')
      .select('stripe_secret_key')
      .eq('proprietario_id', proprietarioId)
      .limit(1)
      .single();

    if (configError || !stripeConfig?.stripe_secret_key) {
      console.error('❌ No Stripe secret key found for the specified owner.');
      return new Response(JSON.stringify({ error: 'Stripe secret key not found for this plan owner.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const stripeSecretKey = stripeConfig.stripe_secret_key;

    // 4️⃣ Buscar detalhes do plano
    const { data: planoRes, error: planoError } = await supabase
        .from('planos')
        .select('nome')
        .eq('id', planoId)
        .single();

    if (planoError || !planoRes) {
      console.error('❌ Plano not found:', planoError);
      return new Response(JSON.stringify({ error: 'Plano not found.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const unitAmount = Math.round(valorCobrado * 100);

    // 5️⃣ Inicializar Stripe
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2024-06-20',
    });

    const referer = req.headers.get('referer');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const projectId = supabaseUrl ? supabaseUrl.split('//')[1].split('.')[0] : 'jqoirlswewggyppgvgnv';
    const baseUrl = referer || `https://${projectId}.vercel.app/`; 

    console.log(`LOG 6: Creating Renewal Checkout Session. Value: ${valorCobrado}. Base URL: ${baseUrl}`);

    // 6️⃣ Criar a sessão de checkout
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'brl',
            product_data: { name: `Renovação: ${planoRes.nome}` },
            unit_amount: unitAmount,
          },
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}minha-assinatura?renewal=success&session_id={CHECKOUT_SESSION_ID}&cp_id=${contaPagarId}`,
      cancel_url: `${baseUrl}minha-assinatura?renewal=canceled`,
      metadata: { clienteId, planoId, contaPagarId, valorCobrado: valorCobrado.toString() },
      customer_email: email,
    });

    console.log(`LOG 7: Session created successfully. URL: ${session.url}`);

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