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
        proprietarioId,
        updatesSaldoContas, 
        updatesConfigCR, 
        updatesConfigCP, 
        updatesConfigStripe, 
        updatesConfigContrato, 
        updatesLancamentos,
        updatesPlanoContasBooleans 
    } = body;

    const supabaseService = createClient(
      (Deno.env.get('SUPABASE_URL') as any)!,
      (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as any)!,
      { auth: { persistSession: false } }
    );
    
    console.log(`LOG: Iniciando remapeamento para ${proprietarioId}`);

    // Agrupa promessas para execução paralela
    const promises = [];

    if (updatesSaldoContas?.length) promises.push(supabaseService.from('saldo_contas').upsert(updatesSaldoContas));
    if (updatesConfigCR?.length) promises.push(supabaseService.from('configuracao_contas_receber').upsert(updatesConfigCR));
    if (updatesConfigCP?.length) promises.push(supabaseService.from('configuracao_contas_pagar').upsert(updatesConfigCP));
    
    // Stripe e Contratos são registros únicos por proprietário, usamos upsert seguro
    if (updatesConfigStripe?.length) promises.push(supabaseService.from('configuracoes_stripe').upsert(updatesConfigStripe));
    if (updatesConfigContrato?.length) promises.push(supabaseService.from('configuracao_contratos').upsert(updatesConfigContrato));
    
    // Atualiza marcações no novo Plano
    if (updatesPlanoContasBooleans?.length) promises.push(supabaseService.from('plano_contas').upsert(updatesPlanoContasBooleans));

    await Promise.all(promises);

    // Atualiza Lançamentos em lote por ID de conta (mais performático que um por um)
    if (updatesLancamentos?.length) {
        for (const u of updatesLancamentos) {
            const { error: lErr } = await supabaseService
                .from('lancamentos')
                .update({ [u.field]: u.new_conta_contabil_id })
                .eq('proprietario_id', proprietarioId)
                .eq(u.field, u.old_conta_contabil_id);
            
            if (lErr) console.warn(`Aviso: Falha ao atualizar lançamentos da conta ${u.old_conta_contabil_id}:`, lErr);
        }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 ERRO CRÍTICO no remapeamento:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});