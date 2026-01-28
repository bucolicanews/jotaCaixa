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
  console.log(`[confirm-nf-delivery:${requestId}] Recebido em ${new Date().toISOString()}`);

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { nota_fiscal_id, status_envio, mensagem } = await req.json();

    if (!nota_fiscal_id || !status_envio) {
      return new Response(
        JSON.stringify({ error: 'Parâmetros ausentes: nota_fiscal_id e status_envio são obrigatórios.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[confirm-nf-delivery:${requestId}] NF ID: ${nota_fiscal_id}, Status N8N: ${status_envio}`);

    let newStatus: 'Nota Emitida' | 'Enviada Cliente' | 'Enviada com Sucesso' | 'Erro Envio';
    
    if (status_envio === 'SUCCESS' || status_envio === true) {
      newStatus = 'Enviada com Sucesso';
    } else if (status_envio === 'ERROR' || status_envio === false) {
      newStatus = 'Erro Envio';
    } else {
      newStatus = 'Enviada Cliente'; // Mantém o status intermediário
    }

    const { error: updateError } = await supabaseAdmin
      .from('notas_fiscais')
      .update({ 
        status: newStatus,
        updated_at: new Date().toISOString(),
        // Opcional: registrar mensagem de erro/sucesso
        // mensagem_envio: mensagem || newStatus 
      })
      .eq('id', nota_fiscal_id);

    if (updateError) {
      console.error(`[confirm-nf-delivery:${requestId}] Erro ao atualizar NF:`, updateError);
      throw new Error(`Falha ao atualizar NF: ${updateError.message}`);
    }

    console.log(`[confirm-nf-delivery:${requestId}] ✅ Status atualizado para: ${newStatus}`);

    return new Response(
      JSON.stringify({ success: true, new_status: newStatus }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error(`[confirm-nf-delivery] Erro Fatal:`, error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});