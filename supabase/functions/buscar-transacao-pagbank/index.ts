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
    const { codigo_transacao, admin_id } = body;
    
    if (!codigo_transacao) throw new Error('Código da transação não informado.');
    if (!admin_id) throw new Error('ID do admin não informado.');

    console.log(`[buscar-transacao-pagbank] Buscando transação: ${codigo_transacao}`);

    // 1. Buscar configuração PagBank
    const { data: config, error: configError } = await supabaseAdmin
      .from('configuracoes_pagbank')
      .select('*')
      .eq('proprietario_id', admin_id)
      .single();

    if (configError || !config) throw new Error('Configuração PagBank não encontrada.');

    const token = (config.ambiente === 'producao' ? config.token_producao : config.token_sandbox)?.trim();
    const baseUrl = config.ambiente === 'producao' ? 'https://api.pagseguro.com' : 'https://sandbox.api.pagseguro.com';
    
    if (!token) throw new Error('Token do PagBank não configurado.');

    // 2. Normalizar o código da transação
    let resourceId = codigo_transacao.trim();
    
    // 3. Determinar o tipo e endpoint
    let endpoint = '';
    let tipoTransacao = '';
    let usarBuscaPorReferencia = false;
    
    if (resourceId.startsWith('CHEC_')) {
      endpoint = `${baseUrl}/checkouts/${resourceId}`;
      tipoTransacao = 'CHECKOUT';
    } else if (resourceId.startsWith('ORDE_')) {
      endpoint = `${baseUrl}/orders/${resourceId}`;
      tipoTransacao = 'ORDER';
    } else if (resourceId.startsWith('CHAR_')) {
      endpoint = `${baseUrl}/charges/${resourceId}`;
      tipoTransacao = 'CHARGE';
    } else {
      // Se não começa com CHEC_, ORDE_ ou CHAR_, tentar adicionar ORDE_ como prefixo
      resourceId = `ORDE_${resourceId}`;
      endpoint = `${baseUrl}/orders/${resourceId}`;
      tipoTransacao = 'ORDER';
    }

    console.log(`[buscar-transacao-pagbank] Tipo: ${tipoTransacao}, Endpoint: ${endpoint}, Busca por referência: ${usarBuscaPorReferencia}`);

    // 4. Buscar transação no PagBank
    const response = await fetch(endpoint, {
      headers: { 
        'Authorization': `Bearer ${token}`, 
        'Accept': 'application/json' 
      }
    });

    // 5. Tratar erro 404 (não encontrado)
    if (response.status === 404) {
      console.log(`[buscar-transacao-pagbank] Transação ${resourceId} não encontrada no PagBank`);
      return new Response(
        JSON.stringify({
          success: false,
          not_found: true,
          message: `Transação ${resourceId} não encontrada no ambiente ${config.ambiente}.`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // 6. Tratar outros erros
    if (!response.ok) {
      const errStatus = response.status;
      const errText = await response.text();
      console.error(`[buscar-transacao-pagbank] Erro PagBank (${errStatus}):`, errText);
      
      if (errStatus === 401) throw new Error('Token Inválido ou Sem Permissão.');
      throw new Error(`Erro na API PagBank: ${errStatus}`);
    }
    
    const rawData = await response.json();
    console.log(`[buscar-transacao-pagbank] Dados recebidos:`, JSON.stringify(rawData, null, 2));

    // 7. Extrair informações da transação
    let transacaoData = rawData;
    let status = 'UNKNOWN';
    let valor_bruto = 0;
    let valor_liquido = 0;
    let taxa = 0;

    if (tipoTransacao === 'CHECKOUT') {
      // Para checkouts, status pode estar na raiz ou em orders
      status = transacaoData.status || 'UNKNOWN';
      
      // Primeiro, tentar obter o valor do checkout (sempre disponível)
      valor_bruto = (transacaoData.amount?.value || 0) / 100;
      
      // Verificar se existe ordem paga dentro do checkout
      const paidOrder = transacaoData.orders?.find((o: any) => 
        ['PAID', 'COMPLETED', 'AUTHORIZED'].includes(o.status)
      );
      
      if (paidOrder) {
        status = paidOrder.status;
        const charge = paidOrder.charges?.[0];
        
        if (charge) {
          valor_bruto = (charge.amount?.value || valor_bruto * 100) / 100;
          valor_liquido = (charge.payment_response?.raw_data?.paid_amount?.value || 0) / 100;
          
          // Se não tem valor líquido, assumir que é igual ao bruto (sem taxa ainda)
          if (valor_liquido === 0) {
            valor_liquido = valor_bruto;
          }
          
          taxa = valor_bruto - valor_liquido;
        }
      } else {
        // Se não há ordem paga, verificar charges ou usar valor do checkout
        const firstCharge = transacaoData.charges?.[0];
        if (firstCharge) {
          valor_bruto = (firstCharge.amount?.value || valor_bruto * 100) / 100;
          valor_liquido = (firstCharge.payment_response?.raw_data?.paid_amount?.value || 0) / 100;
        }
        
        // Para status ACTIVE, assumir valor líquido = bruto se não houver informação
        if (valor_liquido === 0 && valor_bruto > 0) {
          // Estimar taxa padrão do PagBank (aproximadamente 4.5%)
          taxa = valor_bruto * 0.045;
          valor_liquido = valor_bruto - taxa;
        }
      }
    } else if (tipoTransacao === 'ORDER') {
      // Para orders
      const charge = transacaoData.charges?.[0] || transacaoData;
      status = charge.status || transacaoData.status || 'UNKNOWN';
      valor_bruto = (charge.amount?.value || transacaoData.amount?.value || 0) / 100;
      valor_liquido = (charge.payment_response?.raw_data?.paid_amount?.value || 0) / 100;
      
      // Se não tem valor líquido, estimar taxa
      if (valor_liquido === 0 && valor_bruto > 0) {
        taxa = valor_bruto * 0.045;
        valor_liquido = valor_bruto - taxa;
      } else {
        taxa = valor_bruto - valor_liquido;
      }
    } else if (tipoTransacao === 'CHARGE') {
      // Para charges diretas
      status = transacaoData.status || 'UNKNOWN';
      valor_bruto = (transacaoData.amount?.value || 0) / 100;
      valor_liquido = (transacaoData.payment_response?.raw_data?.paid_amount?.value || 0) / 100;
      
      // Se não tem valor líquido, estimar taxa
      if (valor_liquido === 0 && valor_bruto > 0) {
        taxa = valor_bruto * 0.045;
        valor_liquido = valor_bruto - taxa;
      } else {
        taxa = valor_bruto - valor_liquido;
      }
    }

    console.log(`[buscar-transacao-pagbank] Status: ${status}, Bruto: ${valor_bruto}, Líquido: ${valor_liquido}, Taxa: ${taxa}`);

    // 8. Retornar sucesso com dados
    return new Response(
      JSON.stringify({
        success: true,
        found: true,
        status,
        valor_bruto,
        valor_liquido,
        taxa,
        tipo_transacao: tipoTransacao,
        raw_data: rawData
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    console.error('[buscar-transacao-pagbank] Erro:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }), 
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
