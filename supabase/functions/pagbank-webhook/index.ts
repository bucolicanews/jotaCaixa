import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    const payload = await req.json();
    console.log('[pagbank-webhook] Payload recebido:', JSON.stringify(payload, null, 2));

    if (!payload.reference_id || !payload.reference_id.startsWith('PARCELA_')) {
      console.warn('[pagbank-webhook] Reference ID ignorado:', payload.reference_id);
      return new Response(JSON.stringify({ success: true, message: 'Ignorado (não é parcela)' }), { status: 200 });
    }

    const parcelaId = payload.reference_id.replace('PARCELA_', '');

    // 1. Buscar a parcela e a conta sintética
    const { data: parcela, error: pError } = await supabaseAdmin
      .from('admin_parcelas_receber')
      .select(`*, admin_contas_receber(*)`)
      .eq('id', parcelaId)
      .single();

    if (pError || !parcela) {
      console.error('[pagbank-webhook] Parcela não encontrada:', parcelaId);
      return new Response(JSON.stringify({ error: 'Parcela não encontrada' }), { status: 404 });
    }

    if (parcela.status === 'paga') {
      return new Response(JSON.stringify({ success: true, message: 'Parcela já está paga' }), { status: 200 });
    }

    // Registrar Log
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
        await supabaseAdmin.from('admin_parcelas_receber').update({ 
            pagbank_status: payload.status,
            pagbank_updated_at: new Date().toISOString() 
        }).eq('id', parcelaId);
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    // --- PROCESSAR PAGAMENTO ---
    const dataPagamento = payload.paid_at ? payload.paid_at.split('T')[0] : new Date().toISOString().split('T')[0];
    const valorBruto = payload.amount.value / 100;
    const taxa = (payload.charges?.[0]?.amount?.fees || 0) / 100;
    const valorLiquido = valorBruto - taxa;

    // Buscar config do admin para obter as contas
    const { data: config } = await supabaseAdmin
      .from('configuracoes_pagbank')
      .select('*')
      .eq('proprietario_id', parcela.admin_id)
      .single();

    if (!config) throw new Error('Configuração PagBank não encontrada para o admin.');

    // 2. Atualizar Parcela
    const { error: updError } = await supabaseAdmin.from('admin_parcelas_receber').update({
        status: 'paga',
        valor_pago: valorBruto,
        data_pagamento: dataPagamento,
        pagbank_status: 'PAID',
        pagbank_updated_at: new Date().toISOString(),
    }).eq('id', parcelaId);

    if (updError) throw updError;

    // 3. Criar Recebimento
    const { data: saldoConta } = await supabaseAdmin
        .from('saldo_contas')
        .select('id')
        .eq('proprietario_id', parcela.admin_id)
        .eq('conta_contabil_id', config.conta_sintetica_id)
        .maybeSingle();

    await supabaseAdmin.from('admin_recebimentos').insert({
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

    // 4. Lançamentos Contábeis (Se configurado)
    if (config.conta_sintetica_id && parcela.admin_contas_receber.id_conta_patrimonial) {
        const idAtivo = crypto.randomUUID();
        const idPatrimonial = crypto.randomUUID();
        
        await supabaseAdmin.from('lancamentos').insert([
            {
                id: idAtivo,
                proprietario_id: parcela.admin_id,
                data_movimentacao: dataPagamento,
                descricao: `Recebimento PagBank: ${parcela.admin_contas_receber.descricao}`,
                valor: valorLiquido,
                tipo: 'Entrada',
                conta_bancaria_id: saldoConta?.id,
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
        ]);
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('[pagbank-webhook] Erro:', error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});