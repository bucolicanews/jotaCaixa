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

    const body = await req.json();
    let { parcelaId, manualOrderId } = body;
    
    if (!parcelaId) throw new Error('ID da parcela não informado.');

    // 1. Buscar a parcela
    const { data: parcela, error: pError } = await supabaseAdmin
      .from('admin_parcelas_receber')
      .select('*')
      .eq('id', parcelaId)
      .single();

    if (pError || !parcela) throw new Error('Parcela não encontrada no banco.');

    // 2. Buscar configuração PagBank
    const { data: config, error: configError } = await supabaseAdmin
      .from('configuracoes_pagbank')
      .select('*')
      .eq('proprietario_id', parcela.admin_id)
      .single();

    if (configError || !config) throw new Error('Configuração PagBank não encontrada.');

    const token = (config.ambiente === 'producao' ? config.token_producao : config.token_sandbox)?.trim();
    const baseUrl = config.ambiente === 'producao' ? 'https://api.pagseguro.com' : 'https://sandbox.api.pagseguro.com';
    
    if (!token) throw new Error('Token do PagBank não configurado.');

    let apiStatus = 'UNKNOWN';
    let paymentConfirmed = false;
    let chargeData = null;
    let rawData = null;

    // --- LÓGICA DE BUSCA FLEXÍVEL ---
    
    let resourceId = manualOrderId || parcela.pagbank_checkout_id || parcela.pagbank_charge_id;
    if (!resourceId) throw new Error('Nenhum ID de transação (manual ou automático) encontrado para esta parcela.');

    // Normalização do ID
    resourceId = resourceId.trim();
    if (!resourceId.startsWith('ORDE_') && !resourceId.startsWith('CHAR_') && !resourceId.startsWith('CHEC_')) {
        resourceId = `ORDE_${resourceId}`;
    }

    const isCheckout = resourceId.startsWith('CHEC_');
    const endpoint = isCheckout ? `${baseUrl}/checkouts/${resourceId}` : `${baseUrl}/orders/${resourceId}`;
    
    const response = await fetch(endpoint, {
        headers: { 
            'Authorization': `Bearer ${token}`, 
            'Accept': 'application/json' 
        }
    });

    if (!response.ok) {
        const errStatus = response.status;
        const errText = await response.text();
        console.error(`[Sync] Erro PagBank (${errStatus}):`, errText);
        
        if (errStatus === 401) throw new Error('Token Inválido ou Sem Permissão.');
        if (errStatus === 404) throw new Error(`Transação ${resourceId} não encontrada no ambiente ${config.ambiente}.`);
        throw new Error(`Erro na API PagBank: ${errStatus}`);
    }
    
    rawData = await response.json();

    // --- EXTRAÇÃO DE STATUS CORRIGIDA ---
    if (isCheckout) {
        // Para checkouts, o status PAGO está dentro do array 'orders'
        const paidOrder = rawData.orders?.find((o: any) => ['PAID', 'COMPLETED', 'AUTHORIZED'].includes(o.status));
        if (paidOrder) {
            paymentConfirmed = true;
            chargeData = paidOrder;
            apiStatus = paidOrder.status;
        } else {
            apiStatus = rawData.status || 'UNKNOWN';
        }
    } else {
        // Para orders/charges, o status está na raiz
        const chargeDetail = rawData.charges?.[0] || rawData;
        apiStatus = chargeDetail.status || rawData.status || 'UNKNOWN';
        paymentConfirmed = ['PAID', 'COMPLETED', 'AUTHORIZED'].includes(apiStatus);
        chargeData = chargeDetail;
    }
    // --- FIM DA CORREÇÃO ---

    // --- EXECUÇÃO DA BAIXA ---
    if (paymentConfirmed && parcela.status !== 'paga') {
        const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/pagbank-webhook`;
        const webRes = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` 
            },
            body: JSON.stringify({
                reference_id: `PARCELA_${parcela.id}`,
                status: 'PAID',
                id: chargeData?.id || manualOrderId,
                amount: { value: Math.round(parcela.valor_parcela * 100) },
                paid_at: chargeData?.paid_at || new Date().toISOString(),
                charges: chargeData?.charges || []
            })
        });
        
        if (!webRes.ok) throw new Error('Pagamento confirmado, mas a baixa interna falhou.');
    } else {
        await supabaseAdmin.from('admin_parcelas_receber').update({ 
            pagbank_status: apiStatus,
            pagbank_updated_at: new Date().toISOString()
        }).eq('id', parcela.id);
    }

    return new Response(JSON.stringify({ success: true, status: apiStatus, isPaid: paymentConfirmed, rawResponse: rawData }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});