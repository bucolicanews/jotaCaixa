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
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json();
    const { parcela_id, codigo_transacao, force, valor_bruto_manual, valor_liquido_manual, taxa_manual } = body;
    
    if (!parcela_id) throw new Error('ID da parcela não informado.');
    if (!codigo_transacao) throw new Error('Código da transação não informado.');

    console.log(`[forcar-baixa-pagbank] Parcela: ${parcela_id}, Transação: ${codigo_transacao}, Force: ${force || false}`);

    // 1. Buscar a parcela
    const { data: parcela, error: pError } = await supabaseAdmin
      .from('admin_parcelas_receber')
      .select('*')
      .eq('id', parcela_id)
      .single();

    if (pError || !parcela) throw new Error('Parcela não encontrada no banco.');

    // 2. Validar se parcela já foi paga
    if (parcela.status === 'paga') {
      throw new Error('Esta parcela já foi paga anteriormente.');
    }

    console.log(`[forcar-baixa-pagbank] Parcela encontrada. Status: ${parcela.status}, Valor: ${parcela.valor_parcela}`);

    // 3. Verificar se valores foram fornecidos manualmente
    let valor_bruto, valor_liquido, taxa, status;
    
    if (valor_bruto_manual !== undefined && valor_liquido_manual !== undefined) {
      // Usar valores manuais
      valor_bruto = valor_bruto_manual;
      valor_liquido = valor_liquido_manual;
      taxa = taxa_manual || (valor_bruto - valor_liquido);
      status = 'PAID';
      console.log(`[forcar-baixa-pagbank] Usando valores manuais: Bruto=${valor_bruto}, Líquido=${valor_liquido}, Taxa=${taxa}`);
    } else {
      // 3. Buscar transação no PagBank
      const buscaResult = await supabaseAdmin.functions.invoke('buscar-transacao-pagbank', {
        body: { 
          codigo_transacao: codigo_transacao.trim(),
          admin_id: parcela.admin_id
        }
      });

      if (buscaResult.error) {
        throw new Error(`Erro ao buscar transação: ${buscaResult.error.message}`);
      }

      // 4. Verificar se transação não foi encontrada
      if (buscaResult.data?.not_found) {
        console.log(`[forcar-baixa-pagbank] Transação não encontrada no PagBank`);
        return new Response(
          JSON.stringify({
            success: false,
            not_found: true,
            message: buscaResult.data.message
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      // 5. Extrair dados da transação
      ({ valor_bruto, valor_liquido, taxa, status } = buscaResult.data);

      console.log(`[forcar-baixa-pagbank] Status da transação: ${status}`);
      console.log(`[forcar-baixa-pagbank] Force mode: ${force || false}`);
      console.log(`[forcar-baixa-pagbank] Valor bruto: ${valor_bruto}, líquido: ${valor_liquido}, taxa: ${taxa}`);

      // 6. Se status não é PAID e não foi forçado, retornar para confirmação
      if (status !== 'PAID' && !force) {
        console.log(`[forcar-baixa-pagbank] Aguardando confirmação do usuário para status ${status}`);
        return new Response(
          JSON.stringify({
            success: false,
            not_paid: true,
            status,
            valor_bruto,
            valor_liquido,
            taxa,
            message: `Transação encontrada mas status é "${status}" (não PAID). Confirme para forçar baixa.`
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }
    }

    // 7. Continuar processamento (status === 'PAID' OU force === true OU valores manuais)
    if (force) {
      console.log(`[forcar-baixa-pagbank] FORÇANDO baixa mesmo com status ${status}`);
    } else {
      console.log(`[forcar-baixa-pagbank] Processando baixa com status PAID`);
    }

    // 8. Buscar configuração PagBank para obter conta_id e conta_despesa_taxa
    const { data: config, error: configError } = await supabaseAdmin
      .from('configuracoes_pagbank')
      .select('*')
      .eq('proprietario_id', parcela.admin_id)
      .single();

    if (configError || !config) throw new Error('Configuração PagBank não encontrada.');
    if (!config.conta_id) throw new Error('Conta PagBank não configurada.');

    console.log(`[forcar-baixa-pagbank] Conta PagBank: ${config.conta_id}, Conta Despesa Taxa: ${config.conta_despesa_taxa || 'não configurada'}`);

    // 9. Buscar saldo atual da conta PagBank
    const { data: saldoConta, error: saldoError } = await supabaseAdmin
      .from('saldo_contas')
      .select('saldo_inicial')
      .eq('conta_id', config.conta_id)
      .eq('proprietario_id', parcela.admin_id)
      .single();

    if (saldoError) throw new Error('Saldo da conta PagBank não encontrado.');

    const saldoAtual = saldoConta.saldo_inicial || 0;
    console.log(`[forcar-baixa-pagbank] Saldo atual da conta: ${saldoAtual}`);

    // 10. Criar recebimento com valor líquido
    const dataRecebimento = new Date().toISOString().split('T')[0];
    
    const { data: recebimento, error: recError } = await supabaseAdmin
      .from('admin_recebimentos')
      .insert({
        parcela_id: parcela.id,
        conta_receber_id: parcela.conta_receber_id,
        conta_id: config.conta_id,
        valor_recebido: valor_liquido,
        data_recebimento: dataRecebimento,
        admin_id: parcela.admin_id,
        observacoes: `Recebimento via PagBank - Transação: ${codigo_transacao.trim()}${force ? ' (Forçado manualmente)' : ''}`
      })
      .select()
      .single();

    if (recError) {
      console.error('[forcar-baixa-pagbank] Erro ao criar recebimento:', recError);
      throw new Error(`Erro ao criar recebimento: ${recError.message}`);
    }

    console.log(`[forcar-baixa-pagbank] Recebimento criado: ${recebimento.id}`);

    // 11. Lançar taxa contábil (se houver taxa e conta de despesa configurada)
    if (taxa > 0 && config.conta_despesa_taxa) {
      console.log(`[forcar-baixa-pagbank] Lançando taxa de ${taxa} na contabilidade`);

      const dataLancamento = new Date().toISOString();

      // 11.1. Débito na conta de despesa
      const { error: debitoError } = await supabaseAdmin
        .from('lancamentos')
        .insert({
          proprietario_id: parcela.admin_id,
          conta_id: config.conta_despesa_taxa,
          historico_id: null,
          data_movimentacao: dataLancamento,
          tipo: 'debito',
          valor: taxa,
          descricao: `Taxa PagBank - Transação: ${codigo_transacao.trim()}${force ? ' (Forçado)' : ''}`,
          origem_tipo: 'recebimento',
          origem_id: recebimento.id
        });

      if (debitoError) {
        console.error('[forcar-baixa-pagbank] Erro ao lançar débito:', debitoError);
        throw new Error(`Erro ao lançar débito da taxa: ${debitoError.message}`);
      }

      // 11.2. Crédito na conta PagBank (contrapartida)
      const { error: creditoError } = await supabaseAdmin
        .from('lancamentos')
        .insert({
          proprietario_id: parcela.admin_id,
          conta_id: config.conta_id,
          historico_id: null,
          data_movimentacao: dataLancamento,
          tipo: 'credito',
          valor: taxa,
          descricao: `Taxa PagBank (contrapartida) - Transação: ${codigo_transacao.trim()}${force ? ' (Forçado)' : ''}`,
          origem_tipo: 'recebimento',
          origem_id: recebimento.id
        });

      if (creditoError) {
        console.error('[forcar-baixa-pagbank] Erro ao lançar crédito:', creditoError);
        throw new Error(`Erro ao lançar crédito da taxa: ${creditoError.message}`);
      }

      console.log(`[forcar-baixa-pagbank] Taxa lançada com sucesso`);
    } else if (taxa > 0) {
      console.log(`[forcar-baixa-pagbank] Taxa detectada (${taxa}) mas conta de despesa não configurada. Pulando lançamento.`);
    }

    // 12. Atualizar parcela
    const { error: updateParcelaError } = await supabaseAdmin
      .from('admin_parcelas_receber')
      .update({
        status: 'paga',
        valor_pago: valor_liquido,
        pagbank_transaction_id: codigo_transacao.trim(),
        pagbank_status: status,
        pagbank_updated_at: new Date().toISOString(),
        data_recebimento: dataRecebimento
      })
      .eq('id', parcela.id);

    if (updateParcelaError) {
      console.error('[forcar-baixa-pagbank] Erro ao atualizar parcela:', updateParcelaError);
      throw new Error(`Erro ao atualizar parcela: ${updateParcelaError.message}`);
    }

    console.log(`[forcar-baixa-pagbank] Parcela atualizada para status 'paga'`);

    // 13. Atualizar saldo da conta
    const novoSaldo = saldoAtual + valor_liquido;
    
    const { error: updateSaldoError } = await supabaseAdmin
      .from('saldo_contas')
      .update({ saldo_inicial: novoSaldo })
      .eq('conta_id', config.conta_id)
      .eq('proprietario_id', parcela.admin_id);

    if (updateSaldoError) {
      console.error('[forcar-baixa-pagbank] Erro ao atualizar saldo:', updateSaldoError);
      throw new Error(`Erro ao atualizar saldo: ${updateSaldoError.message}`);
    }

    console.log(`[forcar-baixa-pagbank] Saldo atualizado de ${saldoAtual} para ${novoSaldo}`);

    // 14. Retornar sucesso
    return new Response(
      JSON.stringify({
        success: true,
        message: force 
          ? `Baixa forçada realizada com sucesso! Valor líquido: R$ ${valor_liquido.toFixed(2)}, Taxa: R$ ${taxa.toFixed(2)}`
          : `Baixa realizada com sucesso! Valor líquido: R$ ${valor_liquido.toFixed(2)}, Taxa: R$ ${taxa.toFixed(2)}`,
        recebimento_id: recebimento.id,
        valor_liquido,
        taxa,
        novo_saldo: novoSaldo
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    console.error('[forcar-baixa-pagbank] Erro:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }), 
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
