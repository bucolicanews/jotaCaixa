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

    if (parcelaError || !parcela) throw new Error('Parcela não encontrada.');
    if (parcela.status === 'paga') throw new Error('Esta parcela já está quitada.');

    const cliente = parcela.admin_contas_receber?.tbl_clientes;
    if (!cliente) throw new Error('Dados do cliente não encontrados na parcela.');

    // 2. Buscar config do PagBank
    const { data: config, error: configError } = await supabaseAdmin
      .from('configuracoes_pagbank')
      .select('*')
      .eq('proprietario_id', admin_id)
      .single();

    if (configError || !config) throw new Error('Configuração PagBank não encontrada para este administrador.');

    // 3. Validação do Nome (PagBank exige pelo menos duas strings no nome)
    let nomeCliente = cliente.nome.trim();
    if (!nomeCliente.includes(' ')) {
        // Fallback: Adiciona um sobrenome genérico se for apenas um nome (comum em cadastros incompletos)
        nomeCliente = `${nomeCliente} Cliente`;
    }

    // 4. Processar CPF/CNPJ
    let taxId = (cliente.cpf || cliente.cnpj || cliente.documento || '').replace(/\D/g, '');
    if (!taxId || (taxId.length !== 11 && taxId.length !== 14)) {
      throw new Error(`CPF/CNPJ inválido (${taxId || 'vazio'}) para o cliente "${cliente.nome}".`);
    }

    // 5. Configurações de API
    const valorEmCentavos = Math.round(parcela.valor_parcela * 100);
    const referenceId = `PARCELA_${parcela_id}`;
    const token = config.ambiente === 'producao' ? config.token_producao : config.token_sandbox;
    const baseUrl = config.ambiente === 'producao' ? 'https://api.pagseguro.com' : 'https://sandbox.api.pagseguro.com';

    if (!token) throw new Error(`Token de ${config.ambiente} não configurado.`);

    const checkoutRequest = {
      reference_id: referenceId,
      customer: {
        name: nomeCliente,
        email: cliente.email || 'cobranca@jotaempresas.com',
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
      ],
      payment_methods_configs: [{
        type: 'CREDIT_CARD',
        config_options: [{ option: 'INSTALLMENTS_LIMIT', value: '12' }],
      }],
      notification_urls: config.webhook_url ? [config.webhook_url] : [],
    };

    console.log(`[PagBank] Criando checkout em ${config.ambiente} para: ${nomeCliente}`);

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
      // Extrai erro detalhado do PagBank
      let errorDetail = responseText;
      try {
          const errObj = JSON.parse(responseText);
          if (errObj.error_messages) errorDetail = errObj.error_messages.map((m: any) => m.description).join(', ');
      } catch (e) {}
      throw new Error(`PagBank (${response.status}): ${errorDetail}`);
    }

    const checkoutResponse = JSON.parse(responseText);
    const payLink = checkoutResponse.links?.find((l: any) => l.rel === 'PAY')?.href || '';

    // Salvar no banco
    await supabaseAdmin
      .from('admin_parcelas_receber')
      .update({
        pagbank_checkout_id: checkoutResponse.id,
        pagbank_checkout_link: payLink,
        pagbank_status: 'WAITING',
        pagbank_updated_at: new Date().toISOString(),
      })
      .eq('id', parcela_id);

    // Log de Auditoria
    await supabaseAdmin.from('pagbank_transaction_logs').insert({
      proprietario_id: admin_id,
      transaction_type: 'checkout',
      pagbank_id: checkoutResponse.id,
      reference_id: referenceId,
      status: 'SUCCESS',
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
    console.error('[PagBank Error]', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});