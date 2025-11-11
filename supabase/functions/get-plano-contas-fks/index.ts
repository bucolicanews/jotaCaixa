// @ts-nocheck
/// <reference lib="deno.ns" />
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { proprietarioId } = body;

    if (!proprietarioId) {
      return new Response(JSON.stringify({ error: 'Missing proprietarioId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Inicializar Supabase Client com SERVICE ROLE KEY (ignora RLS)
    const supabaseService = createClient(
      (Deno.env.get('SUPABASE_URL') as any)!,
      (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as any)!,
      { auth: { persistSession: false } }
    );
    
    const oldFKs = [];

    // --- 1. Saldo Contas (Bancos/Caixas/Patrimoniais) ---
    const { data: saldoContas, error: scError } = await supabaseService
        .from('saldo_contas')
        .select(`
            id, 
            nome, 
            saldo_inicial, 
            conta_contabil_id,
            plano_contas ( Conta, Descricao, is_conta_caixa_banco, is_conta_patrimonial )
        `)
        .eq('proprietario_id', proprietarioId)
        .not('conta_contabil_id', 'is', null);

    if (scError) throw scError;
    
    saldoContas.forEach(sc => {
        if (sc.conta_contabil_id && sc.plano_contas) {
            oldFKs.push({
                id: sc.id,
                nome: sc.nome,
                tabela: 'saldo_contas',
                old_conta_contabil_id: sc.conta_contabil_id,
                old_conta_contabil_nome: `${sc.plano_contas.Conta} - ${sc.plano_contas.Descricao}`,
                saldo_inicial: sc.saldo_inicial,
                is_conta_caixa_banco: sc.plano_contas.is_conta_caixa_banco,
                is_conta_patrimonial: sc.plano_contas.is_conta_patrimonial,
            });
        }
    });
    
    // --- 2. Configurações Contas a Receber (CR) ---
    const { data: configCR, error: crError } = await supabaseService
        .from('configuracao_contas_receber')
        .select(`
            id, 
            tipo_registro, 
            conta_contabil_id,
            plano_contas ( Conta, Descricao, is_conta_resultado )
        `)
        .eq('proprietario_id', proprietarioId)
        .not('conta_contabil_id', 'is', null);
        
    if (crError) throw crError;
    
    configCR.forEach(ccr => {
        if (ccr.conta_contabil_id && ccr.plano_contas) {
            oldFKs.push({
                id: ccr.id,
                nome: `CR: ${ccr.tipo_registro}`,
                tabela: 'config_cr',
                old_conta_contabil_id: ccr.conta_contabil_id,
                old_conta_contabil_nome: `${ccr.plano_contas.Conta} - ${ccr.plano_contas.Descricao}`,
                tipo_registro: ccr.tipo_registro,
                is_conta_resultado: ccr.plano_contas.is_conta_resultado,
            });
        }
    });
    
    // --- 3. Configurações Contas a Pagar (CP) ---
    const { data: configCP, error: cpError } = await supabaseService
        .from('configuracao_contas_pagar')
        .select(`
            id, 
            tipo_registro, 
            conta_contabil_id,
            plano_contas ( Conta, Descricao, is_conta_resultado )
        `)
        .eq('proprietario_id', proprietarioId)
        .not('conta_contabil_id', 'is', null);
        
    if (cpError) throw cpError;
    
    configCP.forEach(ccp => {
        if (ccp.conta_contabil_id && ccp.plano_contas) {
            oldFKs.push({
                id: ccp.id,
                nome: `CP: ${ccp.tipo_registro}`,
                tabela: 'config_cp',
                old_conta_contabil_id: ccp.conta_contabil_id,
                old_conta_contabil_nome: `${ccp.plano_contas.Conta} - ${ccp.plano_contas.Descricao}`,
                tipo_registro: ccp.tipo_registro,
                is_conta_resultado: ccp.plano_contas.is_conta_resultado,
            });
        }
    });
    
    // --- 4. Configurações Stripe ---
    const { data: configStripe, error: stripeError } = await supabaseService
        .from('configuracoes_stripe')
        .select(`
            id, 
            conta_sintetica_id, 
            conta_receber_id,
            conta_sintetica:plano_contas!conta_sintetica_id ( Conta, Descricao, is_conta_caixa_banco, is_conta_patrimonial ),
            conta_receber:plano_contas!conta_receber_id ( Conta, Descricao, is_conta_caixa_banco, is_conta_patrimonial )
        `)
        .eq('proprietario_id', proprietarioId)
        .or('conta_sintetica_id.is.null,conta_receber_id.is.null', { not: true }); // Busca onde pelo menos um não é nulo

    if (stripeError) throw stripeError;
    
    configStripe.forEach(cs => {
        // Conta Sintética (Banco/Caixa)
        if (cs.conta_sintetica_id && cs.conta_sintetica) {
            oldFKs.push({
                id: cs.id,
                nome: 'Stripe: Conta Sintética',
                tabela: 'config_stripe_sintetica',
                old_conta_contabil_id: cs.conta_sintetica_id,
                old_conta_contabil_nome: `${cs.conta_sintetica.Conta} - ${cs.conta_sintetica.Descricao}`,
                tipo_registro: 'conta_sintetica',
                is_conta_caixa_banco: cs.conta_sintetica.is_conta_caixa_banco,
                is_conta_patrimonial: cs.conta_sintetica.is_conta_patrimonial,
            });
        }
        // Conta Receber (Parcela)
        if (cs.conta_receber_id && cs.conta_receber) {
            oldFKs.push({
                id: cs.id,
                nome: 'Stripe: Conta Receber',
                tabela: 'config_stripe_receber',
                old_conta_contabil_id: cs.conta_receber_id,
                old_conta_contabil_nome: `${cs.conta_receber.Conta} - ${cs.conta_receber.Descricao}`,
                tipo_registro: 'conta_receber',
                is_conta_caixa_banco: cs.conta_receber.is_conta_caixa_banco,
                is_conta_patrimonial: cs.conta_receber.is_conta_patrimonial,
            });
        }
    });

    return new Response(JSON.stringify({ oldFKs }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 FATAL ERROR in get-plano-contas-fks:', error);
    const message = error instanceof Error ? error.message : 'Unknown error.';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});