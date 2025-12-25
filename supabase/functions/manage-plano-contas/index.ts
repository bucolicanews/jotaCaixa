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

    console.log(`LOG: Iniciando processo de importação para: ${proprietarioId}`);

    // Inicializar Supabase Client com SERVICE ROLE KEY (Ignora RLS)
    const supabaseService = createClient(
      (Deno.env.get('SUPABASE_URL') as any)!,
      (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as any)!,
      { auth: { persistSession: false } }
    );
    
    // 1. Limpar dados antigos usando a RPC robusta
    console.log('LOG: Executando reset contábil...');
    const { data: resetData, error: resetError } = await supabaseService.rpc("contabil_reset_all", {
        p_proprietario_id: proprietarioId,
    });

    if (resetError) {
        console.error('ERRO RPC reset:', resetError);
        return new Response(JSON.stringify({ error: 'Erro ao limpar dados antigos: ' + resetError.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    // 2. Inserir novos dados em lotes pequenos (50 por vez) para garantir estabilidade
    const CHUNK_SIZE = 50;
    console.log(`LOG: Inserindo ${newPlanoContas.length} contas em lotes de ${CHUNK_SIZE}...`);
    
    for (let i = 0; i < newPlanoContas.length; i += CHUNK_SIZE) {
        const chunk = newPlanoContas.slice(i, i + CHUNK_SIZE);
        const { error: insertErr } = await supabaseService
          .from('plano_contas')
          .insert(chunk);

        if (insertErr) {
            console.error(`ERRO no lote ${Math.floor(i/CHUNK_SIZE) + 1}:`, insertErr);
            return new Response(JSON.stringify({ 
                error: `Falha na inserção (Lote ${Math.floor(i/CHUNK_SIZE) + 1}): ${insertErr.message}`,
                details: insertErr.details,
                hint: insertErr.hint || 'Verifique se existem códigos de conta duplicados.'
            }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }
    }

    // 3. Buscar os novos IDs para o mapeamento no frontend
    const { data: contasInseridas, error: fetchErr } = await supabaseService
        .from('plano_contas')
        .select('id, Conta')
        .eq('proprietario_id', proprietarioId);
        
    if (fetchErr) {
        return new Response(JSON.stringify({ error: 'Contas inseridas, mas falha ao recuperar IDs: ' + fetchErr.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    console.log('LOG: Importação finalizada com sucesso.');
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