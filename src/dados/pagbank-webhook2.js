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
    try {
      const { data: config } = await supabaseAdmin
        .from('configuracoes_pagbank')
        .select('*')
        .eq('proprietario_id', parcela.admin_id)
        .single();

      if (!config) throw new Error('Configuração PagBank não encontrada para o admin.');

      // ✅ RECEBIMENTO
      await supabaseAdmin.from('admin_recebimentos').insert({
        parcela_id: parcelaId,
        admin_id: parcela.admin_id,
        cliente_id: parcela.admin_contas_receber.cliente_id,
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
      console.log(`[pagbank-webhook:${requestId}] REGISTRO DE RECEBIMENTO CRIADO`);

      // ✅ LANÇAMENTOS CONTÁBEIS
      if (config.conta_sintetica_id && parcela.admin_contas_receber.id_conta_patrimonial) {

        // Busca o ID de saldo_contas vinculado à conta contábil PagBank
        const { data: saldoConta } = await supabaseAdmin
          .from('saldo_contas')
          .select('id')
          .eq('proprietario_id', parcela.admin_id)
          .eq('conta_contabil_id', config.conta_sintetica_id)
          .maybeSingle();

        const contaBancariaId = saldoConta?.id ?? null;

        const lancamentosPayload = [];
        const descricaoBase = `Recebimento PagBank: ${parcela.admin_contas_receber.descricao} (P: ${parcela.numero_parcela})`;
        
        const idAtivo = crypto.randomUUID();
        const idPatrimonial = crypto.randomUUID();
        
        // D: Banco (Líquido)
        lancamentosPayload.push({
            id: idAtivo,
            proprietario_id: parcela.admin_id,
            data_movimentacao: dataPagamento,
            descricao: `Recebimento Líquido: ${descricaoBase}`,
            valor: valorLiquido,
            tipo: 'Entrada',
            conta_bancaria_id: contaBancariaId,
            conta_contabil_id: config.conta_sintetica_id,
            origem: 'recebimento_pagbank',
            historico_id: config.historico_padrao_id,
            conta_resultado_id: idPatrimonial,
            conciliado: true,
        });

        // C: Contas a Receber (Bruto)
        lancamentosPayload.push({
            id: idPatrimonial,
            proprietario_id: parcela.admin_id,
            data_movimentacao: dataPagamento,
            descricao: `Baixa CR (Bruto): ${descricaoBase}`,
            valor: valorBruto,
            tipo: 'Saida',
            conta_bancaria_id: null,
            conta_contabil_id: parcela.admin_contas_receber.id_conta_patrimonial,
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
                data_movimentacao: dataPagamento,
                descricao: `Taxa PagBank: ${descricaoBase}`,
                valor: taxa,
                tipo: 'Entrada', // Débito em conta de despesa
                conta_bancaria_id: null,
                conta_contabil_id: config.conta_despesa_taxa_id,
                origem: 'taxa_pagbank',
                historico_id: config.historico_taxa_id,
                conta_resultado_id: idAtivo, // Contrapartida é o Ativo (Banco)
                conciliado: true,
            });
        }

        const { error: lancamentoError } = await supabaseAdmin.from('lancamentos').insert(lancamentosPayload);
        if (lancamentoError) throw new Error(`Falha ao criar lançamentos: ${lancamentoError.message}`);
        
        console.log(`[pagbank-webhook:${requestId}] Lançamentos contábeis criados com sucesso.`);
      } else {
        console.warn(`[pagbank-webhook:${requestId}] Mapeamento contábil incompleto: conta_sintetica_id=${config.conta_sintetica_id}, id_conta_patrimonial=${parcela.admin_contas_receber.id_conta_patrimonial}. Lançamentos não criados.`);
      }

    } catch (accountingError: any) {
      console.error(`[pagbank-webhook:${requestId}] ERRO SECUNDÁRIO (Contabilidade):`, accountingError.message);
      await supabaseAdmin.from('pagbank_transaction_logs').update({
        error_message: `Contabilidade falhou: ${accountingError.message}`
      }).eq('pagbank_id', charge.id);
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