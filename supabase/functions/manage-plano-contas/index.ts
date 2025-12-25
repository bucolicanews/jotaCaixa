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

    console.log(`LOG: Iniciando importação para proprietário ${proprietarioId}. Total de contas: ${newPlanoContas.length}`);

    // Inicializar Supabase Client com SERVICE ROLE KEY (ignora RLS)
    const supabaseService = createClient(
      (Deno.env.get('SUPABASE_URL') as any)!,
      (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as any)!,
      { auth: { persistSession: false } }
    );
    
    // 1. Limpar todas as FKs e o Plano de Contas antigo usando a RPC
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

    // 2. Inserir novos dados (em lotes de 100 para evitar timeout ou erros de payload)
    const CHUNK_SIZE = 100;
    for (let i = 0; i < newPlanoContas.length; i += CHUNK_SIZE) {
        const chunk = newPlanoContas.slice(i, i + CHUNK_SIZE);
        const { error: insertErr } = await supabaseService
          .from('plano_contas')
          .insert(chunk);

        if (insertErr) {
            console.error('Erro na inserção de lote (lote ' + (i/CHUNK_SIZE + 1) + '):', insertErr);
            // Se falhar um lote, interrompe e retorna o erro detalhado
            return new Response(JSON.stringify({ 
                error: `Falha ao inserir contas (Lote ${i/CHUNK_SIZE + 1}): ${insertErr.message}`,
                hint: insertErr.hint || 'Verifique se existem códigos de conta duplicados no arquivo.'
            }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }
    }
    
    console.log('LOG: Inserção concluída com sucesso.');

    // 3. Buscar os IDs reais das contas recém-inseridas para o remapeamento
    const { data: contasInseridas, error: fetchErr } = await supabaseService
        .from('plano_contas')
        .select('id, Conta')
        .eq('proprietario_id', proprietarioId);
        
    if (fetchErr) {
        console.error('Erro ao buscar novos IDs:', fetchErr);
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
    console.error('💥 ERRO FATAL na Edge Function manage-plano-contas:', error);
    const message = error instanceof Error ? error.message : 'Erro desconhecido durante o processamento do servidor.';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});