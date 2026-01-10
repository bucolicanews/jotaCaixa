import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  parcela_id: string;
  admin_id: string;
  to_email?: string;
}

function generateEmailTemplate(data: {
  clienteNome: string;
  valor: number;
  descricao: string;
  numeroParcela: number;
  dataVencimento: string;
  paymentLink: string;
  qrCode?: string | null;
  empresaNome?: string;
}): string {
  const valorFormatado = data.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const dataFormatada = new Date(data.dataVencimento).toLocaleDateString('pt-BR');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Link de Pagamento</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background-color: #1e40af; padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">${data.empresaNome || 'Cobrança'}</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="color: #1e40af; margin: 0 0 20px 0; font-size: 20px;">Olá, ${data.clienteNome}!</h2>
              
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Segue o link para pagamento da sua parcela:
              </p>
              
              <!-- Info Box -->
              <table width="100%" cellpadding="15" cellspacing="0" style="background-color: #f8fafc; border-radius: 8px; margin-bottom: 30px;">
                <tr>
                  <td>
                    <p style="margin: 0 0 10px 0; color: #64748b; font-size: 14px;">Descrição</p>
                    <p style="margin: 0; color: #1e293b; font-size: 16px; font-weight: bold;">${data.descricao}</p>
                  </td>
                </tr>
                <tr>
                  <td>
                    <p style="margin: 0 0 10px 0; color: #64748b; font-size: 14px;">Parcela</p>
                    <p style="margin: 0; color: #1e293b; font-size: 16px; font-weight: bold;">${data.numeroParcela}</p>
                  </td>
                </tr>
                <tr>
                  <td>
                    <p style="margin: 0 0 10px 0; color: #64748b; font-size: 14px;">Vencimento</p>
                    <p style="margin: 0; color: #1e293b; font-size: 16px; font-weight: bold;">${dataFormatada}</p>
                  </td>
                </tr>
                <tr>
                  <td>
                    <p style="margin: 0 0 10px 0; color: #64748b; font-size: 14px;">Valor</p>
                    <p style="margin: 0; color: #16a34a; font-size: 24px; font-weight: bold;">${valorFormatado}</p>
                  </td>
                </tr>
              </table>
              
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${data.paymentLink}" 
                       style="display: inline-block; background-color: #16a34a; color: #ffffff; text-decoration: none; padding: 15px 40px; border-radius: 8px; font-size: 18px; font-weight: bold;">
                      Pagar Agora
                    </a>
                  </td>
                </tr>
              </table>
              
              ${data.qrCode ? `
              <!-- QR Code Section -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 30px;">
                <tr>
                  <td align="center">
                    <p style="color: #64748b; font-size: 14px; margin: 0 0 15px 0;">Ou escaneie o QR Code PIX:</p>
                    <img src="${data.qrCode}" alt="QR Code PIX" style="width: 200px; height: 200px; border: 1px solid #e2e8f0; border-radius: 8px;">
                  </td>
                </tr>
              </table>
              ` : ''}
              
              <p style="color: #64748b; font-size: 14px; line-height: 1.6; margin: 30px 0 0 0; text-align: center;">
                Você pode escolher pagar via PIX, Boleto ou Cartão de Crédito/Débito.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="color: #94a3b8; font-size: 12px; margin: 0;">
                Este email foi enviado automaticamente. Por favor, não responda.
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
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

    const { parcela_id, admin_id, to_email }: RequestBody = await req.json();

    console.log('Requisição de email recebida:', { parcela_id, admin_id, to_email });

    if (!parcela_id || !admin_id) {
      throw new Error('Parâmetros inválidos: parcela_id e admin_id são obrigatórios');
    }

    const { data: parcela, error: parcelaError } = await supabaseAdmin
      .from('admin_parcelas_receber')
      .select(`
        *,
        admin_contas_receber (
          *,
          tbl_clientes (
            nome,
            email
          )
        )
      `)
      .eq('id', parcela_id)
      .single();

    if (parcelaError || !parcela) {
      throw new Error('Parcela não encontrada');
    }

    const paymentLink = parcela.pagbank_checkout_link || parcela.pagbank_payment_link;
    if (!paymentLink) {
      throw new Error('Link de pagamento não encontrado. Gere o link primeiro.');
    }

    const { data: config, error: configError } = await supabaseAdmin
      .from('configuracoes_pagbank')
      .select('resend_api_key, email_remetente')
      .eq('proprietario_id', admin_id)
      .single();

    const resendApiKey = config?.resend_api_key || Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      throw new Error('Chave API do Resend não configurada');
    }

    const cliente = parcela.admin_contas_receber?.tbl_clientes;
    const destinatario = to_email || cliente?.email;

    if (!destinatario) {
      throw new Error('Email do cliente não encontrado');
    }

    const { data: adminData } = await supabaseAdmin
      .from('tbl_admins')
      .select('nome')
      .eq('id', admin_id)
      .single();

    const emailHtml = generateEmailTemplate({
      clienteNome: cliente?.nome || 'Cliente',
      valor: parcela.valor_parcela,
      descricao: parcela.admin_contas_receber?.descricao || 'Cobrança',
      numeroParcela: parcela.numero_parcela,
      dataVencimento: parcela.data_vencimento,
      paymentLink: paymentLink,
      qrCode: parcela.pagbank_qr_code,
      empresaNome: adminData?.nome,
    });

    const emailRemetente = config?.email_remetente || 'cobranca@resend.dev';

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: emailRemetente,
        to: [destinatario],
        subject: `Cobrança: ${parcela.admin_contas_receber?.descricao} - Parcela ${parcela.numero_parcela}`,
        html: emailHtml,
      }),
    });

    const responseText = await response.text();
    console.log('Resposta Resend:', response.status, responseText);

    if (!response.ok) {
      throw new Error(`Erro ao enviar email: ${responseText}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Email enviado para ${destinatario}`,
        email_id: JSON.parse(responseText).id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Erro:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
