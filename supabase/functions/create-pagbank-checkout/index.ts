import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface Parcela {
  id: string;
  valor_parcela: number;
  data_vencimento: string;
  admin_contas_receber: {
    descricao: string;
    cliente_id: string;
  };
}

interface Cliente {
  nome: string;
  email: string;
  documento: string;
  telefone: string;
}

interface PagBankConfig {
  ambiente: 'sandbox' | 'producao';
  token_producao: string | null;
  token_sandbox: string | null;
  dias_expiracao_link: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { parcela_id, admin_id } = await req.json();
    if (!parcela_id || !admin_id) {
      throw new Error('ID da parcela e do admin são obrigatórios.');
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Buscar dados da parcela e do cliente
    const { data: parcela, error: parcelaError } = await supabaseAdmin
      .from('admin_parcelas_receber')
      .select(`
        id, valor_parcela, data_vencimento,
        admin_contas_receber ( descricao, cliente_id )
      `)
      .eq('id', parcela_id)
      .single();

    if (parcelaError || !parcela) throw new Error('Parcela não encontrada.');

    const clienteId = parcela.admin_contas_receber?.cliente_id;
    if (!clienteId) throw new Error('Cliente não associado à conta a receber.');

    const { data: cliente, error: clienteError } = await supabaseAdmin
      .from('tbl_clientes')
      .select('nome, email, documento, telefone')
      .eq('id', clienteId)
      .single();

    if (clienteError || !cliente) throw new Error('Dados do cliente não encontrados.');

    // 2. Buscar configuração do PagBank
    const { data: config, error: configError } = await supabaseAdmin
      .from('configuracoes_pagbank')
      .select('*')
      .eq('proprietario_id', admin_id)
      .single();

    if (configError || !config) throw new Error('Configuração do PagBank não encontrada.');

    const isProd = config.ambiente === 'producao';
    const apiToken = isProd ? config.token_producao : config.token_sandbox;
    const apiUrl = isProd ? 'https://api.pagseguro.com' : 'https://api.sandbox.pagseguro.com';

    if (!apiToken) throw new Error(`Token do PagBank para ambiente de ${config.ambiente} não configurado.`);

    // 3. Montar payload para a API do PagBank
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + (config.dias_expiracao_link || 7));

    const payload = {
      reference_id: `PARCELA_${parcela.id}`,
      customer: {
        name: cliente.nome,
        email: cliente.email,
        tax_id: cliente.documento.replace(/\D/g, ''),
        phones: cliente.telefone ? [{
          country: "55",
          area: cliente.telefone.replace(/\D/g, '').substring(0, 2),
          number: cliente.telefone.replace(/\D/g, '').substring(2),
          type: "MOBILE"
        }] : undefined,
      },
      items: [{
        reference_id: `ITEM_${parcela.id}`,
        name: `Parcela - ${parcela.admin_contas_receber.descricao}`,
        quantity: 1,
        unit_amount: Math.round(parcela.valor_parcela * 100),
      }],
      notification_urls: [config.webhook_url],
    };

    // 4. Chamar a API do PagBank para criar o pedido (Order)
    const response = await fetch(`${apiUrl}/orders`, {
      method: 'POST',
      headers: {
        'Authorization': apiToken,
        'Content-Type': 'application/json',
        'x-api-version': '4.0',
      },
      body: JSON.stringify(payload),
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error("[create-pagbank-checkout] Erro da API PagBank:", responseData);
      throw new Error(responseData.error_messages?.[0]?.description || 'Erro ao criar pedido no PagBank');
    }

    const checkoutLink = responseData.links?.find((l: any) => l.rel === 'PAY')?.href;
    const orderId = responseData.id; // ID do Pedido (ORDE_...)

    if (!checkoutLink || !orderId) {
      throw new Error('Link de checkout ou ID do pedido não retornado pelo PagBank.');
    }

    // 5. Atualizar a parcela com o ID do Pedido e o link de checkout
    const { error: updateError } = await supabaseAdmin
      .from('admin_parcelas_receber')
      .update({
        pagbank_checkout_id: orderId, // Salva o ID do Pedido
        pagbank_checkout_link: checkoutLink,
        pagbank_status: 'WAITING',
        pagbank_updated_at: new Date().toISOString(),
        pagbank_link_expira_em: expirationDate.toISOString(),
      })
      .eq('id', parcela_id);

    if (updateError) throw updateError;

    return new Response(JSON.stringify({ success: true, checkout_link: checkoutLink, cliente }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error('[create-pagbank-checkout] Erro geral:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});