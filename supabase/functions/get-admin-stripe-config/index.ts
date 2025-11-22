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

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    // --- Logging for Debugging ---
    console.log('📌 adminId recebido:', adminId);
    console.log('📌 SUPABASE_URL existe?', !!SUPABASE_URL);
    console.log('📌 SERVICE ROLE existe?', !!SUPABASE_SERVICE_ROLE_KEY);
    // -----------------------------
    
    if (!adminId) {
      return new Response(JSON.stringify({ error: 'Missing adminId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        console.error('FATAL: Missing Supabase environment variables.');
        return new Response(JSON.stringify({ error: 'Missing Supabase environment variables.' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    // Inicializar Supabase Client com SERVICE ROLE KEY (ignora RLS)
    const supabaseService = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );

    // Adicionando id_conta_resultado
    const { data, error: fetchError } = await supabaseService
      .from('configuracoes_stripe')
      .select('id, stripe_publishable_key, stripe_secret_key, conta_sintetica_id, conta_receber_id, historico_padrao_id, id_conta_resultado')
      .eq('proprietario_id', adminId)
      .limit(1)
      .maybeSingle();

    if (fetchError) { 
        console.error('Edge Function Error fetching config:', fetchError);
        return new Response(JSON.stringify({ error: fetchError.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
    
    // Retorna os dados (data será null se não houver configuração)
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