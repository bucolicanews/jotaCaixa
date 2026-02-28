import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { PagBankClient } from '../_shared/pagbank-client.ts';
import { CreateChargeRequest } from '../_shared/types.ts';

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

    const { parcela_id, payment_method, admin_id } = await req.json();

    // 1. Buscar parcela e dados do cliente
    const { data: parcela, error: parcelaError } = await supabaseAdmin
      .from('admin_parcelas_receber')
      .select(`
        *,
        admin_contas_receber (
          *,
          tbl_clientes ( nome, email, cpf, cnpj, documento, telefone, cep, endereco, numero, bairro, cidade, estado )
        )
      `)
      .eq('id', parcela_id)
      .single();

    if (parcelaError || !parcela) throw new Error('Parcela não encontrada');

    const { data: config } = await supabaseAdmin
      .from('configuracoes_pagbank')
      .select('*')
      .eq('proprietario_id', admin_id)
      .single();

    if (!config) throw new Error('Configuração PagBank não encontrada.');

    const cliente = parcela.admin_contas_receber?.tbl_clientes;
    if (!cliente) throw new Error('Dados do cliente não encontrados.');

    const valorEmCentavos = Math.round(parcela.valor_parcela * 100);
    
    // 2. Processar Token e URL
    const rawToken = config.ambiente === 'producao' ? config.token_producao : config.token_sandbox;
    const token = (rawToken || '').trim();
    
    if (!token) throw new Error(`Token de ${config.ambiente} não configurado.`);
    
    console.log(`[create-pagbank-payment] Ambiente: ${config.ambiente}. Token status: ${token.length > 10 ? 'Found' : 'Missing/Short'}`);

    // 3. Preparar Request
    let taxId = (cliente.cpf || cliente.cnpj || cliente.documento || '').replace(/\D/g, '');

    console.log('[create-pagbank-payment] Cliente:', {
      nome: cliente.nome,
      cpf: cliente.cpf,
      cnpj: cliente.cnpj,
      documento: cliente.documento,
      taxId_final: taxId
    });

    // Validar se taxId existe e tem tamanho válido (11 para CPF ou 14 para CNPJ)
    if (!taxId || (taxId.length !== 11 && taxId.length !== 14)) {
      throw new Error(`❌ Verifique o cadastro do cliente!\n\nCliente: "${cliente.nome}"\nProblema: CPF/CNPJ ${!taxId ? 'não informado' : 'inválido'}${taxId ? ` (${taxId.length} dígitos)` : ''}.\n\n✅ Solução: Acesse o cadastro do cliente e preencha um CPF válido (11 dígitos) ou CNPJ válido (14 dígitos).`);
    }

    let nomeCliente = cliente.nome.trim();
    if (!nomeCliente.includes(' ')) nomeCliente += ' Cliente';

    const webhookUrl = config.webhook_url || `${Deno.env.get('SUPABASE_URL')}/functions/v1/pagbank-webhook`;

    const chargeRequest: CreateChargeRequest = {
      reference_id: `PARCELA_${parcela_id}`,
      customer: {
        name: nomeCliente,
        email: cliente.email || 'cobranca@jotaempresas.com',
        tax_id: taxId,
      },
      items: [{
        name: `Parcela ${parcela.numero_parcela} - ${parcela.admin_contas_receber.descricao}`,
        quantity: 1,
        unit_amount: valorEmCentavos,
      }],
      notification_urls: [webhookUrl],
    };

    if (payment_method === 'pix') {
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      
      const vencimentoParcela = new Date(parcela.data_vencimento);
      vencimentoParcela.setHours(23, 59, 59, 999); // Final do dia
      
      let dataExpiracao: Date;
      
      // Se a parcela ainda não venceu, usa a data de vencimento
      if (vencimentoParcela > hoje) {
        dataExpiracao = vencimentoParcela;
        console.log(`[create-pagbank-payment] Parcela não vencida. Expira em: ${dataExpiracao.toISOString()}`);
      } else {
        // Se já venceu, usa 7 dias a partir de hoje (ou configurável)
        dataExpiracao = new Date(hoje);
        dataExpiracao.setDate(dataExpiracao.getDate() + 7);
        dataExpiracao.setHours(23, 59, 59, 999);
        console.log(`[create-pagbank-payment] Parcela vencida. Expira em D+7: ${dataExpiracao.toISOString()}`);
      }
      
      chargeRequest.qr_codes = [{ 
        amount: { value: valorEmCentavos }, 
        expiration_date: dataExpiracao.toISOString() 
      }];
    }

    // 4. Executar PagBank Client
    const pagbankClient = new PagBankClient(config as any);
    const chargeResponse = await pagbankClient.createCharge(chargeRequest);

    const qrCode = chargeResponse.qr_codes?.[0]?.links?.find((link: any) => link.media === 'image/png')?.href || null;
    const qrCodeText = chargeResponse.qr_codes?.[0]?.text || null;

    // Gerar URL da página de pagamento (apenas para PIX)
    const pixPaymentPageUrl = payment_method === 'pix' 
      ? `${Deno.env.get('NEXT_PUBLIC_APP_URL') || 'http://localhost:8080'}/pix/${parcela_id}`
      : null;

    // 5. Salvar no banco
    const updateData: any = {
      pagbank_charge_id: chargeResponse.id,
      pagbank_payment_method: payment_method,
      pagbank_status: chargeResponse.status,
      pagbank_updated_at: new Date().toISOString(),
    };

    if (payment_method === 'pix') {
      updateData.pagbank_qr_code = qrCode;
      updateData.pagbank_qr_code_text = qrCodeText;
      updateData.pagbank_payment_link = pixPaymentPageUrl;
      
      // Salvar data de expiração do PIX
      const dataExpiracao = chargeRequest.qr_codes?.[0]?.expiration_date;
      if (dataExpiracao) {
        updateData.pagbank_link_expira_em = dataExpiracao;
      }
    }

    await supabaseAdmin.from('admin_parcelas_receber').update(updateData).eq('id', parcela_id);

    // 6. Log de auditoria
    await supabaseAdmin.from('pagbank_transaction_logs').insert({
      proprietario_id: admin_id,
      transaction_type: 'payment',
      pagbank_id: chargeResponse.id,
      reference_id: `PARCELA_${parcela_id}`,
      status: chargeResponse.status,
      amount: parcela.valor_parcela,
      request_payload: chargeRequest,
      response_payload: chargeResponse,
    });

    // 7. Preparar resposta de acordo com o método
    const responseData: any = { 
      success: true, 
      charge_id: chargeResponse.id,
      cliente: { nome: cliente.nome, email: cliente.email, telefone: cliente.telefone }
    };

    if (payment_method === 'pix') {
      responseData.qr_code = qrCode;
      responseData.qr_code_text = qrCodeText;
      responseData.pix_payment_page_url = pixPaymentPageUrl;
    }

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('PagBank Payment Error:', error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});