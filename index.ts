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

    // 1. Captura o corpo bruto para evitar erro de SyntaxError no req.json()
    const rawBody = await req.text();
    let payload: any;

    try {
      payload = JSON.parse(rawBody);
    } catch (e) {
      console.error(`[pagbank-webhook:${requestId}] Erro ao parsear JSON:`, e.message);
      console.error(`[pagbank-webhook:${requestId}] Conteúdo recebido:`, rawBody);
      
      if (rawBody.includes('notificationCode')) {
        return new Response(JSON.stringify({ 
          error: 'O sistema recebeu uma notificação V2 (legada). Configure Webhooks V4 no painel do PagBank.' 
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      throw new Error("Corpo da requisição inválido.");
    }

    console.log(`[pagbank-webhook:${requestId}] Payload recebido com sucesso.`);

    // 2. No Webhook V4, os dados da transação ficam dentro de 'data' ou na raiz
    const charge = payload.data || payload;

    // Extração Resiliente: PagBank alterna entre raiz e array 'charges'
    const chargeDetail = charge.charges?.[0] || charge;
    const currentStatus = chargeDetail.status || charge.status;
    const referenceId = chargeDetail.reference_id || charge.reference_id || "";

    console.log(`[pagbank-webhook:${requestId}] Status identificado: ${currentStatus} para ref: ${referenceId}`);

    if (!referenceId.startsWith('PARCELA_')) {
      console.log(`[pagbank-webhook:${requestId}] Ignorando - reference_id inválido: ${referenceId}`);
      return new Response(JSON.stringify({ success: true, message: 'Ignorado' }), { 
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const parcelaId = referenceId.replace('PARCELA_', '');
    console.log(`[pagbank-webhook:${requestId}] Processando parcela: ${parcelaId}`);

    const { data: parcela, error: pError } = await supabaseAdmin
      .from('admin_parcelas_receber')
      .select(`*, admin_contas_receber(*)`)
      .eq('id', parcelaId)
      .single();

    if (pError || !parcela) {
      console.error(`[pagbank-webhook:${requestId}] Parcela não encontrada:`, parcelaId);
      return new Response(JSON.stringify({ error: 'Parcela não encontrada' }), { status: 404 });
    }

    if (parcela.status === 'paga' && parcela.webhook_processed_at) {
      console.log(`[pagbank-webhook:${requestId}] Já processado.`);
      return new Response(JSON.stringify({ success: true, message: 'Já processado' }), { status: 200 });
    }

    await supabaseAdmin.from('pagbank_transaction_logs').insert({
      proprietario_id: parcela.admin_id,
      transaction_type: 'webhook',
      pagbank_id: chargeDetail.id || charge.id,
      reference_id: String(referenceId),
      status: currentStatus,
      amount: (chargeDetail.amount?.value || charge.amount?.value || 0) / 100,
      response_payload: payload,
    });

    if (currentStatus !== 'PAID' && currentStatus !== 'COMPLETED') {
      console.log(`[pagbank-webhook:${requestId}] Status: ${currentStatus}`);
      await supabaseAdmin.from('admin_parcelas_receber').update({ 
        pagbank_status: currentStatus,
        pagbank_updated_at: new Date().toISOString() 
      }).eq('id', parcelaId);
      return new Response(JSON.stringify({ success: true, message: 'Status atualizado' }), { status: 200 });
    }

    const dataPagamento = charge.paid_at ? charge.paid_at.split('T')[0] : new Date().toISOString().split('T')[0];
    const valorBruto = charge.amount.value / 100;
    const taxa = (charge.charges?.[0]?.payment_method?.fees?.total || charge.fees?.total || 0) / 100;
    const valorLiquido = valorBruto - taxa;

    const { data: config, error: configError } = await supabaseAdmin
      .from('configuracoes_pagbank')
      .select('*')
      .eq('proprietario_id', parcela.admin_id)
      .single();

    if (configError || !config) throw new Error("Configuração PagBank não encontrada.");

    // 3. Atualização do Saldo Bancário (Saldo Real)
    if (config.conta_sintetica_id) {
      const { data: saldoConta } = await supabaseAdmin
        .from('saldo_contas')
        .select('id, saldo_inicial')
        .eq('proprietario_id', parcela.admin_id)
        .eq('conta_contabil_id', config.conta_sintetica_id)
        .maybeSingle();

      if (saldoConta) {
        const novoSaldo = (saldoConta.saldo_inicial || 0) + valorLiquido;
        await supabaseAdmin
          .from('saldo_contas')
          .update({ 
            saldo_inicial: novoSaldo,
            updated_at: new Date().toISOString() 
          })
          .eq('id', saldoConta.id);
      }
    }

    await supabaseAdmin.from('admin_parcelas_receber').update({
      status: 'paga',
      valor_pago: valorBruto,
      data_pagamento: dataPagamento,
      pagbank_status: 'PAID',
      pagbank_charge_id: chargeDetail.id || charge.id,
      pagbank_updated_at: new Date().toISOString(),
      webhook_processed_at: new Date().toISOString(),
    }).eq('id', parcelaId);

    await supabaseAdmin.from('admin_recebimentos').insert({
      parcela_id: parcelaId,
      admin_id: parcela.admin_id,
      cliente_id: parcela.admin_contas_receber.cliente_id,
      valor_recebido: valorBruto,
      data_recebimento: dataPagamento,
      tipo_recebimento: 'total',
      forma_pagamento: 'PagBank',
      id_conta_contabil: config.conta_sintetica_id,
      id_conta_resultado: config.id_conta_resultado,
      pagbank_charge_id: chargeDetail.id || charge.id,
      pagbank_taxa_valor: taxa,
      pagbank_valor_liquido: valorLiquido,
    });

    if (config.conta_sintetica_id && parcela.admin_contas_receber.id_conta_patrimonial) {
      const idAtivo = crypto.randomUUID();
      const idPatrimonial = crypto.randomUUID();
      await supabaseAdmin.from('lancamentos').insert([
        { id: idAtivo, proprietario_id: parcela.admin_id, data_movimentacao: dataPagamento, descricao: `Recebimento PagBank: ${parcela.admin_contas_receber.descricao}`, valor: valorLiquido, tipo: 'Entrada', conta_contabil_id: config.conta_sintetica_id, origem: 'recebimento_pagbank', conciliado: true, conta_resultado_id: idPatrimonial },
        { id: idPatrimonial, proprietario_id: parcela.admin_id, data_movimentacao: dataPagamento, descricao: `Baixa Direito CR: ${parcela.admin_contas_receber.descricao}`, valor: valorLiquido, tipo: 'Saida', conta_contabil_id: parcela.admin_contas_receber.id_conta_patrimonial, origem: 'recebimento_pagbank', conciliado: true, conta_resultado_id: idAtivo }
      ]);
    }

    return new Response(JSON.stringify({ success: true }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 
    });

  } catch (error: any) {
    console.error(`[pagbank-webhook] Erro Fatal:`, error.message);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
