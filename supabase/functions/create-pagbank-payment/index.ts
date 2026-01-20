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
    
    // 2. Preparar Request
    let taxId = (cliente.cpf || cliente.cnpj || cliente.documento || '').replace(/\D/g, '');
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
      const vcto = new Date();
      vcto.setDate(vcto.getDate() + 3);
      chargeRequest.qr_codes = [{ amount: { value: valorEmCentavos }, expiration_date: vcto.toISOString() }];
    }

    // 3. Executar PagBank Client
    const pagbankClient = new PagBankClient(config as any); // Passando config para o cliente
    const chargeResponse = await pagbankClient.createCharge(chargeRequest);

    const qrCode = chargeResponse.qr_codes?.[0]?.links?.find((link: any) => link.media === 'image/png')?.href || null;
    const qrCodeText = chargeResponse.qr_codes?.[0]?.text || null;

    // 4. Salvar no banco
    await supabaseAdmin.from('admin_parcelas_receber').update({
      pagbank_charge_id: chargeResponse.id,
      pagbank_payment_method: payment_method,
      pagbank_status: chargeResponse.status,
      pagbank_qr_code: qrCode,
      pagbank_qr_code_text: qrCodeText,
      pagbank_updated_at: new Date().toISOString(),
    }).eq('id', parcela_id);

    // 5. Log de auditoria
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

    return new Response(JSON.stringify({ 
      success: true, 
      charge_id: chargeResponse.id, 
      qr_code: qrCode, 
      qr_code_text: qrCodeText,
      cliente: { nome: cliente.nome, email: cliente.email, telefone: cliente.telefone }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('PagBank Payment Error:', error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});