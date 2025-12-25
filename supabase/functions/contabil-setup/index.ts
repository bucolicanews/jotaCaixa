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

    // 1) Reset total para evitar violação de FK ao substituir o plano
    const { data: resetData, error: resetError } = await supabaseService.rpc("contabil_reset_all", {
      p_proprietario_id: proprietarioId,
    });
    if (resetError || (resetData && resetData[0]?.success === false)) {
      throw new Error(resetError?.message || resetData?.[0]?.message || "Falha ao resetar antes do setup contábil.");
    }

    // 2) Executa o setup padrão (plano + históricos + configs)
    const { data, error } = await supabaseService.rpc("contabil_setup_defaults", {
      p_proprietario_id: proprietarioId,
    });

    if (error || (data && !data[0]?.success)) {
      throw new Error(error?.message || data?.[0]?.message || "Falha ao executar setup contábil.");
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("💥 FATAL ERROR in contabil-setup:", error);
    const message = error instanceof Error ? error.message : "Unknown error.";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
