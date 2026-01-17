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

    const { parcelaId } = await req.json();
    if (!parcelaId) throw new Error('ID da parcela não informado.');

    console.log(`[sync-pagbank] Sincronizando parcela: ${parcelaId}`);

    // 1. Buscar a parcela
    const { data: parcela, error: pError } = await supabaseAdmin
      .from('admin_parcelas_receber')
      .select('*')
      .eq('id', parcelaId)
      .single();

    if (pError || !parcela) throw new Error('Parcela não encontrada.');
    if (parcela.status === 'paga') {
        return new Response(JSON.stringify({ success: true, status: 'PAID', already_paid: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    // 2. Buscar configuração PagBank
    const { data: config } = await supabaseAdmin
      .from('configuracoes_pagbank')
      .select('*')
      .eq('proprietario_id', parcela.admin_id)
      .single();

    if (!config) throw new Error('Configuração PagBank não encontrada para este admin.');

    const token = (config.ambiente === 'producao' ? config.token_producao : config.token_sandbox)?.trim();
    const baseUrl = config.ambiente === 'producao' ? 'https://api.pagseguro.com' : 'https://sandbox.api.pagseguro.com';
    
    const resourceId = parcela.pagbank_checkout_id || parcela.pagbank_charge_id;
    if (!resourceId) throw new Error('Transação PagBank não iniciada nesta parcela.');

    const isCheckout = !!parcela.pagbank_checkout_id;
    const endpoint = isCheckout ? `${baseUrl}/checkouts/${resourceId}` : `${baseUrl}/orders/${resourceId}`;
    
    console.log(`[sync-pagbank] Chamando API PagBank: ${endpoint}`);

    const response = await fetch(endpoint, {
      headers: { 
          'Authorization': `Bearer ${token}`, 
          'Accept': 'application/json' 
      }
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Erro API PagBank (${response.status}): ${errText}`);
    }

    const data = await response.json();
    let apiStatus = data.status;
    let paymentFound = false;
    let chargeData = null;

    // Lógica para Checkout: vasculha as ordens geradas pelo link
    if (isCheckout && data.orders && data.orders.length > 0) {
        // Busca qualquer ordem paga ou concluída
        const paidOrder = data.orders.find((o: any) => 
            ['PAID', 'COMPLETED', 'AUTHORIZED', 'IN_ANALYSIS'].includes(o.status)
        );
        
        if (paidOrder) {
            console.log(`[sync-pagbank] Ordem encontrada no checkout. Status: ${paidOrder.status}`);
            chargeData = paidOrder;
            if (paidOrder.status === 'PAID' || paidOrder.status === 'COMPLETED') {
                apiStatus = 'PAID';
                paymentFound = true;
            }
        }
    } else if (!isCheckout && (apiStatus === 'PAID' || apiStatus === 'COMPLETED')) {
        paymentFound = true;
        chargeData = data;
    }

    // 3. Atualizar o status do PagBank na parcela
    console.log(`[sync-pagbank] Status final detectado: ${apiStatus}`);
    
    await supabaseAdmin.from('admin_parcelas_receber').update({ 
        pagbank_status: apiStatus,
        pagbank_updated_at: new Date().toISOString()
    }).eq('id', parcela.id);

    // 4. Se foi pago, disparar a baixa via webhook interno
    if (paymentFound) {
        console.log("[sync-pagbank] Pagamento detectado! Forçando baixa no sistema...");
        
        const webhookPayload = {
            reference_id: `PARCELA_${parcela.id}`,
            status: 'PAID',
            id: chargeData?.id || resourceId,
            amount: { value: Math.round(parcela.valor_parcela * 100) },
            paid_at: chargeData?.paid_at || new Date().toISOString(),
            charges: chargeData?.charges || []
        };

        const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/pagbank-webhook`;
        
        try {
            const webhookRes = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json', 
                    'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` 
                },
                body: JSON.stringify(webhookPayload)
            });
            
            if (!webhookRes.ok) {
                const whErr = await webhookRes.text();
                console.error(`[sync-pagbank] Erro ao processar baixa: ${whErr}`);
            } else {
                console.log("[sync-pagbank] Baixa processada com sucesso.");
            }
        } catch (webhookErr) {
            console.error("[sync-pagbank] Falha ao chamar webhook interno:", webhookErr);
        }
    }

    return new Response(JSON.stringify({ 
        success: true, 
        status: apiStatus,
        isPaid: paymentFound
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[sync-pagbank] Erro:', error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});