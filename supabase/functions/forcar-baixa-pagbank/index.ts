import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { parcela_id, codigo_transacao, force, valor_bruto_manual, valor_liquido_manual, taxa_manual } = await req.json()

    if (!parcela_id) throw new Error('ID da parcela é obrigatório.')

    // 1. Buscar a parcela e configuração
    const { data: parcela, error: pError } = await supabaseAdmin
      .from('admin_parcelas_receber')
      .select('*, admin_contas_receber(*)')
      .eq('id', parcela_id)
      .single()

    if (pError || !parcela) throw new Error('Parcela não encontrada.')
    const ownerId = parcela.admin_contas_receber.admin_id

    const { data: config, error: cError } = await supabaseAdmin
      .from('configuracoes_pagbank')
      .select('*')
      .eq('proprietario_id', ownerId)
      .single()

    if (cError || !config) throw new Error('Configuração PagBank não encontrada.')

    // BUSCA CORRIGIDA: Localizar a conta de saldo pelo conta_contabil_id
    const { data: saldoConta, error: sError } = await supabaseAdmin
      .from('saldo_contas')
      .select('id, nome')
      .eq('proprietario_id', ownerId)
      .eq('conta_contabil_id', config.conta_id) // USE conta_contabil_id
      .maybeSingle()

    if (sError || !saldoConta) {
      throw new Error(`A conta bancária configurada (ID Plano: ${config.conta_id}) não possui um registro correspondente em Bancos/Caixas.`)
    }

    const valorBruto = valor_bruto_manual || parcela.valor_parcela
    const taxa = taxa_manual || (valorBruto * 0.0099)
    const valorLiquido = valor_liquido_manual || (valorBruto - taxa)
    const dataPagamento = new Date().toISOString()

    // Processar a baixa manual no banco de dados
    const { error: updateError } = await supabaseAdmin
      .from('admin_parcelas_receber')
      .update({
        status: 'paga',
        valor_pago: valorBruto,
        data_pagamento: dataPagamento,
        pagbank_status: 'PAID',
        pagbank_transaction_id: codigo_transacao
      })
      .eq('id', parcela_id)

    if (updateError) throw updateError

    // Registrar o recebimento com os dados manuais/forçados
    await supabaseAdmin.from('admin_recebimentos').insert({
      parcela_id: parcela_id,
      admin_id: ownerId,
      cliente_id: parcela.admin_contas_receber.cliente_id,
      valor_recebido: valorBruto,
      data_recebimento: dataPagamento,
      forma_pagamento: 'PagBank (Forçado)',
      conta_id: saldoConta.id,
      id_conta_contabil: config.conta_sintetica_id,
      historico_id: config.historico_padrao_id,
      codigo_transacao: codigo_transacao,
      pagbank_taxa_valor: taxa,
      pagbank_valor_liquido: valorLiquido,
      observacao: force ? 'Baixa forçada manualmente pelo administrador.' : 'Baixa processada via busca por ID.'
    })

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Baixa processada com sucesso!' 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error: any) {
    console.error('[force-sync] error:', error)
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })
  }
})