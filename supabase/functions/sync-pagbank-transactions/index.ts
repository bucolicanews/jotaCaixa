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

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { parcelaId, manualOrderId } = await req.json();
    if (!parcelaId) throw new Error('ID da parcela não informado.');

    // 1. Buscar a parcela
    const { data: parcela, error: pError } = await supabaseAdmin
      .from('admin_parcelas_receber')
      .select('*')
      .eq('id', parcelaId)
      .single();

    if (pError || !parcela) throw new Error('Parcela não encontrada.');

    // 2. Buscar configuração PagBank
    const { data: config } = await supabaseAdmin
      .from('configuracoes_pagbank')
      .select('*')
      .eq('proprietario_id', parcela.admin_id)
      .single();

    if (!config) throw new Error('Configuração PagBank não encontrada.');

    const token = (config.ambiente === 'producao' ? config.token_producao : config.token_sandbox)?.trim();
    const baseUrl = config.ambiente === 'producao' ? 'https://api.pagseguro.com' : 'https://sandbox.api.pagseguro.com';
    
    let apiStatus = 'UNKNOWN';
    let paymentConfirmed = false;
    let chargeData = null;
    let rawData = null;

    // --- LÓGICA DE BUSCA ---
    
    if (manualOrderId) {
        // BUSCA FORÇADA VIA ORDER ID
        console.log(`[Sync] Forçando busca via Order ID: ${manualOrderId}`);
        const response = await fetch(`${baseUrl}/orders/${manualOrderId}`, {
            headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
        });
        
        if (!response.ok) throw new Error(`Ordem ${manualOrderId} não encontrada no PagBank.`);
        
        rawData = await response.json();
        
        // VALIDAÇÃO CRÍTICA: Verifica se a ordem pertence a ESTA parcela
        const expectedRef = `PARCELA_${parcela.id}`;
        if (rawData.reference_id !== expectedRef) {
            throw new Error(`A transação informada pertence a outra cobrança (Ref: ${rawData.reference_id}).`);
        }
        
        apiStatus = rawData.status;
        paymentConfirmed = ['PAID', 'COMPLETED', 'AUTHORIZED'].includes(apiStatus);
        chargeData = rawData;

    } else {
        // BUSCA AUTOMÁTICA VIA CHECKOUT OU CHARGE
        const resourceId = parcela.pagbank_checkout_id || parcela.pagbank_charge_id;
        if (!resourceId) throw new Error('Transação PagBank não iniciada nesta parcela.');

        const isCheckout = !!parcela.pagbank_checkout_id;
        const endpoint = isCheckout ? `${baseUrl}/checkouts/${resourceId}` : `${baseUrl}/orders/${resourceId}`;
        
        const response = await fetch(endpoint, {
            headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
        });

        if (!response.ok) throw new Error(`Recurso ${resourceId} não encontrado.`);
        
        rawData = await response.json();
        apiStatus = rawData.status;

        if (isCheckout) {
            if (rawData.orders && rawData.orders.length > 0) {
                const paidOrder = rawData.orders.find((o: any) => ['PAID', 'COMPLETED', 'AUTHORIZED'].includes(o.status));
                if (paidOrder) {
                    chargeData = paidOrder;
                    apiStatus = 'PAID';
                    paymentConfirmed = true;
                } else {
                    const sortedOrders = [...rawData.orders].sort((a: any, b: any) => b.id.localeCompare(a.id));
                    apiStatus = sortedOrders[0].status;
                }
            }
        } else {
            paymentConfirmed = ['PAID', 'COMPLETED', 'AUTHORIZED'].includes(apiStatus);
            chargeData = rawData;
        }
    }

    // --- EXECUÇÃO DA BAIXA ---
    if (paymentConfirmed && parcela.status !== 'paga') {
        console.log(`[Sync] Iniciando baixa financeira automática para parcela ${parcela.id}`);
        
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
                id: chargeData?.id || manualOrderId || parcela.pagbank_checkout_id,
                amount: { value: Math.round(parcela.valor_parcela * 100) },
                paid_at: chargeData?.paid_at || new Date().toISOString(),
                charges: chargeData?.charges || []
            })
        });
    } else if (!paymentConfirmed) {
        // Atualiza o status visual
        await supabaseAdmin.from('admin_parcelas_receber').update({ 
            pagbank_status: apiStatus,
            pagbank_updated_at: new Date().toISOString()
        }).eq('id', parcela.id);
    }

    return new Response(JSON.stringify({ 
        success: true, 
        status: apiStatus,
        isPaid: paymentConfirmed,
        rawResponse: rawData
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[Sync Error]', error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});