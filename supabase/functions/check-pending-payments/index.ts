import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const jobId = crypto.randomUUID().substring(0, 8);
  console.log(`[fallback:${jobId}] Iniciando verificação automática...`);

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    // Busca parcelas pendentes com PagBank não verificadas recentemente
    const { data: parcelas, error: fetchError } = await supabaseAdmin
      .from('admin_parcelas_receber')
      .select('id, admin_id, pagbank_checkout_id, pagbank_charge_id, valor_parcela, last_check_at')
      .in('status', ['aberta', 'parcial', 'reprogramada'])
      .not('pagbank_checkout_id', 'is', null)
      .or(`last_check_at.is.null,last_check_at.lt.${fiveMinutesAgo}`)
      .limit(50);

    if (fetchError || !parcelas) throw fetchError || new Error('Nenhuma parcela encontrada.');

    let paidCount = 0;

    for (const parcela of parcelas) {
      try {
        const { data: config } = await supabaseAdmin
          .from('configuracoes_pagbank')
          .select('*')
          .eq('proprietario_id', parcela.admin_id)
          .single();

        if (!config) continue;

        const token = (config.ambiente === 'producao' ? config.token_producao : config.token_sandbox)?.trim();
        const baseUrl = config.ambiente === 'producao' ? 'https://api.pagseguro.com' : 'https://sandbox.api.pagseguro.com';

        if (!token) continue;

        const resourceId = parcela.pagbank_checkout_id || parcela.pagbank_charge_id;
        const endpoint = parcela.pagbank_checkout_id ? `${baseUrl}/checkouts/${resourceId}` : `${baseUrl}/orders/${resourceId}`;

        const response = await fetch(endpoint, {
          headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
        });

        // Marcar verificação
        await supabaseAdmin.from('admin_parcelas_receber').update({ last_check_at: new Date().toISOString() }).eq('id', parcela.id);

        if (!response.ok) continue;

        const data = await response.json();
        let isPaid = false;
        let chargeData = null;

        if (parcela.pagbank_checkout_id) {
          if (data.orders?.length > 0) {
            chargeData = data.orders.find((o: any) => ['PAID', 'COMPLETED', 'AUTHORIZED'].includes(o.status));
            if (chargeData) isPaid = true;
          }
        } else {
          isPaid = ['PAID', 'COMPLETED', 'AUTHORIZED'].includes(data.status);
          chargeData = data;
        }

        if (isPaid && chargeData) {
          // Chama o webhook internamente para processar a baixa
          const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/pagbank-webhook`;
          await fetch(webhookUrl, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json', 
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` 
            },
            body: JSON.stringify({
              reference_id: `PARCELA_${parcela.id}`,
              status: 'PAID',
              id: chargeData.id,
              amount: { value: Math.round(parcela.valor_parcela * 100) },
              paid_at: chargeData.paid_at || new Date().toISOString(),
              charges: chargeData.charges || []
            })
          });
          paidCount++;
          console.log(`[fallback:${jobId}] Parcela ${parcela.id} baixada via verificação automática.`);
        }
      } catch (err) {
        console.error(`[fallback:${jobId}] Erro na parcela ${parcela.id}:`, err.message);
      }
    }

    return new Response(JSON.stringify({ success: true, checked: parcelas.length, paid: paidCount }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
    });

  } catch (error: any) {
    console.error(`[fallback:${jobId}] Fatal Error:`, error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});