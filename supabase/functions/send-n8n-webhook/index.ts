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

  try {
    const { webhookUrl, payload } = await req.json();

    if (!webhookUrl) {
      throw new Error('A URL do webhook N8N não foi fornecida.');
    }
    if (!payload) {
      throw new Error('O payload de dados não foi fornecido.');
    }

    console.log(`[send-n8n-webhook] Encaminhando para: ${webhookUrl}`);
    console.log(`[send-n8n-webhook] Payload:`, JSON.stringify(payload, null, 2));

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[send-n8n-webhook] Erro do N8N (${response.status}):`, errorText);
      throw new Error(`Webhook N8N respondeu com erro ${response.status}: ${errorText}`);
    }

    const responseData = await response.json();
    console.log(`[send-n8n-webhook] Resposta do N8N:`, responseData);

    return new Response(
      JSON.stringify({ success: true, message: 'Webhook enviado com sucesso para o N8N.', n8n_response: responseData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[send-n8n-webhook] Erro fatal:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});