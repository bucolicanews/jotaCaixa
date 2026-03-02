import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';

const STATUS_PAGO = ['PAID', 'COMPLETED', 'AVAILABLE'];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID().substring(0, 8);
  console.log(`[pagbank-webhook:${requestId}] Recebido`);

  let payload: any;
  let parcela: any;
  let supabaseAdmin: any;

  try {
    supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const rawBody = await req.text();
    payload = JSON.parse(rawBody);

    const charge = payload.data ?? payload;
    const chargeDetail =
      charge.charges?.[0] ??
      charge.payments?.[0] ??
      charge;

    const currentStatus = chargeDetail.status ?? charge.status;
    const referenceId = chargeDetail.reference_id ?? charge.reference_id ?? '';

    console.log(`[pagbank-webhook:${requestId}] Status=${currentStatus} Ref=${referenceId}`);

    if (!referenceId.startsWith('PARCELA_')) {
      return new Response(JSON.stringify({ success: true, message: 'Not a parcela reference, ignoring.' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let parcelaId = referenceId.replace('PARCELA_', '');
    if (parcelaId.includes('_')) parcelaId = parcelaId.split('_')[0];

    const { data, error } = await supabaseAdmin
      .from('admin_parcelas_receber')
      .select(`*, admin_contas_receber(*)`)
      .eq('id', parcelaId)
      .single();

    if (error || !data) {
      throw new Error(`Parcela ${parcelaId} não encontrada.`);
    }

    parcela = data;

    if (parcela.webhook_processed_at) {
      console.log(`[pagbank-webhook:${requestId}] Parcela ${parcelaId} já processada anteriormente. Ignorando.`);
      return new Response(JSON.stringify({ success: true, message: 'Already processed.' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    await supabaseAdmin.from('pagbank_transaction_logs').insert({
      proprietario_id: parcela.admin_id,
      transaction_type: 'webhook',
      pagbank_id: charge.id,
      reference_id: referenceId,
      status: currentStatus,
      amount: (chargeDetail.amount?.value || 0) / 100,
      response_payload: payload,
    });

    if (!STATUS_PAGO.includes(currentStatus)) {
      await supabaseAdmin.from('admin_parcelas_receber').update({
        pagbank_status: currentStatus,
        pagbank_updated_at: new Date().toISOString(),
      }).eq('id', parcelaId);
      return new Response(JSON.stringify({ success: true, message: 'Intermediate status updated.' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const dataPagamento = (chargeDetail.paid_at ?? new Date().toISOString()).split('T')[0];
    const valorBruto = (chargeDetail.amount?.value || 0) / 100;
    const taxa = (chargeDetail.amount?.fees?.value || 0) / 100;
    const valorLiquido = valorBruto - taxa;

    // ✅ PASSO 1: BAIXA DA PARCELA (ESSENCIAL)
    await supabaseAdmin.from('admin_parcelas_receber').update({
      status: 'paga',
      valor_pago: valorBruto,
      data_pagamento: dataPagamento,
      pagbank_status: currentStatus,
      pagbank_charge_id: charge.id,
      webhook_processed_at: new Date().toISOString(),
    }).eq('id', parcelaId);

    console.log(`[pagbank-webhook:${requestId}] BAIXA DA PARCELA CONCLUÍDA`);

    // ✅ PASSO 2: LÓGICA CONTÁBIL E DE RECEBIMENTO (SECUNDÁRIA E SEGURA)
    // Buscar configuração PagBank — necessária para ambos os sub-passos
    let config: any = null;
    try {
      const { data: configData } = await supabaseAdmin
        .from('configuracoes_pagbank')
        .select('*')
        .eq('proprietario_id', parcela.admin_id)
        .single();
      config = configData;
      if (!config) throw new Error('Configuração PagBank não encontrada para o admin.');
    } catch (configError: any) {
      console.error(`[pagbank-webhook:${requestId}] ERRO ao buscar config PagBank:`, configError.message);
      await supabaseAdmin.from('pagbank_transaction_logs').update({
        error_message: `Config não encontrada: ${configError.message}`
      }).eq('pagbank_id', charge.id);
    }

    // ✅ PASSO 2A: REGISTRO DE RECEBIMENTO (independente dos lançamentos)
    if (config) {
      try {
        await supabaseAdmin.from('admin_recebimentos').insert({
          parcela_id: parcelaId,
          admin_id: parcela.admin_id,
          cliente_id: parcela.admin_contas_receber?.cliente_id ?? null,
          valor_recebido: valorBruto,
          data_recebimento: dataPagamento,
          forma_pagamento: 'PagBank',
          pagbank_taxa_valor: taxa,
          pagbank_valor_liquido: valorLiquido,
          conta_id: config.conta_id,
          id_conta_contabil: config.conta_sintetica_id,
          historico_id: config.historico_padrao_id,
          id_conta_resultado: config.id_conta_resultado,
        });
        console.log(`[pagbank-webhook:${requestId}] PASSO 2A: Registro de recebimento criado.`);
      } catch (recebimentoError: any) {
        console.error(`[pagbank-webhook:${requestId}] PASSO 2A ERRO (não crítico — lançamentos ainda serão tentados):`, recebimentoError.message);
        await supabaseAdmin.from('pagbank_transaction_logs').update({
          error_message: `Recebimento falhou: ${recebimentoError.message}`
        }).eq('pagbank_id', charge.id);
      }
    }

    // ✅ PASSO 2B: LANÇAMENTOS CONTÁBEIS (independente do recebimento)
    if (config) {
      try {
        const contaSinteticaId = config.conta_sintetica_id ?? null;
        const contaPatrimonialId = parcela.admin_contas_receber?.id_conta_patrimonial ?? null;

        console.log(`[pagbank-webhook:${requestId}] PASSO 2B: conta_sintetica=${contaSinteticaId}, id_conta_patrimonial=${contaPatrimonialId}`);

        if (!contaSinteticaId) {
          console.warn(`[pagbank-webhook:${requestId}] PASSO 2B AVISO: conta_sintetica_id não configurado em configuracoes_pagbank. Lançamentos não criados.`);
        } else if (!contaPatrimonialId) {
          console.warn(`[pagbank-webhook:${requestId}] PASSO 2B AVISO: id_conta_patrimonial nulo na conta CR. Lançamentos não criados.`);
        } else {
          // Busca o ID de saldo_contas vinculado à conta contábil PagBank
          const { data: saldoConta } = await supabaseAdmin
            .from('saldo_contas')
            .select('id')
            .eq('proprietario_id', parcela.admin_id)
            .eq('conta_contabil_id', contaSinteticaId)
            .maybeSingle();

          const contaBancariaId = saldoConta?.id ?? null;

          const lancamentosPayload: any[] = [];
          const descricaoBase = `Recebimento PagBank: ${parcela.admin_contas_receber?.descricao} (P: ${parcela.numero_parcela})`;

          const idAtivo = crypto.randomUUID();
          const idPatrimonial = crypto.randomUUID();

          // D: Banco (Líquido)
          lancamentosPayload.push({
            id: idAtivo,
            proprietario_id: parcela.admin_id,
            documento: parcelaId,
            data_movimentacao: dataPagamento,
            descricao: `Recebimento Líquido: ${descricaoBase}`,
            valor: valorLiquido,
            tipo: 'Entrada',
            conta_bancaria_id: contaBancariaId,
            conta_contabil_id: contaSinteticaId,
            origem: 'recebimento_pagbank',
            historico_id: config.historico_padrao_id,
            conta_resultado_id: idPatrimonial,
            conciliado: true,
          });

          // C: Contas a Receber (Bruto)
          lancamentosPayload.push({
            id: idPatrimonial,
            proprietario_id: parcela.admin_id,
            documento: parcelaId,
            data_movimentacao: dataPagamento,
            descricao: `Baixa CR (Bruto): ${descricaoBase}`,
            valor: valorBruto,
            tipo: 'Saida',
            conta_bancaria_id: null,
            conta_contabil_id: contaPatrimonialId,
            origem: 'recebimento_pagbank',
            historico_id: config.historico_padrao_id,
            conta_resultado_id: idAtivo,
            conciliado: true,
          });

          // D: Despesa com Taxa
          if (taxa > 0 && config.conta_despesa_taxa_id) {
            const idDespesa = crypto.randomUUID();
            lancamentosPayload.push({
              id: idDespesa,
              proprietario_id: parcela.admin_id,
              documento: parcelaId,
              data_movimentacao: dataPagamento,
              descricao: `Taxa PagBank: ${descricaoBase}`,
              valor: taxa,
              tipo: 'Entrada',
              conta_bancaria_id: null,
              conta_contabil_id: config.conta_despesa_taxa_id,
              origem: 'taxa_pagbank',
              historico_id: config.historico_taxa_id,
              conta_resultado_id: idAtivo,
              conciliado: true,
            });
          }

          const { error: lancamentoError } = await supabaseAdmin.from('lancamentos').insert(lancamentosPayload);
          if (lancamentoError) throw new Error(`Falha ao inserir lançamentos: ${lancamentoError.message}`);

          console.log(`[pagbank-webhook:${requestId}] PASSO 2B: ${lancamentosPayload.length} lançamentos contábeis criados com sucesso.`);
        }
      } catch (lancamentoError: any) {
        console.error(`[pagbank-webhook:${requestId}] PASSO 2B ERRO (lançamentos):`, lancamentoError.message);
        await supabaseAdmin.from('pagbank_transaction_logs').update({
          error_message: `Lançamentos falharam: ${lancamentoError.message}`
        }).eq('pagbank_id', charge.id);
      }
    }

    // ✅ PASSO 3: ATUALIZAÇÃO DA CONTA SINTÉTICA (SECUNDÁRIA)
    try {
      const { count: pendingCount, error: countError } = await supabaseAdmin
        .from('admin_parcelas_receber')
        .select('id', { count: 'exact', head: true })
        .eq('conta_receber_id', parcela.conta_receber_id)
        .in('status', ['aberta', 'parcial', 'reprogramada']);

      if (countError) throw countError;
      
      if (pendingCount === 0) {
        await supabaseAdmin
          .from('admin_contas_receber')
          .update({ status: 'paga' })
          .eq('id', parcela.conta_receber_id);
      }
    } catch (countError: any) {
      console.error("[pagbank-webhook] Non-critical error checking pending installments:", countError.message);
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error(`[pagbank-webhook:${requestId}] ERRO CRÍTICO`, err.message);

    if (supabaseAdmin) {
      await supabaseAdmin.from('pagbank_transaction_logs').insert({
        proprietario_id: parcela?.admin_id ?? null,
        transaction_type: 'webhook',
        status: 'CRITICAL_ERROR',
        response_payload: payload,
        error_message: err.message,
      });
    }

    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});