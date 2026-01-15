import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
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

    const { parcela_id, admin_id, redirect_url } = await req.json();

    console.log('=== INICIO ===');
    console.log('Requisição:', { parcela_id, admin_id });

    if (!parcela_id || !admin_id) {
      throw new Error('parcela_id e admin_id obrigatórios');
    }

    // 1. Buscar parcela
    const { data: parcela, error: parcelaError } = await supabaseAdmin
      .from('admin_parcelas_receber')
      .select(`
        *,
        admin_contas_receber (
          *,
          tbl_clientes (
            nome,
            email,
            cpf,
            cnpj,
            documento,
            telefone
          )
        )
      `)
      .eq('id', parcela_id)
      .single();

    if (parcelaError || !parcela) {
      console.error('Erro ao buscar parcela:', parcelaError);
      throw new Error('Parcela não encontrada');
    }

    console.log('Parcela:', parcela.id);

    if (parcela.status === 'paga') {
      throw new Error('Parcela já paga');
    }

    if (parcela.pagbank_checkout_id) {
      return new Response(
        JSON.stringify({
          success: true,
          checkout_id: parcela.pagbank_checkout_id,
          checkout_link: parcela.pagbank_checkout_link,
          message: 'Checkout já existe',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const clienteId = parcela.admin_contas_receber?.cliente_id;
    if (!clienteId) {
      throw new Error('Cliente não vinculado');
    }

    console.log('Cliente ID:', clienteId);

    // 2. Buscar cliente
    const cliente = parcela.admin_contas_receber?.tbl_clientes;
    if (!cliente) {
      throw new Error('Cliente não encontrado na parcela');
    }

    console.log('Cliente:', cliente.nome);

    // 3. Buscar config
    const { data: config, error: configError } = await supabaseAdmin
      .from('configuracoes_pagbank')
      .select('*')
      .eq('proprietario_id', admin_id)
      .single();

    if (configError || !config) {
      throw new Error('Configuração PagBank não encontrada');
    }

    // 4. Processar CPF/CNPJ
    let taxId = '';
    if (cliente.cpf) {
      taxId = cliente.cpf.replace(/\D/g, '');
    } else if (cliente.cnpj) {
      taxId = cliente.cnpj.replace(/\D/g, '');
    } else if (cliente.documento) {
      taxId = cliente.documento.replace(/\D/g, '');
    }

    console.log('CPF/CNPJ:', taxId);

    if (!taxId || (taxId.length !== 11 && taxId.length !== 14)) {
      return new Response(
        JSON.stringify({ error: `CPF/CNPJ inválido ou não cadastrado para o cliente "${cliente.nome}".` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Processar telefone
    let telefoneArea = '11';
    let telefoneNumero = '999999999';

    if (cliente.telefone) {
      const telefoneClean = cliente.telefone.replace(/\D/g, '');
      console.log('Telefone limpo:', telefoneClean);

      if (telefoneClean.length >= 10) {
        telefoneArea = telefoneClean.substring(0, 2);
        telefoneNumero = telefoneClean.substring(2);
      } else if (telefoneClean.length >= 8) {
        telefoneNumero = telefoneClean;
      }
    }

    console.log('Telefone: DDD', telefoneArea, 'Numero', telefoneNumero);

    // 6. Montar payload
    const valorEmCentavos = Math.round(parcela.valor_parcela * 100);
    const referenceId = `PARCELA_${parcela_id}`;
    const token = config.ambiente === 'sandbox' ? config.token_sandbox : config.token_producao;
    const baseUrl = config.ambiente === 'sandbox' 
      ? 'https://sandbox.api.pagseguro.com' 
      : 'https://api.pagseguro.com';

    const checkoutRequest = {
      reference_id: referenceId,
      customer: {
        name: cliente.nome,
        email: cliente.email || 'cliente.sem.email@jotaempresas.com',
        tax_id: taxId,
      },
      customer_modifiable: true,
      items: [{
        name: `Parcela ${parcela.numero_parcela} - ${parcela.admin_contas_receber.descricao}`,
        quantity: 1,
        unit_amount: valorEmCentavos,
      }],
      payment_methods: [
        { type: 'PIX' },
        { type: 'BOLETO' },
        { type: 'CREDIT_CARD', brands: ['VISA', 'MASTERCARD', 'ELO', 'AMEX', 'HIPERCARD'] },
        { type: 'DEBIT_CARD', brands: ['VISA', 'MASTERCARD', 'ELO'] },
      ],
      payment_methods_configs: [{
        type: 'CREDIT_CARD',
        config_options: [{ option: 'INSTALLMENTS_LIMIT', value: '12' }],
      }],
      notification_urls: config.webhook_url ? [config.webhook_url] : [],
      payment_notification_urls: config.webhook_url ? [config.webhook_url] : [],
    };

    if (redirect_url) {
      checkoutRequest.redirect_url = redirect_url;
    }

    console.log('=== PAYLOAD ===');
    console.log(JSON.stringify(checkoutRequest, null, 2));
    console.log('===============');

    // 7. Enviar ao PagBank
    console.log('Enviando ao PagBank:', baseUrl + '/checkouts');

    const response = await fetch(`${baseUrl}/checkouts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(checkoutRequest),
    });

    const responseText = await response.text();
    console.log('=== RESPOSTA ===');
    console.log('Status:', response.status);
    console.log('Body:', responseText);
    console.log('================');

    if (!response.ok) {
      throw new Error(`PagBank error ${response.status}: ${responseText}`);
    }

    const checkoutResponse = JSON.parse(responseText);
    const payLink = checkoutResponse.links?.find((l: any) => l.rel === 'PAY')?.href || '';

    // 8. Salvar no banco
    await supabaseAdmin
      .from('admin_parcelas_receber')
      .update({
        pagbank_checkout_id: checkoutResponse.id,
        pagbank_checkout_link: payLink,
        pagbank_status: checkoutResponse.status,
        pagbank_updated_at: new Date().toISOString(),
      })
      .eq('id', parcela_id);

    await supabaseAdmin.from('pagbank_transaction_logs').insert({
      proprietario_id: admin_id,
      transaction_type: 'checkout',
      pagbank_id: checkoutResponse.id,
      reference_id: referenceId,
      status: checkoutResponse.status,
      amount: parcela.valor_parcela,
      request_payload: checkoutRequest,
      response_payload: checkoutResponse,
    });

    console.log('=== SUCESSO ===');

    return new Response(
      JSON.stringify({
        success: true,
        checkout_id: checkoutResponse.id,
        checkout_link: payLink,
        status: checkoutResponse.status,
        cliente: { nome: cliente.nome, email: cliente.email, telefone: cliente.telefone },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('=== ERRO ===', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});