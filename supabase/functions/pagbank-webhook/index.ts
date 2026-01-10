import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { WebhookPayload } from './types.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-pagbank-signature',
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

    const payload: WebhookPayload = await req.json();
    
    console.log('Webhook recebido:', JSON.stringify(payload, null, 2));

    if (!payload.reference_id || !payload.reference_id.startsWith('PARCELA_')) {
      throw new Error('reference_id inválido');
    }

    const parcelaId = payload.reference_id.replace('PARCELA_', '');

    const { data: parcela, error: parcelaError } = await supabaseAdmin
      .from('admin_parcelas_receber')
      .select(`
        *,
        admin_contas_receber (
          id,
          descricao,
          cliente_id,
          id_conta_patrimonial,
          id_conta_resultado
        )
      `)
      .eq('id', parcelaId)
      .single();

    if (parcelaError || !parcela) {
      console.error('Parcela não encontrada:', parcelaId);
      throw new Error('Parcela não encontrada');
    }

    const adminId = parcela.admin_id;

    // Buscar proprietário: verifica se é admin ou usuário
    let proprietarioId = adminId;
    
    const { data: usuario } = await supabaseAdmin
      .from('tbl_usuarios')
      .select('admin_id')
      .eq('id', adminId)
      .single();

    if (usuario && usuario.admin_id) {
      proprietarioId = usuario.admin_id;
    }

    const { data: config, error: configError } = await supabaseAdmin
      .from('configuracoes_pagbank')
      .select('*')
      .eq('proprietario_id', proprietarioId)
      .single();

    if (configError || !config) {
      throw new Error('Configuração PagBank não encontrada');
    }

    await supabaseAdmin.from('pagbank_transaction_logs').insert({
      proprietario_id: proprietarioId,
      transaction_type: 'webhook',
      pagbank_id: payload.id,
      reference_id: payload.reference_id,
      status: payload.status,
      amount: payload.amount.value / 100,
      response_payload: payload,
    });

    if (payload.status !== 'PAID') {
      await supabaseAdmin
        .from('admin_parcelas_receber')
        .update({
          pagbank_status: payload.status,
          pagbank_updated_at: new Date().toISOString(),
        })
        .eq('id', parcelaId);

      return new Response(
        JSON.stringify({ success: true, message: 'Status atualizado, mas não processado (não PAID)' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    if (parcela.status === 'paga') {
      console.log('Parcela já está paga, ignorando webhook');
      return new Response(
        JSON.stringify({ success: true, message: 'Parcela já processada' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    const valorBruto = payload.amount.value / 100;
    const taxaPagBank = (payload.charges?.[0]?.amount?.fees || 0) / 100;
    const valorLiquido = valorBruto - taxaPagBank;

    const dataPagamento = payload.paid_at 
      ? new Date(payload.paid_at).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    // Validar se o valor pago é igual ao valor da parcela
    const valorParcelaOriginal = parseFloat(parcela.valor_parcela || 0);
    const diferencaValor = Math.abs(valorBruto - valorParcelaOriginal);
    
    if (diferencaValor > 0.01) {
      console.warn(`ATENÇÃO: Valor pago (${valorBruto}) diferente do valor da parcela (${valorParcelaOriginal})`);
    }

    const { error: updateParcelaError } = await supabaseAdmin
      .from('admin_parcelas_receber')
      .update({
        status: 'paga',
        valor_pago: valorBruto,
        data_pagamento: dataPagamento,
        pagbank_status: 'PAID',
        pagbank_updated_at: new Date().toISOString(),
      })
      .eq('id', parcelaId);

    if (updateParcelaError) {
      throw new Error(`Erro ao atualizar parcela: ${updateParcelaError.message}`);
    }

    const { data: saldoConta, error: saldoContaError } = await supabaseAdmin
      .from('saldo_contas')
      .select('id')
      .eq('proprietario_id', proprietarioId)
      .eq('conta_contabil_id', config.conta_sintetica_id)
      .single();

    if (saldoContaError || !saldoConta) {
      throw new Error('Conta PagBank não encontrada no cadastro de Bancos/Caixas');
    }

    const { error: recebimentoError } = await supabaseAdmin
      .from('admin_recebimentos')
      .insert({
        parcela_id: parcelaId,
        admin_id: adminId,
        cliente_id: parcela.admin_contas_receber.cliente_id,
        valor_recebido: valorBruto,
        data_recebimento: dataPagamento,
        tipo_recebimento: 'total',
        forma_pagamento: 'PagBank',
        conta_id: saldoConta.id,
        id_conta_contabil: config.conta_sintetica_id,
        historico_id: config.historico_padrao_id,
        id_conta_resultado: config.id_conta_resultado,
        pagbank_charge_id: payload.id,
        pagbank_taxa_valor: taxaPagBank,
        pagbank_valor_liquido: valorLiquido,
      });

    if (recebimentoError) {
      throw new Error(`Erro ao criar recebimento: ${recebimentoError.message}`);
    }

    const lancamentoAtivoId = crypto.randomUUID();
    const lancamentoCRCreditoId = crypto.randomUUID();

    if (config.conta_sintetica_id) {
      await supabaseAdmin.from('lancamentos').insert({
        id: lancamentoAtivoId,
        proprietario_id: proprietarioId,
        data_movimentacao: dataPagamento,
        descricao: `Recebimento PagBank - ${parcela.admin_contas_receber.descricao} (Parcela ${parcela.numero_parcela})`,
        valor: valorLiquido,
        tipo: 'Entrada',
        conta_bancaria_id: saldoConta.id,
        conta_contabil_id: config.conta_sintetica_id,
        origem: 'recebimento_pagbank',
        conciliado: true,
        historico_id: config.historico_padrao_id,
        conta_resultado_id: lancamentoCRCreditoId,
      });
    }

    if (parcela.admin_contas_receber.id_conta_patrimonial) {
      await supabaseAdmin.from('lancamentos').insert({
        id: lancamentoCRCreditoId,
        proprietario_id: proprietarioId,
        data_movimentacao: dataPagamento,
        descricao: `Estorno Patrimonial CR - Pagamento Parcela ${parcela.numero_parcela}`,
        valor: valorLiquido,
        tipo: 'Saida',
        conta_bancaria_id: null,
        conta_contabil_id: parcela.admin_contas_receber.id_conta_patrimonial,
        origem: 'recebimento_pagbank',
        conciliado: true,
        historico_id: config.historico_padrao_id,
        conta_resultado_id: lancamentoAtivoId,
      });
    }

    if (taxaPagBank > 0 && config.conta_despesa_taxa_id) {
      const lancamentoDespesaId = crypto.randomUUID();
      const lancamentoTaxaCreditoId = crypto.randomUUID();

      await supabaseAdmin.from('lancamentos').insert({
        id: lancamentoDespesaId,
        proprietario_id: proprietarioId,
        data_movimentacao: dataPagamento,
        descricao: `Taxa PagBank - Cobrança ${payload.id}`,
        valor: taxaPagBank,
        tipo: 'Entrada',
        conta_bancaria_id: null,
        conta_contabil_id: config.conta_despesa_taxa_id,
        origem: 'taxa_pagbank',
        conciliado: true,
        historico_id: config.historico_taxa_id,
        conta_resultado_id: lancamentoTaxaCreditoId,
      });

      await supabaseAdmin.from('lancamentos').insert({
        id: lancamentoTaxaCreditoId,
        proprietario_id: proprietarioId,
        data_movimentacao: dataPagamento,
        descricao: `Saída Taxa PagBank - Cobrança ${payload.id}`,
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

    console.log(`Webhook processado com sucesso para parcela ${parcelaId}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Pagamento processado com sucesso',
        parcela_id: parcelaId,
        valor_liquido: valorLiquido,
        taxa: taxaPagBank,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Erro ao processar webhook PagBank:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
