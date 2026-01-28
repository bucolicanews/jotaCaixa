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
  console.log(`[sincronizar-saldos:${requestId}] Iniciando sincronização`);

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { admin_id, dry_run = true } = await req.json();

    if (!admin_id) throw new Error('admin_id é obrigatório');

    console.log(`[sincronizar-saldos:${requestId}] Modo: ${dry_run ? 'DRY RUN' : 'EXECUÇÃO REAL'}`);

    // Buscar todas as contas com saldo
    const { data: saldosAtuais, error: saldosError } = await supabaseAdmin
      .from('saldo_contas')
      .select(`
        id,
        conta_contabil_id,
        saldo_inicial,
        nome,
        plano_contas!inner(
          "Conta",
          "Descricao"
        )
      `)
      .eq('proprietario_id', admin_id);

    if (saldosError) throw new Error(`Erro ao buscar saldos: ${saldosError.message}`);

    console.log(`[sincronizar-saldos:${requestId}] Encontradas ${saldosAtuais.length} contas`);

    const relatorio = {
      total_contas: saldosAtuais.length,
      processadas: 0,
      atualizadas: 0,
      sem_alteracao: 0,
      detalhes: [] as any[],
    };

    // Processar cada conta
    for (const saldo of saldosAtuais) {
      relatorio.processadas++;

      try {
        // Calcular saldo real a partir dos lançamentos
        const { data: lancamentos, error: lancError } = await supabaseAdmin
          .from('lancamentos')
          .select('tipo, valor')
          .eq('conta_contabil_id', saldo.conta_contabil_id)
          .eq('proprietario_id', admin_id);

        if (lancError) {
          console.error(`[sincronizar-saldos:${requestId}] Erro ao buscar lançamentos:`, lancError);
          continue;
        }

        // Calcular saldo: Entrada (+) / Saida (-)
        let saldoCalculado = 0;
        for (const lanc of lancamentos || []) {
          const valor = parseFloat(lanc.valor);
          if (lanc.tipo === 'Entrada') {
            saldoCalculado += valor;
          } else {
            saldoCalculado -= valor;
          }
        }

        const saldoAtual = parseFloat(saldo.saldo_inicial || 0);
        const diferenca = saldoAtual - saldoCalculado;

        console.log(`[sincronizar-saldos:${requestId}] Conta: ${saldo.plano_contas.Conta} - ${saldo.plano_contas.Descricao}`);
        console.log(`[sincronizar-saldos:${requestId}]   Saldo Atual: R$ ${saldoAtual.toFixed(2)}`);
        console.log(`[sincronizar-saldos:${requestId}]   Saldo Real:  R$ ${saldoCalculado.toFixed(2)}`);
        console.log(`[sincronizar-saldos:${requestId}]   Diferença:   R$ ${diferenca.toFixed(2)}`);

        if (Math.abs(diferenca) < 0.01) {
          relatorio.sem_alteracao++;
          console.log(`[sincronizar-saldos:${requestId}]   ✓ OK - Sem alteração necessária`);
        } else {
          if (!dry_run) {
            const { error: updateError } = await supabaseAdmin
              .from('saldo_contas')
              .update({ 
                saldo_inicial: saldoCalculado,
                atualizado_em: new Date().toISOString()
              })
              .eq('id', saldo.id);

            if (updateError) {
              console.error(`[sincronizar-saldos:${requestId}]   ❌ Erro ao atualizar:`, updateError);
              continue;
            }

            console.log(`[sincronizar-saldos:${requestId}]   ✅ Atualizado de R$ ${saldoAtual.toFixed(2)} para R$ ${saldoCalculado.toFixed(2)}`);
          } else {
            console.log(`[sincronizar-saldos:${requestId}]   🔍 DRY RUN - Seria atualizado de R$ ${saldoAtual.toFixed(2)} para R$ ${saldoCalculado.toFixed(2)}`);
          }

          relatorio.atualizadas++;
          relatorio.detalhes.push({
            conta: saldo.plano_contas.Conta,
            descricao: saldo.plano_contas.Descricao,
            saldo_anterior: saldoAtual,
            saldo_novo: saldoCalculado,
            diferenca: diferenca,
          });
        }

      } catch (error: any) {
        console.error(`[sincronizar-saldos:${requestId}] Erro ao processar conta ${saldo.id}:`, error.message);
      }
    }

    console.log(`\n[sincronizar-saldos:${requestId}] ═════════════════════════════════`);
    console.log(`[sincronizar-saldos:${requestId}] RELATÓRIO FINAL:`);
    console.log(`[sincronizar-saldos:${requestId}]   Total Contas: ${relatorio.total_contas}`);
    console.log(`[sincronizar-saldos:${requestId}]   Processadas: ${relatorio.processadas}`);
    console.log(`[sincronizar-saldos:${requestId}]   Atualizadas: ${relatorio.atualizadas}`);
    console.log(`[sincronizar-saldos:${requestId}]   Sem Alteração: ${relatorio.sem_alteracao}`);
    console.log(`[sincronizar-saldos:${requestId}] ═════════════════════════════════`);

    return new Response(
      JSON.stringify({
        success: true,
        dry_run: dry_run,
        message: dry_run 
          ? `Simulação: ${relatorio.atualizadas} contas seriam atualizadas`
          : `Sincronização concluída: ${relatorio.atualizadas} contas atualizadas`,
        relatorio: relatorio,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    console.error(`[sincronizar-saldos] ERRO FATAL:`, error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
