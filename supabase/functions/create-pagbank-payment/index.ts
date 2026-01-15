import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { PagBankClient } from './pagbank-client.ts';
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
    // Usar Service Role Key para ter acesso completo
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { parcela_id, payment_method, installments = 1, admin_id }: RequestBody = await req.json();

    console.log('Requisição recebida:', { parcela_id, payment_method, installments, admin_id });

    if (!parcela_id || !payment_method || !admin_id) {
      throw new Error('Parâmetros inválidos: parcela_id, payment_method e admin_id são obrigatórios');
    }

    const { data: parcela, error: parcelaError } = await supabaseAdmin
      .from('admin_parcelas_receber')
      .select(`
        *,
        admin_contas_receber (
          *,
          tbl_clientes (
            nome,
            email,
            telefone,
            cpf,
            cnpj,
            documento,
            cep,
            endereco,
            numero,
            bairro,
            cidade,
            estado
          )
        )
      `)
      .eq('id', parcela_id)
      .single();

    if (parcelaError || !parcela) {
      console.error('Erro ao buscar parcela:', parcelaError);
      throw new Error('Parcela não encontrada');
    }

    console.log('Parcela encontrada:', parcela.id);

    if (parcela.status === 'paga') {
      throw new Error('Parcela já está paga');
    }

    if (parcela.pagbank_charge_id) {
      throw new Error('Já existe uma cobrança PagBank para esta parcela');
    }

    const { data: config, error: configError } = await supabaseAdmin
      .from('configuracoes_pagbank')
      .select('*')
      .eq('proprietario_id', admin_id)
      .single();

    if (configError || !config) {
      console.error('Erro ao buscar configuração PagBank:', configError);
      throw new Error('Configuração PagBank não encontrada. Configure em Configurações > PagBank');
    }

    console.log('Configuração PagBank encontrada:', {
      ambiente: config.ambiente,
      has_token_sandbox: !!config.token_sandbox,
      has_token_producao: !!config.token_producao,
    });

    const cliente = parcela.admin_contas_receber?.tbl_clientes;
    if (!cliente) {
      throw new Error('Cliente não encontrado');
    }

    console.log('Cliente encontrado:', {
      nome: cliente.nome,
      email: cliente.email,
      cpf: cliente.cpf,
      cnpj: cliente.cnpj,
      documento: cliente.documento,
    });

    const valorEmCentavos = Math.round(parcela.valor_parcela * 100);
    const referenceId = `PARCELA_${parcela_id}`;

    // Limpar e validar CPF/CNPJ - prioridade: cpf > cnpj > documento
    let taxId = '';
    if (cliente.cpf) {
      taxId = cliente.cpf.replace(/\D/g, '');
    } else if (cliente.cnpj) {
      taxId = cliente.cnpj.replace(/\D/g, '');
    } else if (cliente.documento) {
      taxId = cliente.documento.replace(/\D/g, '');
    }

    // Validar se o taxId tem tamanho correto
    if (taxId.length !== 11 && taxId.length !== 14) {
      return new Response(
        JSON.stringify({ error: `CPF/CNPJ inválido ou não cadastrado para o cliente "${cliente.nome}".` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Tax ID formatado:', taxId, '(length:', taxId.length, ')');

    const chargeRequest: CreateChargeRequest = {
      reference_id: referenceId,
      customer: {
        name: cliente.nome,
        email: cliente.email,
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
      const dataVencimento = new Date(parcela.data_vencimento);
      dataVencimento.setDate(dataVencimento.getDate() + 3);
      
      chargeRequest.qr_codes = [
        {
          amount: { value: valorEmCentavos },
          expiration_date: dataVencimento.toISOString(),
        },
      ];
    } else if (payment_method === 'boleto') {
        const dataVencimento = new Date(parcela.data_vencimento);
        dataVencimento.setDate(dataVencimento.getDate() + 3); // 3 dias de tolerância

        const postalCode = (cliente.cep || '00000000').replace(/\D/g, '');
        if (postalCode.length !== 8) {
            return new Response(
            JSON.stringify({ error: `CEP inválido para o cliente "${cliente.nome}". O boleto exige um CEP de 8 dígitos.` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        chargeRequest.charges = [{
            reference_id: `CHARGE_BOLETO_${parcela_id}`,
            description: `Parcela ${parcela.numero_parcela} - ${parcela.admin_contas_receber.descricao}`,
            amount: { value: valorEmCentavos, currency: 'BRL' },
            payment_method: {
            type: 'BOLETO',
            boleto: {
                due_date: dataVencimento.toISOString().split('T')[0],
                instruction_lines: {
                line_1: 'Não receber após o vencimento.',
                line_2: `Referente a: ${parcela.admin_contas_receber.descricao}`,
                },
                holder: {
                name: cliente.nome,
                tax_id: taxId,
                email: cliente.email,
                address: {
                    street: cliente.endereco || 'Não informado',
                    number: cliente.numero || 'S/N',
                    locality: cliente.bairro || 'Não informado',
                    city: cliente.cidade || 'Não informada',
                    region_code: cliente.estado || 'SP',
                    country: 'BRA',
                    postal_code: postalCode,
                }
                }
            }
            }
        }];
    }

    console.log('Criando cobrança PagBank:', JSON.stringify(chargeRequest, null, 2));

    const pagbankClient = new PagBankClient(config);
    const chargeResponse = await pagbankClient.createCharge(chargeRequest);

    console.log('Resposta PagBank:', JSON.stringify(chargeResponse, null, 2));

    const qrCode = chargeResponse.qr_codes?.[0]?.links?.find((link) => link.media === 'image/png')?.href || null;
    const qrCodeText = chargeResponse.qr_codes?.[0]?.text || null;
    const boletoLink = chargeResponse.charges?.[0]?.links?.find(l => l.media === 'application/pdf')?.href || null;
    const boletoBarcode = chargeResponse.charges?.[0]?.payment_method?.boleto?.barcode || null;

    const updateData: Record<string, unknown> = {
      pagbank_charge_id: chargeResponse.id,
      pagbank_payment_method: payment_method,
      pagbank_status: chargeResponse.status,
      pagbank_updated_at: new Date().toISOString(),
    };

    if (payment_method === 'pix') {
      updateData.pagbank_qr_code = qrCode;
      updateData.pagbank_qr_code_text = qrCodeText;
    } else if (payment_method === 'boleto') {
        updateData.pagbank_boleto_pdf_url = boletoLink;
        updateData.pagbank_boleto_barcode = boletoBarcode;
        updateData.pagbank_payment_link = boletoLink;
    }

    const { error: updateError } = await supabaseAdmin
      .from('admin_parcelas_receber')
      .update(updateData)
      .eq('id', parcela_id);

    if (updateError) {
      console.error('Erro ao atualizar parcela:', updateError);
    }

    await supabaseAdmin.from('pagbank_transaction_logs').insert({
      proprietario_id: admin_id,
      transaction_type: 'payment',
      pagbank_id: chargeResponse.id,
      reference_id: referenceId,
      status: chargeResponse.status,
      amount: parcela.valor_parcela,
      request_payload: chargeRequest,
      response_payload: chargeResponse,
    });

    return new Response(
      JSON.stringify({
        success: true,
        charge_id: chargeResponse.id,
        qr_code: qrCode,
        qr_code_text: qrCodeText,
        boleto_pdf_url: boletoLink,
        boleto_barcode: boletoBarcode,
        status: chargeResponse.status,
        cliente: {
          nome: cliente.nome,
          email: cliente.email,
          telefone: cliente.telefone,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Erro ao criar cobrança PagBank:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});