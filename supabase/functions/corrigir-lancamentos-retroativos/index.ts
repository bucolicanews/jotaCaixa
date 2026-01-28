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
  console.log(`[corrigir-retroativo:${requestId}] Iniciando correção retroativa`);

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { admin_id, dry_run = true } = await req.json();

    if (!admin_id) throw new Error('admin_id é obrigatório');

    console.log(`[corrigir-retroativo:${requestId}] Modo: ${dry_run ? 'DRY RUN (simulação)' : 'EXECUÇÃO REAL'}`);

    // Buscar recebimentos PagBank sem lançamentos
    const query = `
      SELECT 
        r.id,
        r.parcela_id,
        r.valor_recebido,
        r.pagbank_taxa_valor,
        r.pagbank_valor_liquido,
        r.data_recebimento,
        p.valor_parcela,
        cr.id_conta_patrimonial
      FROM admin_recebimentos r
      INNER JOIN admin_parcelas_receber p ON r.parcela_id = p.id
      INNER JOIN admin_contas_receber cr ON p.conta_receber_id = cr.id
      WHERE r.forma_pagamento = 'PagBank'
        AND r.admin_id = $1
        AND NOT EXISTS (
          SELECT 1 FROM lancamentos l 
          WHERE l.origem IN ('recebimento_pagbank', 'recebimento_pagbank_retroativo')
          AND l.data_movimentacao = r.data_recebimento
          AND l.proprietario_id = r.admin_id
        )
    `;

    const { data: recebimentosSemLancamentos, error: queryError } = await supabaseAdmin.rpc('exec_sql', {
      query: query,
      params: [admin_id]
    });

    if (queryError) {
      // Fallback: buscar manualmente
      const { data: allRecebimentos } = await supabaseAdmin
        .from('admin_recebimentos')
        .select(`
          id,
          parcela_id,
          valor_recebido,
          pagbank_taxa_valor,
          pagbank_valor_liquido,
          data_recebimento,
          admin_parcelas_receber!inner(
            valor_parcela,
            admin_contas_receber!inner(
              id_conta_patrimonial
            )
          )
        `)
        .eq('forma_pagamento', 'PagBank')
        .eq('admin_id', admin_id);

      if (!allRecebimentos || allRecebimentos.length === 0) {
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: 'Nenhum recebimento PagBank encontrado',
            corrigidos: 0
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      // Filtrar manualmente os que não têm lançamentos
      const recebimentosFiltrados = [];
      for (const rec of allRecebimentos) {
        const { count } = await supabaseAdmin
          .from('lancamentos')
          .select('*', { count: 'exact', head: true })
          .in('origem', ['recebimento_pagbank', 'recebimento_pagbank_retroativo'])
          .eq('data_movimentacao', rec.data_recebimento)
          .eq('proprietario_id', admin_id);

        if (count === 0) {
          recebimentosFiltrados.push({
            id: rec.id,
            parcela_id: rec.parcela_id,
            valor_recebido: rec.valor_recebido,
            pagbank_taxa_valor: rec.pagbank_taxa_valor,
            pagbank_valor_liquido: rec.pagbank_valor_liquido,
            data_recebimento: rec.data_recebimento,
            valor_parcela: rec.admin_parcelas_receber.valor_parcela,
            id_conta_patrimonial: rec.admin_parcelas_receber.admin_contas_receber.id_conta_patrimonial
          });
        }
      }

      if (recebimentosFiltrados.length === 0) {
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: 'Todos os recebimentos já possuem lançamentos',
            corrigidos: 0
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      recebimentosSemLancamentos = recebimentosFiltrados;
    }

    console.log(`[corrigir-retroativo:${requestId}] Encontrados ${recebimentosSemLancamentos.length} recebimentos para corrigir`);

    const relatorio = {
      total_encontrados: recebimentosSemLancamentos.length,
      processados: 0,
      sucesso: 0,
      erros: 0,
      detalhes: [] as any[],
    };

    // Buscar configuração PagBank
    const { data: config, error: configError } = await supabaseAdmin
      .from('configuracoes_pagbank')
      .select('*')
      .eq('proprietario_id', admin_id)
      .single();

    if (configError || !config) {
      throw new Error('Configuração PagBank não encontrada');
    }

    // Processar cada recebimento
    for (const recebimento of recebimentosSemLancamentos) {
      relatorio.processados++;
      const recId = recebimento.id;

      try {
        console.log(`\n[corrigir-retroativo:${requestId}] Processando ${relatorio.processados}/${recebimentosSemLancamentos.length}`);
        console.log(`[corrigir-retroativo:${requestId}] Recebimento: ${recId}`);

        if (!recebimento.id_conta_patrimonial) {
          throw new Error('Conta patrimonial não configurada');
        }

        if (!config.conta_sintetica_id) {
          throw new Error('Conta PagBank não configurada');
        }

        const valorBruto = parseFloat(recebimento.valor_recebido);
        const taxa = parseFloat(recebimento.pagbank_taxa_valor);
        const valorLiquido = parseFloat(recebimento.pagbank_valor_liquido);

        // Validar partida dobrada
        const somaDebitos = valorLiquido + taxa;
        if (Math.abs(somaDebitos - valorBruto) > 0.01) {
          throw new Error(`Partida dobrada não fecha: ${somaDebitos.toFixed(2)} != ${valorBruto.toFixed(2)}`);
        }

        const idPagBank = crypto.randomUUID();
        const idTaxa = crypto.randomUUID();
        const idPatrimonial = crypto.randomUUID();

        const lancamentosPayload = [];

        // DÉBITO: Conta PagBank (valor líquido)
        lancamentosPayload.push({
          id: idPagBank,
          proprietario_id: admin_id,
          data_movimentacao: recebimento.data_recebimento,
          descricao: `[RETROATIVO] Recebimento PagBank`,
          valor: valorLiquido,
          tipo: 'Entrada',
          conta_contabil_id: config.conta_sintetica_id,
          origem: 'recebimento_pagbank_retroativo',
          conciliado: true,
          historico_id: config.historico_padrao_id || null,
          conta_resultado_id: idPatrimonial,
        });

        // DÉBITO: Despesa Taxa (se houver)
        if (taxa > 0 && config.conta_despesa_taxa_id) {
          lancamentosPayload.push({
            id: idTaxa,
            proprietario_id: admin_id,
            data_movimentacao: recebimento.data_recebimento,
            descricao: `[RETROATIVO] Taxa PagBank`,
            valor: taxa,
            tipo: 'Entrada',
            conta_contabil_id: config.conta_despesa_taxa_id,
            origem: 'recebimento_pagbank_retroativo',
            conciliado: true,
            historico_id: config.historico_taxa_id || config.historico_padrao_id || null,
            conta_resultado_id: idPatrimonial,
          });
        }

        // CRÉDITO: Baixa Patrimonial
        lancamentosPayload.push({
          id: idPatrimonial,
          proprietario_id: admin_id,
          data_movimentacao: recebimento.data_recebimento,
          descricao: `[RETROATIVO] Baixa Direito CR`,
          valor: valorBruto,
          tipo: 'Saida',
          conta_contabil_id: recebimento.id_conta_patrimonial,
          origem: 'recebimento_pagbank_retroativo',
          conciliado: true,
          historico_id: config.historico_padrao_id || null,
          conta_resultado_id: idPagBank,
        });

        console.log(`[corrigir-retroativo:${requestId}] Lançamentos: ${lancamentosPayload.length}`);

        if (!dry_run) {
          const { error: lancError } = await supabaseAdmin
            .from('lancamentos')
            .insert(lancamentosPayload);

          if (lancError) {
            throw new Error(`Erro ao criar lançamentos: ${lancError.message}`);
          }

          console.log(`[corrigir-retroativo:${requestId}] ✅ Lançamentos criados`);
        } else {
          console.log(`[corrigir-retroativo:${requestId}] 🔍 DRY RUN - simulação apenas`);
        }

        relatorio.sucesso++;
        relatorio.detalhes.push({
          recebimento_id: recId,
          parcela_id: recebimento.parcela_id,
          status: 'sucesso',
          valor_bruto: valorBruto,
          taxa: taxa,
          valor_liquido: valorLiquido,
          lancamentos_criados: lancamentosPayload.length,
        });

      } catch (error: any) {
        console.error(`[corrigir-retroativo:${requestId}] ❌ Erro:`, error.message);
        relatorio.erros++;
        relatorio.detalhes.push({
          recebimento_id: recId,
          parcela_id: recebimento.parcela_id,
          status: 'erro',
          erro: error.message,
        });
      }
    }

    console.log(`[corrigir-retroativo:${requestId}] RELATÓRIO:`);
    console.log(`[corrigir-retroativo:${requestId}]   Encontrados: ${relatorio.total_encontrados}`);
    console.log(`[corrigir-retroativo:${requestId}]   Sucesso: ${relatorio.sucesso}`);
    console.log(`[corrigir-retroativo:${requestId}]   Erros: ${relatorio.erros}`);

    return new Response(
      JSON.stringify({
        success: true,
        dry_run: dry_run,
        message: dry_run 
          ? `Simulação: ${relatorio.sucesso} recebimentos podem ser corrigidos`
          : `Correção concluída: ${relatorio.sucesso} recebimentos corrigidos`,
        relatorio: relatorio,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    console.error(`[corrigir-retroativo] ERRO FATAL:`, error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
