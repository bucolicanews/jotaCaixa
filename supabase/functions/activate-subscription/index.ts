// @ts-nocheck
/// <reference lib="deno.ns" />
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { clienteId, planoId, proprietarioId } = body;

    if (!clienteId || !planoId || !proprietarioId) {
      return new Response(JSON.stringify({ error: 'Missing required fields (clienteId, planoId, proprietarioId)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Inicializar Supabase Client com SERVICE ROLE KEY
    const supabaseService = createClient(
      (Deno.env.get('SUPABASE_URL') as any)!,
      (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as any)!,
      { auth: { persistSession: false } }
    );
    
    // --- 1. Setup contabil padrao (Plano + Historicos + Configs) ---
    console.log(`LOG: Running contabil_setup_defaults for client: ${clienteId}`);
    const { data: setupData, error: setupError } = await supabaseService.rpc('contabil_setup_defaults', {
        p_proprietario_id: clienteId,
    });

    if (setupError || (setupData && !setupData[0].success)) {
        console.error('RPC contabil_setup_defaults error:', setupError || setupData[0].message);
        return new Response(JSON.stringify({ error: setupError?.message || setupData[0].message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
    // -------------------------------------------------------

    // 3. Buscar a Conta de Resultado do Stripe (configurada pelo Admin)
    const { data: stripeConfig, error: configError } = await supabaseService
      .from('configuracoes_stripe')
      .select('id_conta_resultado')
      .eq('proprietario_id', proprietarioId)
      .limit(1)
      .single();

    if (configError && configError.code !== 'PGRST116') {
      console.error('Stripe config error:', configError);
    }
    
    const idContaResultado = stripeConfig?.id_conta_resultado || null;
    
    console.log(`LOG: id_conta_resultado encontrado para RPC: ${idContaResultado}`);

    // 4. Chamar a função RPC para ativar a assinatura (que também atualiza o setupStatus)
    const { error: rpcError } = await supabaseService.rpc('activate_subscription', {
      p_cliente_id: clienteId,
      p_plano_id: planoId,
      p_id_conta_resultado: idContaResultado, // Passa o ID (pode ser null)
    });

    if (rpcError) {
      console.error('RPC activate_subscription error:', rpcError);
      return new Response(JSON.stringify({ error: rpcError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('FATAL ERROR in activate-subscription:', error);
    const message = error instanceof Error ? error.message : 'Unknown error during activation.';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});