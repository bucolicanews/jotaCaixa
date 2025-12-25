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
    const { proprietarioId, newPlanoContas } = body;

    if (!proprietarioId || !Array.isArray(newPlanoContas)) {
      return new Response(JSON.stringify({ error: 'Missing proprietarioId or newPlanoContas array' }), {
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
    
    // 1. Limpar todas as FKs e o Plano de Contas antigo usando a RPC contabil_reset_all
    console.log(`LOG: Running contabil_reset_all for owner: ${proprietarioId}`);
    const { data: resetData, error: resetError } = await supabaseService.rpc("contabil_reset_all", {
        p_proprietario_id: proprietarioId,
    });

    if (resetError || (resetData && resetData[0]?.success === false)) {
        console.error('Edge Function Error: Failed to reset old plan and FKs:', resetError || resetData[0].message);
        return new Response(JSON.stringify({ error: resetError?.message || resetData[0].message || 'Falha ao limpar plano de contas antigo.' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    // 2. Inserir novos dados
    const { error: insertErr } = await supabaseService
      .from('plano_contas')
      .insert(newPlanoContas);

    if (insertErr) {
        console.error('Edge Function Error: Failed to insert new plan:', insertErr);
        // Retorna 500 se a inserção falhar
        return new Response(JSON.stringify({ error: 'Falha ao inserir novo plano de contas.' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
    
    // 3. Buscar os IDs reais das contas recém-inseridas (necessário para o remapeamento no frontend)
    const { data: contasInseridas, error: fetchErr } = await supabaseService
        .from('plano_contas')
        .select('id, Conta')
        .eq('proprietario_id', proprietarioId);
        
    if (fetchErr) {
        console.error('Edge Function Error: Failed to fetch new IDs:', fetchErr);
        // Retorna 500 se a busca falhar
        return new Response(JSON.stringify({ error: 'Falha ao buscar IDs do novo plano.' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    // Retorna 200 com os dados de mapeamento
    return new Response(JSON.stringify({ success: true, contaIdMap: contasInseridas }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 FATAL ERROR in manage-plano-contas:', error);
    const message = error instanceof Error ? error.message : 'Unknown error.';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});