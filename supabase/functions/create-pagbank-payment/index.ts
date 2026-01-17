import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { PagBankClient } from '../_shared/pagbank-client.ts';
import { CreateChargeRequest } from './types.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  parcela_id: string;
  payment_method: 'pix' | 'boleto' | 'credit_card';
  installments?: number;
  admin_id: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { parcela_id, payment_method, installments = 1, admin_id }: RequestBody = await req.json();

    if (!parcela_id || !payment_method || !admin_id) {
      throw new Error('Parâmetros inválidos.');
    }

    const { data: parcela, error: parcelaError } = await supabaseAdmin
      .from('admin_parcelas_receber')
      .select(`
        *,
        admin_contas_receber (
          *,
          tbl_clientes (
            nome, email, telefone, cpf, cnpj, documento, cep, endereco, numero, bairro, cidade, estado
          )
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
    const valorEmCentavos = Math.round(parcela.valor_parcela * 100);
    const referenceId = `PARCELA_${parcela_id}`;

    let taxId = (cliente.cpf || cliente.cnpj || cliente.documento || '').replace(/\D/g, '');

    const chargeRequest: CreateChargeRequest = {
      reference_id: referenceId,
      customer: {
        name: cliente.nome,
        email: cliente.email || 'cobranca@jotaempresas.com',
        tax_id: taxId,
      },
      items: [
        {
          name: `Parcela ${parcela.numero_parcela} - ${parcela.admin_contas_receber.descricao}`,
          quantity: 1,
          unit_amount: valorEmCentavos,
        },
      ],
      notification_urls: config.webhook_url ? [config.webhook_url] : [],
    };

    if (payment_method === 'pix') {
      const dataVencimento = new Date();
      dataVencimento.setDate(dataVencimento.getDate() + 3);
      chargeRequest.qr_codes = [{ amount: { value: valorEmCentavos }, expiration_date: dataVencimento.toISOString() }];
    }

    const pagbankClient = new PagBankClient(config);
    const chargeResponse = await pagbankClient.createCharge(chargeRequest);

    const qrCode = chargeResponse.qr_codes?.[0]?.links?.find((link) => link.media === 'image/png')?.href || null;
    const qrCodeText = chargeResponse.qr_codes?.[0]?.text || null;

    await supabaseAdmin.from('admin_parcelas_receber').update({
      pagbank_charge_id: chargeResponse.id,
      pagbank_payment_method: payment_method,
      pagbank_status: chargeResponse.status,
      pagbank_qr_code: qrCode,
      pagbank_qr_code_text: qrCodeText,
      pagbank_updated_at: new Date().toISOString(),
    }).eq('id', parcela_id);

    return new Response(JSON.stringify({ success: true, charge_id: chargeResponse.id, qr_code: qrCode, qr_code_text: qrCodeText, status: chargeResponse.status, cliente }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});