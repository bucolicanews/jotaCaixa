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
    console.log("[sync-pagbank] Iniciando sincronização manual...");
    
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { parcelaId } = await req.json();
    if (!parcelaId) throw new Error('ID da parcela não informado.');

    // 1. Buscar a parcela
    const { data: parcela, error: pError } = await supabaseAdmin
      .from('admin_parcelas_receber')
      .select('*')
      .eq('id', parcelaId)
      .single();

    if (pError || !parcela) throw new Error('Parcela não encontrada no banco de dados.');
    if (parcela.status === 'paga') {
        return new Response(JSON.stringify({ success: true, status: 'PAID', message: 'Parcela já estava paga.' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    // 2. Buscar configuração
    const { data: config } = await supabaseAdmin
      .from('configuracoes_pagbank')
      .select('*')
      .eq('proprietario_id', parcela.admin_id)
      .single();

    if (!config) throw new Error('Configuração PagBank não encontrada.');

    const token = (config.ambiente === 'producao' ? config.token_producao : config.token_sandbox)?.trim();
    const baseUrl = config.ambiente === 'producao' ? 'https://api.pagseguro.com' : 'https://sandbox.api.pagseguro.com';
    
    const resourceId = parcela.pagbank_checkout_id || parcela.pagbank_charge_id;
    if (!resourceId) throw new Error('Esta parcela não possui uma transação PagBank iniciada.');

    const isCheckout = !!parcela.pagbank_checkout_id;
    const endpoint = isCheckout ? `${baseUrl}/checkouts/${resourceId}` : `${baseUrl}/orders/${resourceId}`;
    
    console.log(`[sync-pagbank] Consultando API PagBank: ${endpoint}`);

    const response = await fetch(endpoint, {
      headers: { 
          'Authorization': `Bearer ${token}`, 
          'Accept': 'application/json' 
      }
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Erro na API PagBank (${response.status}): ${errText}`);
    }

    const data = await response.json();
    let apiStatus = data.status;
    let paymentFound = false;
    let chargeData = null;

    // Lógica especial para Checkout: verifica se há cobranças pagas na lista
    if (isCheckout && data.orders && data.orders.length > 0) {
        // Busca a primeira ordem que tenha status PAID ou COMPLETED
        const paidOrder = data.orders.find((o: any) => o.status === 'PAID' || o.status === 'COMPLETED');
        if (paidOrder) {
            console.log("[sync-pagbank] Pagamento detectado na lista de ordens do checkout.");
            apiStatus = 'PAID';
            paymentFound = true;
            chargeData = paidOrder;
        }
    } else if (!isCheckout && (apiStatus === 'PAID' || apiStatus === 'COMPLETED')) {
        paymentFound = true;
        chargeData = data;
    }

    console.log(`[sync-pagbank] Status API: ${apiStatus}`);

    // 3. Se o status mudou ou foi detectado pagamento, atualiza o sistema
    if (apiStatus !== parcela.pagbank_status || paymentFound) {
      
      await supabaseAdmin.from('admin_parcelas_receber').update({ 
          pagbank_status: apiStatus,
          pagbank_updated_at: new Date().toISOString()
      }).eq('id', parcela.id);
      
      if (paymentFound) {
          console.log("[sync-pagbank] Disparando processamento de baixa...");
          
          // Prepara o payload simulando um webhook para a função de baixa
          const webhookPayload = {
              reference_id: `PARCELA_${parcela.id}`,
              status: 'PAID',
              id: chargeData?.id || resourceId,
              amount: { value: Math.round(parcela.valor_parcela * 100) },
              paid_at: chargeData?.paid_at || new Date().toISOString(),
              charges: chargeData?.charges || []
          };

          // Chama a função de webhook internamente (ou via fetch se preferir)
          // Aqui usamos fetch para manter a independência das funções
          const functionUrl = `https://${Deno.env.get('SUPABASE_URL')?.split('//')[1]}/functions/v1/pagbank-webhook`;
          
          try {
              await fetch(functionUrl, {
                  method: 'POST',
                  headers: { 
                      'Content-Type': 'application/json', 
                      'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}` 
                  },
                  body: JSON.stringify(webhookPayload)
              });
          } catch (webhookErr) {
              console.error("[sync-pagbank] Erro ao chamar webhook de baixa:", webhookErr);
          }
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
    console.error('[sync-pagbank] Erro crítico:', error.message);
    return new Response(JSON.stringify({ 
        success: false, 
        error: error.message 
    }), { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});