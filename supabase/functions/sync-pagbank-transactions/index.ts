import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { PagBankClient } from '../_shared/pagbank-client.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { parcelaId } = await req.json();

    const { data: parcela, error: pError } = await supabaseAdmin
      .from('admin_parcelas_receber')
      .select('*')
      .eq('id', parcelaId)
      .single();

    if (pError || !parcela) throw new Error('Parcela não encontrada');

    const { data: config } = await supabaseAdmin
      .from('configuracoes_pagbank')
      .select('*')
      .eq('proprietario_id', parcela.admin_id)
      .single();

    if (!config) throw new Error('Configuração PagBank não encontrada.');

    const pagbankClient = new PagBankClient(config);
    const resourceId = parcela.pagbank_checkout_id || parcela.pagbank_charge_id;
    
    if (!resourceId) throw new Error('Sem ID de transação.');

    const isCheckout = !!parcela.pagbank_checkout_id;
    const token = (config.ambiente === 'producao' ? config.token_producao : config.token_sandbox)?.trim();
    const baseUrl = config.ambiente === 'producao' ? 'https://api.pagseguro.com' : 'https://sandbox.api.pagseguro.com';
    const endpoint = isCheckout ? `${baseUrl}/checkouts/${resourceId}` : `${baseUrl}/orders/${resourceId}`;
    
    const response = await fetch(endpoint, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
    });

    const data = await response.json();
    const apiStatus = data.status;

    if (apiStatus !== parcela.pagbank_status) {
      await supabaseAdmin.from('admin_parcelas_receber').update({ pagbank_status: apiStatus }).eq('id', parcela.id);
      
      if (apiStatus === 'PAID' || apiStatus === 'COMPLETED') {
          // Gatilho para processamento de baixa
          await fetch(`https://${Deno.env.get('SUPABASE_URL')?.split('//')[1]}/functions/v1/pagbank-webhook`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': req.headers.get('Authorization') || '' },
              body: JSON.stringify({ reference_id: `PARCELA_${parcela.id}`, status: 'PAID', amount: { value: Math.round(parcela.valor_parcela * 100) } })
          });
      }
    }

    return new Response(JSON.stringify({ success: true, status: apiStatus }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});