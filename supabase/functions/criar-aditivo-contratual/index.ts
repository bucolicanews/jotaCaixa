import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.14.0'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  // This is needed if you're planning to invoke your function from a browser.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { p_aditivo_data, p_parcelas_updates } = await req.json()

    // 1. Inserir o registro do aditivo
    const { error: aditivoError } = await supabaseClient
      .from('admin_aditivos_contratuais')
      .insert([p_aditivo_data])

    if (aditivoError) {
      throw new Error(`Erro ao inserir aditivo: ${aditivoError.message}`)
    }

    // 2. Atualizar cada parcela afetada
    const parcelaUpdatePromises = p_parcelas_updates.map((p: { id: string; novo_valor: number }) =>
      supabaseClient
        .from('admin_parcelas_receber')
        .update({ valor: p.novo_valor, updated_at: new Date().toISOString() })
        .eq('id', p.id)
    )
    const parcelaResults = await Promise.all(parcelaUpdatePromises)
    const firstParcelaError = parcelaResults.find((res) => res.error)

    if (firstParcelaError) {
      throw new Error(`Erro ao atualizar parcelas: ${firstParcelaError.error.message}`)
    }

    // 3. Atualizar o valor total na tabela contas_receber
    const { error: contaError } = await supabaseClient
      .from('admin_contas_receber')
      .update({
        valor_total: p_aditivo_data.valor_contrato_novo,
        updated_at: new Date().toISOString(),
      })
      .eq('id', p_aditivo_data.conta_receber_id)
      
    if (contaError) {
      throw new Error(`Erro ao atualizar valor total do contrato: ${contaError.message}`)
    }

    return new Response(JSON.stringify({ message: 'Aditivo criado com sucesso!' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
