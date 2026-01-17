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
    const { data: config } = await supabaseAdmin
      .from('configuracoes_pagbank')
      .select('*')
      .eq('proprietario_id', parcela.admin_id)
      .single();

    if (!config) throw new Error('Configuração PagBank não encontrada.');

    const token = (config.ambiente === 'producao' ? config.token_producao : config.token_sandbox)?.trim();
    const baseUrl = config.ambiente === 'producao' ? 'https://api.pagseguro.com' : 'https://sandbox.api.pagseguro.com';
    
    if (!token) throw new Error('Token do PagBank não configurado.');

    let apiStatus = 'UNKNOWN';
    let paymentConfirmed = false;
    let chargeData = null;
    let rawData = null;

    // --- LÓGICA DE BUSCA FLEXÍVEL ---
    
    if (manualOrderId) {
        // Normalização do ID: se não começar com ORDE_ ou CHAR_, adiciona ORDE_
        let searchId = manualOrderId.trim();
        if (!searchId.startsWith('ORDE_') && !searchId.startsWith('CHAR_') && !searchId.startsWith('CHEC_')) {
            searchId = `ORDE_${searchId}`;
        }

        console.log(`[Sync] Buscando ID Normalizado: ${searchId} em ${config.ambiente}`);
        
        const response = await fetch(`${baseUrl}/orders/${searchId}`, {
            headers: { 
                'Authorization': `Bearer ${token}`, 
                'Accept': 'application/json' 
            }
        });
        
        if (!response.ok) {
            const errStatus = response.status;
            const errText = await response.text();
            console.error(`[Sync] Erro PagBank (${errStatus}):`, errText);
            
            if (errStatus === 401) throw new Error('Token Inválido ou Sem Permissão. Verifique se o token é de Sandbox ou Produção.');
            if (errStatus === 404) throw new Error(`Transação ${searchId} não encontrada no ambiente ${config.ambiente}.`);
            throw new Error(`Erro na API PagBank: ${errStatus}`);
        }
        
        rawData = await response.json();
        apiStatus = rawData.status;
        paymentConfirmed = ['PAID', 'COMPLETED', 'AUTHORIZED'].includes(apiStatus);
        chargeData = rawData;

    } else {
        // BUSCA AUTOMÁTICA
        const resourceId = parcela.pagbank_checkout_id || parcela.pagbank_charge_id;
        if (!resourceId) throw new Error('Nenhum pagamento foi gerado para esta parcela ainda.');

        const isCheckout = !!parcela.pagbank_checkout_id;
        const endpoint = isCheckout ? `${baseUrl}/checkouts/${resourceId}` : `${baseUrl}/orders/${resourceId}`;
        
        const response = await fetch(endpoint, {
            headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
        });

        if (!response.ok) throw new Error(`Link expirado ou token inválido (${response.status}).`);
        
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
                    apiStatus = rawData.orders[0].status;
                }
            }
        } else {
            paymentConfirmed = ['PAID', 'COMPLETED', 'AUTHORIZED'].includes(apiStatus);
            chargeData = rawData;
        }
    }

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

    return new Response(JSON.stringify({ success: true, status: apiStatus, isPaid: paymentConfirmed }), {
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