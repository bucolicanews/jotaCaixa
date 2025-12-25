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
      return new Response(JSON.stringify({ error: 'Dados inválidos: proprietarioId ou array de contas ausente.' }), {
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
    
    // 1. Limpar as FKs e o Plano antigo
    const { data: resetData, error: resetError } = await supabaseService.rpc("contabil_reset_all", {
        p_proprietario_id: proprietarioId,
    });

    if (resetError) {
        console.error('Erro RPC contabil_reset_all:', resetError);
        return new Response(JSON.stringify({ error: 'Erro ao limpar dados antigos: ' + resetError.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    // 2. Inserir novos dados (em lotes menores para estabilidade)
    const CHUNK_SIZE = 50;
    for (let i = 0; i < newPlanoContas.length; i += CHUNK_SIZE) {
        const chunk = newPlanoContas.slice(i, i + CHUNK_SIZE);
        const { error: insertErr } = await supabaseService
          .from('plano_contas')
          .insert(chunk);

        if (insertErr) {
            console.error(`Erro no lote ${i/CHUNK_SIZE + 1}:`, insertErr);
            return new Response(JSON.stringify({ 
                error: `Falha na inserção (Lote ${i/CHUNK_SIZE + 1}): ${insertErr.message}`,
                details: insertErr.details,
                hint: insertErr.hint
            }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }
    }

    // 3. Buscar os IDs reais das contas recém-inseridas para o remapeamento do modal
    const { data: contasInseridas, error: fetchErr } = await supabaseService
        .from('plano_contas')
        .select('id, Conta')
        .eq('proprietario_id', proprietarioId);
        
    if (fetchErr) {
        return new Response(JSON.stringify({ error: 'Plano inserido, mas falha ao mapear IDs: ' + fetchErr.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    return new Response(JSON.stringify({ success: true, contaIdMap: contasInseridas }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 ERRO FATAL:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});