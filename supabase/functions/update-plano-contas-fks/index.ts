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
    const { 
        updatesSaldoContas, 
        updatesConfigCR, 
        updatesConfigCP, 
        updatesConfigStripe, 
        updatesConfigContrato, 
        updatesPlanoContasBooleans 
    } = body;

    // Inicializar Supabase Client com SERVICE ROLE KEY (ignora RLS)
    const supabaseService = createClient(
      (Deno.env.get('SUPABASE_URL') as any)!,
      (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as any)!,
      { auth: { persistSession: false } }
    );
    
    // 1. Executar todas as atualizações de FKs
    const updatePromises = [
        supabaseService.from('saldo_contas').upsert(updatesSaldoContas, { onConflict: 'id' }),
        supabaseService.from('configuracao_contas_receber').upsert(updatesConfigCR, { onConflict: 'id' }),
        supabaseService.from('configuracao_contas_pagar').upsert(updatesConfigCP, { onConflict: 'id' }),
        supabaseService.from('configuracoes_stripe').upsert(updatesConfigStripe, { onConflict: 'id' }),
        supabaseService.from('configuracao_contratos').upsert(updatesConfigContrato, { onConflict: 'id' }),
    ];
    
    // 2. Atualizar os booleanos no novo Plano de Contas
    if (updatesPlanoContasBooleans && updatesPlanoContasBooleans.length > 0) {
        updatePromises.push(
            supabaseService.from('plano_contas').upsert(updatesPlanoContasBooleans, { onConflict: 'id' })
        );
    }
    
    const results = await Promise.all(updatePromises);
    
    // Verificar se houve algum erro nas atualizações
    for (const res of results) {
        if (res.error) {
            console.error('Edge Function Error: Failed to update FKs or Booleans:', res.error);
            throw new Error('Falha ao atualizar referências contábeis: ' + res.error.message);
        }
    }

    // Retorna 200 com sucesso
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 FATAL ERROR in update-plano-contas-fks:', error);
    const message = error instanceof Error ? error.message : 'Unknown error.';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});