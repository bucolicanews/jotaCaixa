import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OcrRequest {
  comprovante_url: string;
  tipo: "recebimento" | "pagamento";
}

interface OcrResponse {
  success: boolean;
  data?: {
    valor: number | null;
    data: string | null;
    descricao: string | null;
    confianca: number;
  };
  message?: string;
}

function extrairValor(texto: string): number | null {
  const padroes = [
    /R\$\s*([\d.,]+)/gi,
    /(?:valor|total|quantia)[:\s]*R?\$?\s*([\d.,]+)/gi,
    /(?:pagamento|recebimento|deposito)[:\s]*R?\$?\s*([\d.,]+)/gi,
    /([\d]{1,3}(?:\.[\d]{3})*,[\d]{2})/g,
  ];

  for (const padrao of padroes) {
    const matches = texto.matchAll(padrao);
    for (const match of matches) {
      const valorStr = match[1]
        .replace(/\./g, "")
        .replace(",", ".");
      const valor = parseFloat(valorStr);
      if (!isNaN(valor) && valor > 0 && valor < 10000000) {
        return valor;
      }
    }
  }
  return null;
}

function extrairData(texto: string): string | null {
  const padroes = [
    /(\d{2})\/(\d{2})\/(\d{4})/g,
    /(\d{2})-(\d{2})-(\d{4})/g,
    /(\d{4})-(\d{2})-(\d{2})/g,
    /(\d{2})\.(\d{2})\.(\d{4})/g,
  ];

  for (const padrao of padroes) {
    const match = padrao.exec(texto);
    if (match) {
      if (match[0].includes("/") || match[0].includes("-") || match[0].includes(".")) {
        const partes = match[0].split(/[\/\-\.]/);
        if (partes[0].length === 4) {
          return `${partes[0]}-${partes[1]}-${partes[2]}`;
        } else {
          return `${partes[2]}-${partes[1]}-${partes[0]}`;
        }
      }
    }
  }
  return null;
}

function extrairDescricao(texto: string): string | null {
  const linhas = texto.split("\n").filter((l) => l.trim().length > 10);
  
  const palavrasChave = ["pix", "ted", "doc", "transferencia", "deposito", "pagamento", "recebimento", "boleto"];
  
  for (const linha of linhas) {
    const linhaLower = linha.toLowerCase();
    for (const palavra of palavrasChave) {
      if (linhaLower.includes(palavra)) {
        return linha.trim().substring(0, 100);
      }
    }
  }

  if (linhas.length > 0) {
    return linhas[0].trim().substring(0, 100);
  }

  return null;
}

function calcularConfianca(valor: number | null, data: string | null, descricao: string | null): number {
  let pontos = 0;
  if (valor !== null) pontos += 40;
  if (data !== null) pontos += 35;
  if (descricao !== null) pontos += 25;
  return pontos;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, message: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { comprovante_url, tipo }: OcrRequest = await req.json();

    if (!comprovante_url) {
      return new Response(
        JSON.stringify({ success: false, message: "URL do comprovante é obrigatória" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let textoExtraido = "";

    const isPdf = comprovante_url.toLowerCase().endsWith(".pdf");
    const isImage = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(comprovante_url);

    if (isPdf) {
      textoExtraido = `Comprovante de ${tipo === "recebimento" ? "Recebimento" : "Pagamento"} - Processamento PDF pendente de implementação OCR`;
    } else if (isImage) {
      textoExtraido = `Comprovante de ${tipo === "recebimento" ? "Recebimento" : "Pagamento"} - Processamento de Imagem pendente de implementação OCR`;
    } else {
      return new Response(
        JSON.stringify({ success: false, message: "Formato de arquivo não suportado. Use PDF ou imagem (JPG, PNG)." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const valor = extrairValor(textoExtraido);
    const data = extrairData(textoExtraido);
    const descricao = extrairDescricao(textoExtraido);
    const confianca = calcularConfianca(valor, data, descricao);

    const response: OcrResponse = {
      success: true,
      data: {
        valor,
        data,
        descricao,
        confianca,
      },
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Erro no processamento OCR:", error);
    return new Response(
      JSON.stringify({ success: false, message: error.message || "Erro interno no processamento" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
