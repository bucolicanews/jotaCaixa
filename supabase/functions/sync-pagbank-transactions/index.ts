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

    const body = await req.json();
    const { parcelaId } = body;

    if (!parcelaId) throw new Error('parcelaId é obrigatório.');

    const { data: parcela, error: parcelaError } = await supabaseAdmin
      .from('admin_parcelas_receber')
      .select('*')
      .eq('id', parcelaId)
      .single();

    if (parcelaError || !parcela) throw new Error('Parcela não encontrada');

    const adminId = parcela.admin_id;
    const { data: config } = await supabaseAdmin
      .from('configuracoes_pagbank')
      .select('*')
      .eq('proprietario_id', adminId)
      .single();

    if (!config) throw new Error('Configuração PagBank não encontrada.');

    const pagbankClient = new PagBankClient(config);
    const token = (config.ambiente === 'producao' ? config.token_producao : config.token_sandbox)?.trim();
    const baseUrl = config.ambiente === 'producao' ? 'https://api.pagseguro.com' : 'https://sandbox.api.pagseguro.com';

    const isCheckout = !!parcela.pagbank_checkout_id;
    const resourceId = parcela.pagbank_checkout_id || parcela.pagbank_charge_id;

    if (!resourceId) throw new Error('Esta parcela não possui ID de transação PagBank gerado.');

    const endpoint = isCheckout ? `${baseUrl}/checkouts/${resourceId}` : `${baseUrl}/orders/${resourceId}`;
    
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API PagBank erro (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const apiStatus = data.status;

    // Se o status mudou, atualiza no banco
    if (apiStatus !== parcela.pagbank_status) {
      await supabaseAdmin
        .from('admin_parcelas_receber')
        .update({ pagbank_status: apiStatus, pagbank_updated_at: new Date().toISOString() })
        .eq('id', parcela.id);

      // Se estiver pago, dispara a lógica de baixa via Webhook interno
      if (apiStatus === 'PAID' || (isCheckout && apiStatus === 'COMPLETED')) {
          // Simulamos o recebimento do webhook para garantir que a baixa contábil ocorra
          const webhookUrl = `https://${Deno.env.get('SUPABASE_URL')?.split('//')[1]}/functions/v1/pagbank-webhook`;
          
          const fakePayload = {
              id: resourceId,
              reference_id: `PARCELA_${parcela.id}`,
              status: 'PAID',
              amount: { value: Math.round(parcela.valor_parcela * 100) },
              paid_at: new Date().toISOString()
          };

          await fetch(webhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': req.headers.get('Authorization') || '' },
              body: JSON.stringify(fakePayload)
          });
      }
    }

    return new Response(JSON.stringify({ success: true, status: apiStatus }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});