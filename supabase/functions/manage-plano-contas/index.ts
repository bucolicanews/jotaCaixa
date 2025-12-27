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

    console.log(`LOG: Iniciando importação para ${proprietarioId}.`);

    // DEDUPLICAÇÃO NO SERVIDOR
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

    // Inicializar Supabase Client com SERVICE ROLE KEY
    const supabaseService = createClient(
      (Deno.env.get('SUPABASE_URL') as any)!,
      (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as any)!,
      { auth: { persistSession: false } }
    );
    
    // --- PASSO CRÍTICO: LIMPEZA MANUAL DE DEPENDÊNCIAS ---
    // A RPC contabil_reset_all pode falhar se houver muitas FKs com RESTRICT.
    // Vamos garantir que os campos sejam nulificados antes de tentar deletar.
    
    console.log('LOG: Desvinculando tabelas dependentes...');
    
    // 1. Limpar Lançamentos (Isso é o que geralmente causa o erro 500 se for RESTRICT)
    await supabaseService.from('lancamentos')
        .update({ conta_contabil_id: null, conta_bancaria_id: null })
        .eq('proprietario_id', proprietarioId);
        
    // 2. Limpar Saldos
    await supabaseService.from('saldo_contas')
        .update({ conta_contabil_id: null })
        .eq('proprietario_id', proprietarioId);
        
    // 3. Limpar Configurações
    await supabaseService.from('configuracao_contas_receber')
        .update({ conta_contabil_id: null })
        .eq('proprietario_id', proprietarioId);
        
    await supabaseService.from('configuracao_contas_pagar')
        .update({ conta_contabil_id: null })
        .eq('proprietario_id', proprietarioId);
        
    await supabaseService.from('configuracao_contratos')
        .update({ id_conta_clientes_receber: null, id_conta_receita_contrato: null })
        .eq('proprietario_id', proprietarioId);
        
    // --- FIM LIMPEZA MANUAL ---
    
    // 4. Executar Reset (Agora deve passar liso pois não há amarras)
    console.log('LOG: Executando delete de plano...');
    const { error: resetError } = await supabaseService.rpc("contabil_reset_all", {
        p_proprietario_id: proprietarioId,
    });

    if (resetError) {
        // Se a RPC falhar, tentamos delete direto como fallback
        console.error('ERRO RPC reset (tentando fallback direto):', resetError);
        const { error: deleteError } = await supabaseService
            .from('plano_contas')
            .delete()
            .eq('proprietario_id', proprietarioId);
            
        if (deleteError) {
            throw new Error('Falha fatal ao limpar plano antigo: ' + deleteError.message);
        }
    }

    // 5. Inserir novos dados em lotes
    const CHUNK_SIZE = 50;
    console.log(`LOG: Inserindo ${sanitizedContas.length} contas...`);
    
    for (let i = 0; i < sanitizedContas.length; i += CHUNK_SIZE) {
        const chunk = sanitizedContas.slice(i, i + CHUNK_SIZE);
        const { error: insertErr } = await supabaseService
          .from('plano_contas')
          .insert(chunk);

        if (insertErr) {
            console.error(`ERRO no lote ${Math.floor(i/CHUNK_SIZE) + 1}:`, insertErr);
            return new Response(JSON.stringify({ 
                error: `Falha na inserção do lote ${Math.floor(i/CHUNK_SIZE) + 1}. Verifique se há códigos duplicados no arquivo. Detalhe: ${insertErr.message}` 
            }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }
    }

    // 6. Retornar IDs para remapeamento
    const { data: mappingData, error: fetchErr } = await supabaseService
        .from('plano_contas')
        .select('id, Conta')
        .eq('proprietario_id', proprietarioId);
        
    if (fetchErr) throw fetchErr;

    console.log('LOG: Importação finalizada.');

    return new Response(JSON.stringify({ success: true, contaIdMap: mappingData }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 ERRO FATAL:', error);
    return new Response(JSON.stringify({ error: error.message || 'Erro interno desconhecido.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});