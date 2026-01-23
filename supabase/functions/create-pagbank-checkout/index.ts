import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
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

    const { parcela_id, admin_id } = await req.json();

    if (!parcela_id || !admin_id) {
      throw new Error('Parâmetros ausentes: parcela_id e admin_id são obrigatórios.');
    }

    // 1. Buscar parcela e dados do cliente
    const { data: parcela, error: parcelaError } = await supabaseAdmin
      .from('admin_parcelas_receber')
      .select(`
        *,
        admin_contas_receber (
          *,
          tbl_clientes (
            nome, email, cpf, cnpj, documento, telefone,
            cep, endereco, numero, bairro, cidade, estado
          )
        )
      `)
      .eq('id', parcela_id)
      .single();

    if (parcelaError || !parcela) throw new Error('Parcela não encontrada.');

    const cliente = parcela.admin_contas_receber?.tbl_clientes;
    if (!cliente) throw new Error('Dados do cliente não encontrados.');

    // 2. Buscar config do PagBank
    const { data: config, error: configError } = await supabaseAdmin
      .from('configuracoes_pagbank')
      .select('*')
      .eq('proprietario_id', admin_id)
      .single();

    if (configError || !config) throw new Error('Configuração PagBank não encontrada.');

    // 2.5. Calcular data de expiração do link
    const diasExpiracao = config.dias_expiracao_link || 7;
    const dataExpiracao = new Date();
    dataExpiracao.setDate(dataExpiracao.getDate() + diasExpiracao);
    const expirationDate = dataExpiracao.toISOString();

    console.log(`[create-pagbank-checkout] Link expira em: ${diasExpiracao} dias (${expirationDate})`);

    // 3. Processar Token e URL
    const rawToken = config.ambiente === 'producao' ? config.token_producao : config.token_sandbox;
    const token = (rawToken || '').trim();
    const baseUrl = config.ambiente === 'producao' ? 'https://api.pagseguro.com' : 'https://sandbox.api.pagseguro.com';

    if (!token) throw new Error(`Token de ${config.ambiente} não configurado.`);
    
    console.log(`[create-pagbank-checkout] Ambiente: ${config.ambiente}. Token status: ${token.length > 10 ? 'Found' : 'Missing/Short'}`);

    // 4. Preparar Payload
    let taxId = (cliente.cpf || cliente.cnpj || cliente.documento || '').replace(/\D/g, '');
    let nomeCliente = cliente.nome.trim();
    if (!nomeCliente.includes(' ')) nomeCliente += ' Cliente';

    const webhookUrl = config.webhook_url || `${Deno.env.get('SUPABASE_URL')}/functions/v1/pagbank-webhook`;
    console.log(`[create-pagbank-checkout] Webhook URL: ${webhookUrl}`);

    const checkoutRequest = {
      reference_id: `PARCELA_${parcela_id}_${Date.now()}`,
      expiration_date: expirationDate,
      customer: {
        name: nomeCliente,
        email: cliente.email || 'cobranca@jotaempresas.com',
        tax_id: taxId,
      },
      customer_modifiable: true,
      items: [{
        name: `Parcela ${parcela.numero_parcela} - ${parcela.admin_contas_receber.descricao}`,
        quantity: 1,
        unit_amount: Math.round(parcela.valor_parcela * 100),
      }],
      payment_methods: [
        { type: 'PIX' },
        { type: 'BOLETO' },
        { type: 'CREDIT_CARD', brands: ['VISA', 'MASTERCARD', 'ELO', 'AMEX', 'HIPERCARD'] },
      ],
      notification_urls: [webhookUrl],
    };

    // 5. Executar Chamada
    const response = await fetch(`${baseUrl}/checkouts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(checkoutRequest),
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error(`[create-pagbank-checkout] Error ${response.status}:`, responseText);
      throw new Error(`PagBank (${response.status}): ${responseText}`);
    }

    const checkoutResponse = JSON.parse(responseText);
    const payLink = checkoutResponse.links?.find((l: any) => l.rel === 'PAY')?.href || '';

    // Salvar no banco
    await supabaseAdmin
      .from('admin_parcelas_receber')
      .update({
        pagbank_checkout_id: checkoutResponse.id,
        pagbank_checkout_link: payLink,
        pagbank_link_expira_em: expirationDate,
        pagbank_status: 'WAITING',
        pagbank_updated_at: new Date().toISOString(),
      })
      .eq('id', parcela_id);

    // Log de criação
    await supabaseAdmin.from('pagbank_transaction_logs').insert({
      proprietario_id: admin_id,
      transaction_type: 'payment',
      pagbank_id: checkoutResponse.id,
      reference_id: `PARCELA_${parcela_id}`,
      status: 'WAITING',
      amount: parcela.valor_parcela,
      request_payload: checkoutRequest,
      response_payload: checkoutResponse,
    });

    return new Response(
      JSON.stringify({
        success: true,
        checkout_id: checkoutResponse.id,
        checkout_link: payLink,
        cliente: { nome: nomeCliente, email: cliente.email, telefone: cliente.telefone },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    console.error('[create-pagbank-checkout] Fatal Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});