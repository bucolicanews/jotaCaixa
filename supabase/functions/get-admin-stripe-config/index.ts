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
    const { adminId } = body;

    if (!adminId) {
      return new Response(JSON.stringify({ error: 'Missing adminId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Inicializar Supabase Client com SERVICE ROLE KEY (ignora RLS)
    const supabaseService = createClient(
      (Deno.env.get('SUPABASE_URL') as any)!,
      (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as any)!,
      { auth: { persistSession: false } }
    );

    // Buscar a configuração do Stripe, incluindo os novos campos
    const { data, error: fetchError } = await supabaseService
      .from('configuracoes_stripe')
      .select('id, stripe_publishable_key, stripe_secret_key, conta_sintetica_id, historico_padrao_id, conta_receber_id, conta_resultado_id')
      .eq('proprietario_id', adminId)
      .limit(1)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
        console.error('Edge Function Error:', fetchError);
        return new Response(JSON.stringify({ error: fetchError.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
    
    // Retorna os dados (ou null se não encontrado)
    return new Response(JSON.stringify({ config: data }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 FATAL ERROR in get-admin-stripe-config:', error);
    const message = error instanceof Error ? error.message : 'Unknown error.';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});