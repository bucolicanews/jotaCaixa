import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// Definição dos tipos para clareza e segurança
interface AditivoPayload {
  conta_receber_id: string;
  tipo_aditivo: 'acrescimo' | 'reducao';
  valor_ajuste: number;
  modo_distribuicao: 'proporcional' | 'fixo';
  motivo: string;
  observacao?: string;
}

interface Parcela {
  id: string;
  valor_parcela: number;
  valor_original?: number;
}

Deno.serve(async (req) => {
  // Trata a requisição OPTIONS (pre-flight) para CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    // Obtém o ID do administrador autenticado
    const { data: { user } } = await supabaseClient.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Usuário não autenticado' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }
    const adminId = user.id;

    const payload: AditivoPayload = await req.json();
    const {
      conta_receber_id,
      tipo_aditivo,
      valor_ajuste,
      modo_distribuicao,
      motivo,
      observacao,
    } = payload;

    // Validações básicas do payload
    if (!conta_receber_id || !tipo_aditivo || !valor_ajuste || !modo_distribuicao || !motivo) {
      throw new Error('Payload incompleto. Todos os campos obrigatórios devem ser fornecidos.');
    }
    if (valor_ajuste <= 0) {
      throw new Error('O valor do ajuste deve ser maior que zero.');
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Buscar parcelas em aberto
    const { data: parcelasAbertas, error: parcelasError } = await supabaseAdmin
      .from('admin_parcelas_receber')
      .select('id, valor_parcela, valor_original')
      .eq('conta_receber_id', conta_receber_id)
      .eq('status', 'pendente')
      .order('data_vencimento', { ascending: true });

    if (parcelasError) throw parcelasError;
    if (!parcelasAbertas || parcelasAbertas.length === 0) {
      throw new Error('Nenhuma parcela em aberto encontrada para este contrato.');
    }

    const quantidade_parcelas_afetadas = parcelasAbertas.length;
    const valorTotalOriginalAberto = parcelasAbertas.reduce((sum, p) => sum + p.valor_parcela, 0);
    
    // 2. Buscar valor atual do contrato
    const { data: contaReceber, error: contaError } = await supabaseAdmin
      .from('admin_contas_receber')
      .select('valor_total')
      .eq('id', conta_receber_id)
      .single();

    if (contaError) throw contaError;
    const valor_contrato_anterior = contaReceber.valor_total;

    const fatorAjuste = tipo_aditivo === 'reducao' ? -1 : 1;
    const valor_contrato_novo = valor_contrato_anterior + (valor_ajuste * fatorAjuste);

    // 3. Inserir o registro do aditivo
    const { data: aditivo, error: aditivoError } = await supabaseAdmin
      .from('admin_aditivos_contratuais')
      .insert({
        conta_receber_id,
        admin_id: adminId,
        tipo_aditivo,
        valor_ajuste,
        modo_distribuicao,
        motivo,
        observacao,
        valor_contrato_anterior,
        valor_contrato_novo,
        quantidade_parcelas_afetadas,
        status: 'ativo',
      })
      .select()
      .single();

    if (aditivoError) throw aditivoError;

    // 4. Calcular e atualizar cada parcela
    const updates = parcelasAbertas.map((parcela: Parcela) => {
      let ajusteParcela = 0;
      if (modo_distribuicao === 'proporcional') {
        const peso = parcela.valor_parcela / valorTotalOriginalAberto;
        ajusteParcela = valor_ajuste * peso;
      } else { // modo 'fixo'
        ajusteParcela = valor_ajuste / quantidade_parcelas_afetadas;
      }

      const novoValor = parcela.valor_parcela + (ajusteParcela * fatorAjuste);

      if (novoValor < 0) {
        throw new Error(`A redução resulta em um valor negativo para a parcela ID ${parcela.id}.`);
      }

      return supabaseAdmin
        .from('admin_parcelas_receber')
        .update({
          valor_parcela: novoValor,
          valor_original: parcela.valor_original ?? parcela.valor_parcela, // Salva o valor original na primeira alteração
          ultimo_aditivo_id: aditivo.id,
        })
        .eq('id', parcela.id);
    });

    await Promise.all(updates);

    // 5. Atualizar o valor total na conta a receber
    await supabaseAdmin
      .from('admin_contas_receber')
      .update({ valor_total: valor_contrato_novo })
      .eq('id', conta_receber_id);

    return new Response(JSON.stringify({ success: true, aditivo_id: aditivo.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});