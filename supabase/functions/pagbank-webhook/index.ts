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

    const charge = payload.data || payload;
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

    let parcelaId = referenceId.replace('PARCELA_', '');
    if (parcelaId.includes('_')) {
      const originalId = parcelaId;
      parcelaId = parcelaId.split('_')[0];
      console.log(`[pagbank-webhook:${requestId}] ⚠️ Formato antigo detectado. ID original: ${originalId}, ID extraído: ${parcelaId}`);
    }
    
    console.log(`[pagbank-webhook:${requestId}] Processando parcela: ${parcelaId}`);

    const { data: parcela, error: pError } = await supabaseAdmin
      .from('admin_parcelas_receber')
      .select(`*, admin_contas_receber(*)`)
      .eq('id', parcelaId)
      .single();

    if (pError || !parcela) {
      console.error(`[pagbank-webhook:${requestId}] Parcela não encontrada:`, parcelaId, pError);
      return new Response(JSON.stringify({ error: 'Parcela não encontrada' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (parcela.status === 'paga' && parcela.webhook_processed_at) {
      console.log(`[pagbank-webhook:${requestId}] Já processado.`);
      return new Response(JSON.stringify({ success: true, message: 'Já processado' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    await supabaseAdmin.from('pagbank_transaction_logs').insert({
      proprietario_id: parcela.admin_id,
      transaction_type: 'webhook',
      pagbank_id: charge.id,
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
      return new Response(JSON.stringify({ success: true, message: 'Status atualizado' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`[pagbank-webhook:${requestId}] Status confirmado: PAID. Iniciando baixa...`);

    const dataPagamento = (chargeDetail.paid_at || charge.paid_at || new Date().toISOString()).split('T')[0];
    const valorBruto = (chargeDetail.amount?.value || charge.amount?.value || 0) / 100;
    const taxa = (chargeDetail.amount?.fees?.value || 0) / 100;
    const valorLiquido = valorBruto - taxa;

    const { data: config, error: configError } = await supabaseAdmin
      .from('configuracoes_pagbank')
      .select('*')
      .eq('proprietario_id', parcela.admin_id)
      .single();

    if (configError || !config) throw new Error("Configuração PagBank não encontrada para o admin: " + parcela.admin_id);

    await supabaseAdmin.from('admin_parcelas_receber').update({
      status: 'paga',
      valor_pago: valorBruto,
      data_pagamento: dataPagamento,
      pagbank_status: 'PAID',
      pagbank_charge_id: charge.id,
      pagbank_transaction_id: charge.id,
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
      conta_id: config.conta_id,
      id_conta_contabil: config.conta_sintetica_id,
      id_conta_resultado: config.id_conta_resultado,
      pagbank_charge_id: charge.id,
      pagbank_taxa_valor: taxa,
      pagbank_valor_liquido: valorLiquido,
    });

    if (config.conta_sintetica_id && parcela.admin_contas_receber.id_conta_patrimonial) {
      const lancamentosPayload = [];
      
      // --- PARTE 1: Lançamento do Recebimento Bruto ---
      const idRecebimentoAtivo = crypto.randomUUID();
      const idRecebimentoPatrimonial = crypto.randomUUID();
      
      // D: Ativo (Banco/PagBank) - ENTRADA
      lancamentosPayload.push({
        id: idRecebimentoAtivo,
        proprietario_id: parcela.admin_id,
        data_movimentacao: dataPagamento,
        descricao: `Recebimento PagBank (Bruto): ${parcela.admin_contas_receber.descricao}`,
        valor: valorBruto,
        tipo: 'Entrada',
        conta_contabil_id: config.conta_sintetica_id,
        origem: 'recebimento_pagbank',
        conciliado: true,
        historico_id: config.historico_padrao_id || null,
        conta_resultado_id: idRecebimentoPatrimonial,
        conta_bancaria_id: config.conta_id || null,
      });
      
      // C: Clientes a Receber (Ativo) - SAÍDA
      lancamentosPayload.push({
        id: idRecebimentoPatrimonial,
        proprietario_id: parcela.admin_id,
        data_movimentacao: dataPagamento,
        descricao: `Baixa Direito CR: ${parcela.admin_contas_receber.descricao}`,
        valor: valorBruto,
        tipo: 'Saida',
        conta_contabil_id: parcela.admin_contas_receber.id_conta_patrimonial,
        origem: 'recebimento_pagbank',
        conciliado: true,
        historico_id: config.historico_padrao_id || null,
        conta_resultado_id: idRecebimentoAtivo,
        conta_bancaria_id: null,
      });
      
      console.log(`[pagbank-webhook:${requestId}] Lançamento Recebimento: D/C de R$ ${valorBruto.toFixed(2)}`);

      // --- PARTE 2: Lançamento da Taxa (se houver) ---
      if (taxa > 0 && config.conta_despesa_taxa_id) {
        const idTaxaDespesa = crypto.randomUUID();
        const idTaxaAtivo = crypto.randomUUID();
        
        // D: Despesa com Taxa (Resultado) - ENTRADA
        lancamentosPayload.push({
          id: idTaxaDespesa,
          proprietario_id: parcela.admin_id,
          data_movimentacao: dataPagamento,
          descricao: `Taxa PagBank: ${parcela.admin_contas_receber.descricao}`,
          valor: taxa,
          tipo: 'Entrada',
          conta_contabil_id: config.conta_despesa_taxa_id,
          origem: 'taxa_pagbank',
          conciliado: true,
          historico_id: config.historico_taxa_id || config.historico_padrao_id || null,
          conta_resultado_id: idTaxaAtivo,
          conta_bancaria_id: null,
        });
        
        // C: Ativo (Banco/PagBank) - SAÍDA
        lancamentosPayload.push({
          id: idTaxaAtivo,
          proprietario_id: parcela.admin_id,
          data_movimentacao: dataPagamento,
          descricao: `Pagamento Taxa PagBank: ${parcela.admin_contas_receber.descricao}`,
          valor: taxa,
          tipo: 'Saida',
          conta_contabil_id: config.conta_sintetica_id,
          origem: 'taxa_pagbank',
          conciliado: true,
          historico_id: config.historico_taxa_id || config.historico_padrao_id || null,
          conta_resultado_id: idTaxaDespesa,
          conta_bancaria_id: config.conta_id || null,
        });
        
        console.log(`[pagbank-webhook:${requestId}] Lançamento Taxa: D/C de R$ ${taxa.toFixed(2)}`);
      }
      
      const { error: lancError } = await supabaseAdmin.from('lancamentos').insert(lancamentosPayload);
      
      if (lancError) {
        console.error(`[pagbank-webhook:${requestId}] ERRO ao inserir lançamentos:`, lancError);
        throw new Error(`Falha ao criar lançamentos contábeis: ${lancError.message}`);
      }
      
      console.log(`[pagbank-webhook:${requestId}] ${lancamentosPayload.length} lançamentos criados com partida dobrada completa.`);
    }

    console.log(`[pagbank-webhook:${requestId}] Sucesso total para parcela ${parcelaId}`);
    return new Response(JSON.stringify({ success: true }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 
    });

  } catch (error: any) {
    console.error(`[pagbank-webhook:${requestId}] Erro Fatal:`, error.message);
    // Log do erro no banco para auditoria
    await supabaseAdmin.from('pagbank_transaction_logs').insert({
      proprietario_id: parcela?.admin_id || null,
      transaction_type: 'webhook',
      pagbank_id: payload?.data?.id || payload?.id || null,
      reference_id: String(payload?.data?.reference_id || payload?.reference_id || ""),
      status: 'ERROR',
      response_payload: payload,
      error_message: error.message,
    });
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});