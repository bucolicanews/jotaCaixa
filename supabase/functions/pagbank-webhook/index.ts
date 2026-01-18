import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID().substring(0, 8);
  console.log(`[pagbank-webhook:${requestId}] Recebido em ${new Date().toISOString()}`);

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const payload = await req.json();
    console.log(`[pagbank-webhook:${requestId}] Payload:`, JSON.stringify(payload));

    if (!payload.reference_id || !payload.reference_id.startsWith('PARCELA_')) {
      console.log(`[pagbank-webhook:${requestId}] Ignorando - reference_id inválido`);
      return new Response(JSON.stringify({ success: true, message: 'Ignorado' }), { 
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const parcelaId = payload.reference_id.replace('PARCELA_', '');
    console.log(`[pagbank-webhook:${requestId}] Processando parcela: ${parcelaId}`);

    const { data: parcela, error: pError } = await supabaseAdmin
      .from('admin_parcelas_receber')
      .select(`*, admin_contas_receber(*)`)
      .eq('id', parcelaId)
      .single();

    if (pError || !parcela) {
      console.error(`[pagbank-webhook:${requestId}] Parcela não encontrada:`, parcelaId, pError);
      return new Response(JSON.stringify({ error: 'Parcela não encontrada' }), { 
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[pagbank-webhook:${requestId}] Parcela encontrada. Status atual: ${parcela.status}`);

    if (parcela.status === 'paga' && parcela.webhook_processed_at) {
      console.log(`[pagbank-webhook:${requestId}] IDEMPOTÊNCIA: Já processado em ${parcela.webhook_processed_at}`);
      return new Response(JSON.stringify({ success: true, message: 'Já processado' }), { 
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    await supabaseAdmin.from('pagbank_transaction_logs').insert({
      proprietario_id: parcela.admin_id,
      transaction_type: 'webhook',
      pagbank_id: payload.id,
      reference_id: payload.reference_id,
      status: payload.status,
      amount: payload.amount?.value / 100,
      response_payload: payload,
    });

    if (payload.status !== 'PAID' && payload.status !== 'COMPLETED') {
      console.log(`[pagbank-webhook:${requestId}] Status não é PAID/COMPLETED: ${payload.status}`);
      await supabaseAdmin.from('admin_parcelas_receber').update({ 
        pagbank_status: payload.status,
        pagbank_updated_at: new Date().toISOString() 
      }).eq('id', parcelaId);
      return new Response(JSON.stringify({ success: true, message: `Status atualizado para ${payload.status}` }), { status: 200 });
    }

    console.log(`[pagbank-webhook:${requestId}] Status confirmado: PAID. Processando...`);

    const dataPagamento = payload.paid_at ? payload.paid_at.split('T')[0] : new Date().toISOString().split('T')[0];
    const valorBruto = payload.amount.value / 100;
    const taxa = (payload.charges?.[0]?.amount?.fees || 0) / 100;
    const valorLiquido = valorBruto - taxa;

    console.log(`[pagbank-webhook:${requestId}] Valores - Bruto: ${valorBruto}, Taxa: ${taxa}, Líquido: ${valorLiquido}`);

    const { data: config, error: configError } = await supabaseAdmin
      .from('configuracoes_pagbank')
      .select('*')
      .eq('proprietario_id', parcela.admin_id)
      .single();

    if (configError || !config) {
      throw new Error(`Configuração PagBank não encontrada: ${configError?.message}`);
    }

    console.log(`[pagbank-webhook:${requestId}] Config encontrada. Conta sintética: ${config.conta_sintetica_id}`);

    const { error: updError } = await supabaseAdmin.from('admin_parcelas_receber').update({
      status: 'paga',
      valor_pago: valorBruto,
      data_pagamento: dataPagamento,
      pagbank_status: 'PAID',
      pagbank_charge_id: payload.id,
      pagbank_updated_at: new Date().toISOString(),
      webhook_processed_at: new Date().toISOString(),
    }).eq('id', parcelaId);

    if (updError) throw updError;
    console.log(`[pagbank-webhook:${requestId}] Parcela atualizada com sucesso`);

    const { data: saldoConta, error: saldoError } = await supabaseAdmin
      .from('saldo_contas')
      .select('id, saldo_inicial')
      .eq('proprietario_id', parcela.admin_id)
      .eq('conta_contabil_id', config.conta_sintetica_id)
      .maybeSingle();

    if (saldoError) {
      console.error(`[pagbank-webhook:${requestId}] Erro ao buscar saldo:`, saldoError);
    }

    console.log(`[pagbank-webhook:${requestId}] Saldo conta - ID: ${saldoConta?.id}, Saldo atual: ${saldoConta?.saldo_inicial}`);

    if (saldoConta) {
      const novoSaldo = (saldoConta.saldo_inicial || 0) + valorLiquido;
      console.log(`[pagbank-webhook:${requestId}] Atualizando saldo de ${saldoConta.saldo_inicial} para ${novoSaldo}`);
      
      const { error: updateSaldoError } = await supabaseAdmin
        .from('saldo_contas')
        .update({
          saldo_inicial: novoSaldo,
          updated_at: new Date().toISOString()
        })
        .eq('id', saldoConta.id);

      if (updateSaldoError) {
        console.error(`[pagbank-webhook:${requestId}] Erro ao atualizar saldo:`, updateSaldoError);
      } else {
        console.log(`[pagbank-webhook:${requestId}] Saldo atualizado com sucesso`);
      }
    }

    const { error: recebimentoError } = await supabaseAdmin.from('admin_recebimentos').insert({
      parcela_id: parcelaId,
      admin_id: parcela.admin_id,
      cliente_id: parcela.admin_contas_receber.cliente_id,
      valor_recebido: valorBruto,
      data_recebimento: dataPagamento,
      tipo_recebimento: 'total',
      forma_pagamento: 'PagBank',
      conta_id: saldoConta?.id || null,
      id_conta_contabil: config.conta_sintetica_id,
      historico_id: config.historico_padrao_id,
      id_conta_resultado: config.id_conta_resultado,
      pagbank_charge_id: payload.id,
      pagbank_taxa_valor: taxa,
      pagbank_valor_liquido: valorLiquido,
    });

    if (recebimentoError) {
      console.error(`[pagbank-webhook:${requestId}] Erro ao criar recebimento:`, recebimentoError);
      throw recebimentoError;
    }
    console.log(`[pagbank-webhook:${requestId}] Recebimento criado com sucesso`);

    if (config.conta_sintetica_id && parcela.admin_contas_receber.id_conta_patrimonial) {
      const idAtivo = crypto.randomUUID();
      const idPatrimonial = crypto.randomUUID();
      
      const lancamentosData = [
        {
          id: idAtivo,
          proprietario_id: parcela.admin_id,
          data_movimentacao: dataPagamento,
          descricao: `Recebimento PagBank: ${parcela.admin_contas_receber.descricao}`,
          valor: valorLiquido,
          tipo: 'Entrada',
          conta_bancaria_id: saldoConta?.id || null,
          conta_contabil_id: config.conta_sintetica_id,
          origem: 'recebimento_pagbank',
          conciliado: true,
          conta_resultado_id: idPatrimonial
        },
        {
          id: idPatrimonial,
          proprietario_id: parcela.admin_id,
          data_movimentacao: dataPagamento,
          descricao: `Baixa Direito CR: ${parcela.admin_contas_receber.descricao}`,
          valor: valorLiquido,
          tipo: 'Saida',
          conta_contabil_id: parcela.admin_contas_receber.id_conta_patrimonial,
          origem: 'recebimento_pagbank',
          conciliado: true,
          conta_resultado_id: idAtivo
        }
      ];

      const { error: lancError } = await supabaseAdmin.from('lancamentos').insert(lancamentosData);

      if (lancError) {
        console.error(`[pagbank-webhook:${requestId}] Erro ao criar lançamentos:`, lancError);
        throw lancError;
      }
      console.log(`[pagbank-webhook:${requestId}] Lançamentos contábeis criados com sucesso`);
    }

    console.log(`[pagbank-webhook:${requestId}] Parcela ${parcelaId} processada com sucesso!`);
    return new Response(JSON.stringify({ success: true, parcela_id: parcelaId }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
    });

  } catch (error: any) {
    console.error(`[pagbank-webhook:${requestId}] Fatal Error:`, error.message, error.stack);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});