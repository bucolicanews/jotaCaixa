import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { PagBankClient } from './pagbank-client.ts';
import { RequestBody, CreateTransferRequest } from './types.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      throw new Error('Não autorizado');
    }

    const { parcela_pagar_id, recipient }: RequestBody = await req.json();

    if (!parcela_pagar_id || !recipient) {
      throw new Error('Parâmetros inválidos: parcela_pagar_id e recipient são obrigatórios');
    }

    if (!recipient.name || !recipient.tax_id || !recipient.bank_account) {
      throw new Error('Dados do destinatário incompletos');
    }

    const { bank_account } = recipient;
    if (!bank_account.holder || !bank_account.bank || !bank_account.branch || !bank_account.account || !bank_account.type) {
      throw new Error('Dados bancários do destinatário incompletos');
    }

    const { data: parcela, error: parcelaError } = await supabaseClient
      .from('admin_parcelas_pagar')
      .select(`
        *,
        admin_contas_pagar (
          *,
          tbl_fornecedores (
            razao_social,
            nome_fantasia
          )
        )
      `)
      .eq('id', parcela_pagar_id)
      .single();

    if (parcelaError || !parcela) {
      throw new Error('Parcela a pagar não encontrada');
    }

    if (parcela.status === 'paga') {
      throw new Error('Parcela já está paga');
    }

    if (parcela.pagbank_transfer_id) {
      throw new Error('Já existe uma transferência PagBank para esta parcela');
    }

    const { data: adminId } = await supabaseClient.rpc('get_admin_id_for_current_user');

    if (!adminId) {
      throw new Error('Admin não encontrado');
    }

    const { data: config, error: configError } = await supabaseClient
      .from('configuracoes_pagbank')
      .select('*')
      .eq('proprietario_id', adminId)
      .single();

    if (configError || !config) {
      throw new Error('Configuração PagBank não encontrada. Configure em Configurações > PagBank');
    }

    const valorEmCentavos = Math.round(parcela.valor_parcela * 100);
    const referenceId = `PAGAMENTO_${parcela_pagar_id}`;

    const transferRequest: CreateTransferRequest = {
      reference_id: referenceId,
      amount: {
        value: valorEmCentavos,
      },
      recipient: {
        name: recipient.name,
        tax_id: recipient.tax_id.replace(/\D/g, ''),
        bank_account: {
          holder: bank_account.holder,
          tax_id: recipient.tax_id.replace(/\D/g, ''),
          bank: bank_account.bank,
          branch: bank_account.branch,
          account: bank_account.account,
          account_digit: bank_account.account_digit,
          type: bank_account.type,
        },
      },
      description: `Pagamento Parcela ${parcela.numero_parcela} - ${parcela.admin_contas_pagar?.descricao || 'Conta a Pagar'}`,
    };

    const pagbankClient = new PagBankClient(config);
    const transferResponse = await pagbankClient.createTransfer(transferRequest);

    const { error: updateError } = await supabaseClient
      .from('admin_parcelas_pagar')
      .update({
        pagbank_transfer_id: transferResponse.id,
        pagbank_status: transferResponse.status,
        pagbank_updated_at: new Date().toISOString(),
      })
      .eq('id', parcela_pagar_id);

    if (updateError) {
      console.error('Erro ao atualizar parcela:', updateError);
    }

    await supabaseClient.from('pagbank_transaction_logs').insert({
      proprietario_id: adminId,
      transaction_type: 'transfer',
      pagbank_id: transferResponse.id,
      reference_id: referenceId,
      status: transferResponse.status,
      amount: parcela.valor_parcela,
      request_payload: transferRequest,
      response_payload: transferResponse,
    });

    if (transferResponse.status === 'COMPLETED') {
      const dataPagamento = new Date().toISOString().split('T')[0];
      const taxaPagBank = (transferResponse.amount?.fees || 0) / 100;
      const valorBruto = parcela.valor_parcela;

      const { error: updateParcelaError } = await supabaseClient
        .from('admin_parcelas_pagar')
        .update({
          status: 'paga',
          valor_pago: valorBruto,
          data_pagamento: dataPagamento,
        })
        .eq('id', parcela_pagar_id);

      if (updateParcelaError) {
        console.error('Erro ao marcar parcela como paga:', updateParcelaError);
      }

      const { data: saldoConta, error: saldoContaError } = await supabaseClient
        .from('saldo_contas')
        .select('id')
        .eq('proprietario_id', adminId)
        .eq('conta_contabil_id', config.conta_sintetica_id)
        .single();

      if (!saldoContaError && saldoConta) {
        const { error: pagamentoError } = await supabaseClient
          .from('admin_pagamentos')
          .insert({
            parcela_id: parcela_pagar_id,
            admin_id: adminId,
            fornecedor_id: parcela.admin_contas_pagar?.fornecedor_id,
            valor_pago: valorBruto,
            data_pagamento: dataPagamento,
            tipo_pagamento: 'total',
            forma_pagamento: 'PagBank',
            conta_id: saldoConta.id,
            id_conta_contabil: config.conta_sintetica_id,
            historico_id: config.historico_padrao_id,
            id_conta_resultado: config.id_conta_resultado,
            pagbank_transfer_id: transferResponse.id,
            pagbank_taxa_valor: taxaPagBank,
          });

        if (pagamentoError) {
          console.error('Erro ao criar pagamento:', pagamentoError);
        }

        const lancamentoPagtoId = crypto.randomUUID();
        const lancamentoCPDebitoId = crypto.randomUUID();

        if (config.conta_sintetica_id) {
          await supabaseClient.from('lancamentos').insert({
            id: lancamentoPagtoId,
            proprietario_id: adminId,
            data_movimentacao: dataPagamento,
            descricao: `Pagamento PagBank - ${parcela.admin_contas_pagar?.descricao || 'CP'} (Parcela ${parcela.numero_parcela})`,
            valor: valorBruto,
            tipo: 'Saida',
            conta_bancaria_id: saldoConta.id,
            conta_contabil_id: config.conta_sintetica_id,
            origem: 'pagamento_pagbank',
            conciliado: true,
            historico_id: config.historico_padrao_id,
            conta_resultado_id: lancamentoCPDebitoId,
          });
        }

        if (parcela.admin_contas_pagar?.id_conta_patrimonial) {
          await supabaseClient.from('lancamentos').insert({
            id: lancamentoCPDebitoId,
            proprietario_id: adminId,
            data_movimentacao: dataPagamento,
            descricao: `Estorno Patrimonial CP - Pagamento Parcela ${parcela.numero_parcela}`,
            valor: valorBruto,
            tipo: 'Entrada',
            conta_bancaria_id: null,
            conta_contabil_id: parcela.admin_contas_pagar.id_conta_patrimonial,
            origem: 'pagamento_pagbank',
            conciliado: true,
            historico_id: config.historico_padrao_id,
            conta_resultado_id: lancamentoPagtoId,
          });
        }

        if (taxaPagBank > 0 && config.conta_despesa_taxa_id) {
          const lancamentoDespesaId = crypto.randomUUID();
          const lancamentoTaxaDebitoId = crypto.randomUUID();

          await supabaseClient.from('lancamentos').insert({
            id: lancamentoDespesaId,
            proprietario_id: adminId,
            data_movimentacao: dataPagamento,
            descricao: `Taxa PagBank - Transferência ${transferResponse.id}`,
            valor: taxaPagBank,
            tipo: 'Entrada',
            conta_bancaria_id: null,
            conta_contabil_id: config.conta_despesa_taxa_id,
            origem: 'taxa_pagbank',
            conciliado: true,
            historico_id: config.historico_taxa_id,
            conta_resultado_id: lancamentoTaxaDebitoId,
          });

          await supabaseClient.from('lancamentos').insert({
            id: lancamentoTaxaDebitoId,
            proprietario_id: adminId,
            data_movimentacao: dataPagamento,
            descricao: `Saída Taxa PagBank - Transferência ${transferResponse.id}`,
            valor: taxaPagBank,
            tipo: 'Saida',
            conta_bancaria_id: saldoConta.id,
            conta_contabil_id: config.conta_sintetica_id,
            origem: 'taxa_pagbank',
            conciliado: true,
            historico_id: config.historico_taxa_id,
            conta_resultado_id: lancamentoDespesaId,
          });
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        transfer_id: transferResponse.id,
        status: transferResponse.status,
        reference_id: referenceId,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Erro ao criar transferência PagBank:', error);

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
