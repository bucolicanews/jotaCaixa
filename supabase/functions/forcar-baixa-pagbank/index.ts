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

    // 1. Buscar a parcela com join para pegar a conta patrimonial
    const { data: parcela, error: pError } = await supabaseAdmin
      .from('admin_parcelas_receber')
      .select('*, admin_contas_receber(id_conta_patrimonial)')
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

    // 11. Criar lançamentos contábeis em partida dobrada
    const dataLancamento = new Date().toISOString();
    const lancamentosPayload = [];
    
    // 11.1. DÉBITO: Conta PagBank (Ativo aumenta)
    const idDebitoPagBank = crypto.randomUUID();
    lancamentosPayload.push({
      id: idDebitoPagBank,
      proprietario_id: parcela.admin_id,
      data_movimentacao: dataLancamento,
      descricao: `Recebimento PagBank - Transação: ${codigo_transacao.trim()}${force ? ' (Forçado)' : ''}`,
      valor: valor_liquido,
      tipo: 'Entrada',
      conta_contabil_id: config.conta_sintetica_id,
      origem: 'baixa_manual_pagbank',
      conta_resultado_id: null, // Será preenchido após criar os outros
    });

    // 11.2. DÉBITO: Taxa PagBank (Despesa aumenta) - se houver taxa
    let idDebitoTaxa = null;
    if (taxa > 0 && config.conta_despesa_taxa) {
      idDebitoTaxa = crypto.randomUUID();
      lancamentosPayload.push({
        id: idDebitoTaxa,
        proprietario_id: parcela.admin_id,
        data_movimentacao: dataLancamento,
        descricao: `Taxa PagBank - Transação: ${codigo_transacao.trim()}${force ? ' (Forçado)' : ''}`,
        valor: taxa,
        tipo: 'Entrada',
        conta_contabil_id: config.conta_despesa_taxa,
        origem: 'baixa_manual_pagbank',
        conta_resultado_id: null,
      });
      console.log(`[forcar-baixa-pagbank] Lançamento de taxa criado: ${taxa}`);
    } else if (taxa > 0) {
      console.log(`[forcar-baixa-pagbank] Taxa detectada (${taxa}) mas conta de despesa não configurada. Pulando lançamento.`);
    }

    // 11.3. CRÉDITO: Clientes a Receber (Ativo diminui - baixa do direito)
    const idCreditoPatrimonial = crypto.randomUUID();
    const contaPatrimonial = parcela.admin_contas_receber?.id_conta_patrimonial;
    
    if (contaPatrimonial) {
      lancamentosPayload.push({
        id: idCreditoPatrimonial,
        proprietario_id: parcela.admin_id,
        data_movimentacao: dataLancamento,
        descricao: `Baixa Direito CR - Transação: ${codigo_transacao.trim()}${force ? ' (Forçado)' : ''}`,
        valor: valor_bruto,
        tipo: 'Saida',
        conta_contabil_id: contaPatrimonial,
        origem: 'baixa_manual_pagbank',
        conta_resultado_id: idDebitoPagBank,
      });
    } else {
      console.warn('[forcar-baixa-pagbank] Conta patrimonial não encontrada. Balanço pode ficar incompleto.');
    }

    // 11.4. Preencher conta_resultado_id dos débitos
    lancamentosPayload[0].conta_resultado_id = idCreditoPatrimonial;
    if (idDebitoTaxa) {
      lancamentosPayload.find(l => l.id === idDebitoTaxa).conta_resultado_id = idCreditoPatrimonial;
    }

    // 11.5. Inserir todos os lançamentos
    const { error: lancamentosError } = await supabaseAdmin
      .from('lancamentos')
      .insert(lancamentosPayload);

    if (lancamentosError) {
      console.error('[forcar-baixa-pagbank] Erro ao criar lançamentos:', lancamentosError);
      throw new Error(`Erro ao criar lançamentos contábeis: ${lancamentosError.message}`);
    }

    console.log(`[forcar-baixa-pagbank] ${lancamentosPayload.length} lançamentos contábeis criados com sucesso`);

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

    // 13. Saldo calculado dinamicamente pelos lançamentos contábeis (não precisa mais atualizar saldo_contas)

    // 14. Retornar sucesso
    return new Response(
      JSON.stringify({
        success: true,
        message: force 
          ? `Baixa forçada realizada com sucesso! Valor líquido: R$ ${valor_liquido.toFixed(2)}, Taxa: R$ ${taxa.toFixed(2)}`
          : `Baixa realizada com sucesso! Valor líquido: R$ ${valor_liquido.toFixed(2)}, Taxa: R$ ${taxa.toFixed(2)}`,
        recebimento_id: recebimento.id,
        valor_liquido,
        taxa
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
