import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  // 1. Trata Pre-flight (CORS)
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    const { parcelaId, manualOrderId } = await req.json()

    if (!parcelaId) {
      throw new Error("parcelaId não informado")
    }

    // 2. Busca a parcela
    const { data: parcela, error } = await supabase
      .from("admin_parcelas_receber")
      .select("*, admin_contas_receber(admin_id, cliente_id)")
      .eq("id", parcelaId)
      .single()

    if (error || !parcela) {
      throw new Error("Parcela não encontrada")
    }

    const ownerId = parcela.admin_contas_receber.admin_id
    
    // 3. Define qual ID usar:
    // - CHEC_ (checkout) NÃO é consultável diretamente; usa o pagbank_charge_id (ORDE_/ORD_) gerado pelo checkout
    // - Prioridade: manual > charge_id > checkout_id (somente se não for CHEC_)
    const checkoutId = parcela.pagbank_checkout_id
    const isChecCheckout = checkoutId?.startsWith("CHEC_")
    const transactionId = manualOrderId
      || parcela.pagbank_charge_id
      || (!isChecCheckout ? checkoutId : null)

    if (!transactionId) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Parcela sem ID de transação (Order/Charge) e nenhum código manual informado." 
        }),
        { 
          status: 200, // Retorna 200 para o frontend tratar a mensagem
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      )
    }

    // 4. Busca Configuração
    const { data: config } = await supabase
      .from("configuracoes_pagbank")
      .select("*")
      .eq("proprietario_id", ownerId)
      .single()

    if (!config) throw new Error("Configuração PagBank não encontrada")

    const token = (config.ambiente === "producao" ? config.token_producao : config.token_sandbox)?.trim()
    
    // URL DEFINITIVA: api.pagseguro.com (NUNCA api.pagbank.com.br)
    const baseUrl = config.ambiente === "producao" 
      ? "https://api.pagseguro.com" 
      : "https://sandbox.api.pagseguro.com"

    // Detecta o tipo de ID para usar o endpoint correto da API PagBank:
    // CHAR_ → boleto ou PIX (charge direta) → /charges/
    // ORD_  → order criado via API           → /orders/
    // ORDE_ → order (variação do prefixo)    → /orders/
    // CHK_  → checkout (link de pagamento)   → /orders/
    // CHEC_ → checkout (variação do prefixo) → /orders/
    // sem prefixo conhecido                  → /charges/ (fallback conservador)
    const isCharge = transactionId.startsWith("CHAR_")
    const isOrder  = !isCharge && (
      transactionId.startsWith("ORD_")  ||
      transactionId.startsWith("ORDE_") ||
      transactionId.startsWith("CHK_")  ||
      transactionId.startsWith("CHEC_")
    )
    const endpoint = isOrder ? `/orders/${transactionId}` : `/charges/${transactionId}`
    const fullUrl = `${baseUrl}${endpoint}`

    console.log(`[sync-pagbank] Requesting: ${fullUrl}`)

    // 5. Chamada à API PagBank
    const response = await fetch(fullUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "*/*",
        "x-api-version": "4.0"
      },
    })

    if (!response.ok) {
      const rawText = await response.text()
      console.error(`[sync-pagbank] ${response.status} para ${fullUrl} — body: ${rawText}`)
      let errorMsg = `PagBank ${response.status}`
      try {
        const jsonErr = JSON.parse(rawText)
        errorMsg = jsonErr.error_messages?.[0]?.description || jsonErr.message || errorMsg
      } catch {
        errorMsg += rawText ? `: ${rawText}` : " (sem corpo na resposta)"
      }
      throw new Error(errorMsg)
    }

    const pbData = await response.json()
    
    // 6. Normaliza dados de retorno
    let status = pbData.status
    let paidAt = pbData.paid_at
    let grossAmount = 0
    let fees = 0
    let chargeIdFound = isOrder ? null : transactionId

    if (pbData.charges && pbData.charges.length > 0) {
      // Se for Order, pega a charge paga ou a mais recente
      const charge = pbData.charges.find((c: any) => c.status === "PAID") || pbData.charges[0]
      status = charge.status
      paidAt = charge.paid_at
      grossAmount = charge.amount?.value || 0
      fees = charge.amount?.summary?.total_fee || 0
      chargeIdFound = charge.id
    } else {
      // Se for Charge direto
      grossAmount = pbData.amount?.value || 0
      fees = pbData.amount?.summary?.total_fee || 0
    }

    const isPaid = status === "PAID"

    // 7. Processa Baixa se Pago
    if (isPaid && parcela.status !== "paga") {
      const { data: saldoConta } = await supabase
        .from("saldo_contas")
        .select("id")
        .eq("proprietario_id", ownerId)
        .eq("conta_contabil_id", config.conta_id)
        .maybeSingle()

      if (!saldoConta) throw new Error("Conta bancária não encontrada no sistema.")

      const valorBruto = grossAmount / 100
      const valorTaxa = fees / 100
      const valorLiquido = valorBruto - valorTaxa

      // Atualiza parcela
      await supabase.from("admin_parcelas_receber").update({
        status: "paga",
        valor_pago: valorBruto,
        data_pagamento: paidAt || new Date().toISOString(),
        pagbank_status: "PAID",
        pagbank_charge_id: chargeIdFound,
        pagbank_updated_at: new Date().toISOString()
      }).eq("id", parcelaId)

      // Cria recebimento
      await supabase.from("admin_recebimentos").insert({
        parcela_id: parcelaId,
        admin_id: ownerId,
        cliente_id: parcela.admin_contas_receber.cliente_id,
        valor_recebido: valorBruto,
        data_recebimento: paidAt || new Date().toISOString(),
        forma_pagamento: "PagBank",
        conta_id: saldoConta.id,
        id_conta_contabil: config.conta_sintetica_id,
        historico_id: config.historico_padrao_id,
        pagbank_charge_id: chargeIdFound,
        pagbank_taxa_valor: valorTaxa,
        pagbank_valor_liquido: valorLiquido
      })

      return new Response(JSON.stringify({ 
        success: true, 
        isPaid: true, 
        status: "PAID" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    return new Response(JSON.stringify({ 
      success: true, 
      isPaid: false, 
      status: status 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })

  } catch (err: any) {
    console.error("[sync-pagbank] Error:", err)
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 200, // Retorna 200 com success:false para o frontend ler o erro
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })
  }
})