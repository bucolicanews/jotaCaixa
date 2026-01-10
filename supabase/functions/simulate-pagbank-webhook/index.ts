import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { reference_id } = await req.json();

    if (!reference_id || !reference_id.startsWith('PARCELA_')) {
      throw new Error('reference_id inválido. Use formato: PARCELA_uuid');
    }

    const webhookPayload = {
      id: `CHAR_${crypto.randomUUID().toUpperCase()}`,
      reference_id,
      status: 'PAID',
      amount: {
        value: 100,
        fees: 5,
      },
      paid_at: new Date().toISOString(),
      charges: [
        {
          id: `CHAR_${crypto.randomUUID().toUpperCase()}`,
          amount: {
            value: 100,
            fees: 5,
          },
        },
      ],
    };

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    const webhookUrl = `${supabaseUrl}/functions/v1/pagbank-webhook`;

    console.log('🔔 Simulando webhook para:', webhookUrl);
    console.log('📦 Payload:', JSON.stringify(webhookPayload, null, 2));

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
      },
      body: JSON.stringify(webhookPayload),
    });

    const result = await response.json();

    console.log('✅ Resposta do webhook:', result);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Webhook simulado com sucesso',
        webhook_response: result,
        payload_sent: webhookPayload,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('❌ Erro ao simular webhook:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
