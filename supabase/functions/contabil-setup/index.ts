// @ts-nocheck
/// <reference lib="deno.ns" />
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { proprietarioId } = body ?? {};

    if (!proprietarioId) {
      return new Response(JSON.stringify({ error: "Missing proprietarioId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseService = createClient(
      (Deno.env.get("SUPABASE_URL") as any)!,
      (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as any)!,
      { auth: { persistSession: false } },
    );

    console.log(`LOG: Executando contabil_setup_defaults para ${proprietarioId}`);
    
    // Chamada da RPC que executa o reset, importação e mapeamento
    const { data, error: setupError } = await supabaseService.rpc("contabil_setup_defaults", {
      p_proprietario_id: proprietarioId,
    });

    if (setupError) {
      console.error("RPC Error (Supabase):", setupError);
      throw new Error(`RPC_FAIL: ${setupError.message}`);
    }
    
    if (data && !data[0]?.success) {
      console.error("RPC Logic Error:", data[0]?.message);
      // Se a RPC falhou logicamente (retornou success=false), retorna a mensagem de erro do PL/pgSQL
      return new Response(JSON.stringify({ error: data[0]?.message || "Falha lógica na RPC." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("💥 FATAL ERROR in contabil-setup:", error);
    const message = error instanceof Error ? error.message : "Unknown error.";
    
    // Retorna 500 com a mensagem de erro detalhada
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});