import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { PagBankClient } from '../_shared/pagbank-client.ts';
import { CreateTransferRequest } from '../_shared/types.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json();
    const { parcelaId, amount, holder, tax_id, bank, branch, account, account_type } = body;

    const { data: parcela } = await supabaseAdmin.from('admin_parcelas_pagar').select('*').eq('id', parcelaId).single();
    if (!parcela) throw new Error('Parcela não encontrada');

    const { data: config } = await supabaseAdmin.from('configuracoes_pagbank').select('*').eq('proprietario_id', parcela.admin_id).single();
    if (!config) throw new Error('Configuração PagBank não encontrada');

    const request: CreateTransferRequest = {
      reference_id: `PAGAMENTO_${parcelaId}`,
      amount: { value: Math.round(amount * 100) },
      recipient: {
        bank_account: {
          holder,
          tax_id: tax_id.replace(/\D/g, ''),
          bank,
          branch,
          account,
          type: account_type,
        }
      }
    };

    const client = new PagBankClient(config);
    const response = await client.createTransfer(request);

    await supabaseAdmin.from('admin_parcelas_pagar').update({
      pagbank_transfer_id: response.id,
      pagbank_status: response.status
    }).eq('id', parcelaId);

    return new Response(JSON.stringify(response), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});