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

    // --- DEDUPLICAÇÃO DE CÓDIGOS DE CONTA (Garante unicidade antes de enviar ao DB) ---
    const uniqueContasMap = new Map();
    newPlanoContas.forEach(conta => {
        if (conta.Conta) {
            uniqueContasMap.set(conta.Conta.trim(), {
                ...conta,
                proprietario_id: proprietarioId,
                Conta: conta.Conta.trim(),
                Descricao: (conta.Descricao || 'Sem Descrição').trim()
            });
        }
    });
    const sanitizedContas = Array.from(uniqueContasMap.values());
    // --------------------------------------------------------------------------------

    console.log(`LOG: Iniciando importação para ${proprietarioId}. Contas processadas: ${sanitizedContas.length}`);

    const supabaseService = createClient(
      (Deno.env.get('SUPABASE_URL') as any)!,
      (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as any)!,
      { auth: { persistSession: false } }
    );
    
    // 1. Limpar dados antigos
    const { error: resetError } = await supabaseService.rpc("contabil_reset_all", {
        p_proprietario_id: proprietarioId,
    });

    if (resetError) {
        throw new Error('Falha ao resetar plano anterior: ' + resetError.message);
    }

    // 2. Inserir novos dados em lotes (Deduplicados)
    const CHUNK_SIZE = 50;
    for (let i = 0; i < sanitizedContas.length; i += CHUNK_SIZE) {
        const chunk = sanitizedContas.slice(i, i + CHUNK_SIZE);
        const { error: insertErr } = await supabaseService
          .from('plano_contas')
          .insert(chunk);

        if (insertErr) {
            console.error(`Erro no lote ${i/CHUNK_SIZE + 1}:`, insertErr);
            return new Response(JSON.stringify({ 
                error: `Erro no banco de dados (Lote ${i/CHUNK_SIZE + 1}): ${insertErr.message}`,
                details: insertErr.details
            }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }
    }

    // 3. Buscar IDs para retorno
    const { data: mappingData, error: fetchErr } = await supabaseService
        .from('plano_contas')
        .select('id, Conta')
        .eq('proprietario_id', proprietarioId);
        
    if (fetchErr) throw fetchErr;

    return new Response(JSON.stringify({ success: true, contaIdMap: mappingData }), {
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