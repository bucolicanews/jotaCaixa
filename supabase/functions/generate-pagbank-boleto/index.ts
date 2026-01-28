import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/* =======================
   Utils
======================= */
function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateSafe(dateString: string): Date {
  // Remove timezone e converte para data local
  const dateOnly = dateString.split('T')[0];
  const [year, month, day] = dateOnly.split('-').map(Number);
  
  // Cria data UTC para evitar problema de timezone
  const date = new Date(Date.UTC(year, month - 1, day));
  
  console.log('[DEBUG] parseDateSafe input:', dateString);
  console.log('[DEBUG] parseDateSafe output:', date.toISOString(), 'Local:', formatDateLocal(date));
  
  return date;
}

function apenasNumeros(v: string | null): string {
  return (v || "").replace(/\D/g, "");
}

/* =======================
   CORS
======================= */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/* =======================
   Handler
======================= */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { parcela_id, admin_id } = await req.json();
    if (!parcela_id || !admin_id) {
      throw new Error("parcela_id e admin_id são obrigatórios");
    }

    /* =======================
       Buscar parcela + cliente
    ======================= */
    const { data: parcela, error: parcelaError } = await supabase
      .from("admin_parcelas_receber")
      .select(`
        id,
        numero_parcela,
        valor_parcela,
        data_vencimento,
        admin_contas_receber!conta_receber_id (
          descricao,
          tbl_clientes!cliente_id (
            nome,
            email,
            email_cobranca,
            cpf,
            cnpj,
            documento,
            telefone,
            cep,
            endereco,
            numero,
            bairro,
            cidade,
            estado,
            complemento
          )
        )
      `)
      .eq("id", parcela_id)
      .single();

    if (parcelaError || !parcela) {
      console.error("[ERRO] Parcela não encontrada:", { parcela_id, error: parcelaError });
      throw new Error("Parcela não encontrada");
    }

    const cliente = parcela.admin_contas_receber.tbl_clientes;

    console.log('[DEBUG] Cliente encontrado:', {
      nome: cliente.nome,
      email: cliente.email,
      email_cobranca: cliente.email_cobranca,
      documento: cliente.cpf || cliente.cnpj || cliente.documento
    });

    /* =======================
       Config PagBank
    ======================= */
    const { data: config } = await supabase
      .from("configuracoes_pagbank")
      .select("*")
      .eq("proprietario_id", admin_id)
      .single();

    if (!config) throw new Error("Configuração PagBank não encontrada");

    const token =
      config.ambiente === "producao"
        ? config.token_producao
        : config.token_sandbox;

    if (!token) throw new Error("Token PagBank não configurado");

    const baseUrl =
      config.ambiente === "producao"
        ? "https://api.pagseguro.com"
        : "https://sandbox.api.pagseguro.com";

    /* =======================
       Datas
    ======================= */
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    console.log('[DEBUG] Data de hoje:', hoje.toISOString());
    console.log('[DEBUG] Data vencimento do banco:', parcela.data_vencimento);

    let vencimento = parseDateSafe(parcela.data_vencimento);
    
    // Verificar se a data é válida
    if (isNaN(vencimento.getTime())) {
      console.error('[ERRO] Data de vencimento inválida:', parcela.data_vencimento);
      throw new Error("Data de vencimento inválida");
    }
    
    vencimento.setHours(0, 0, 0, 0);

    console.log('[DEBUG] Data vencimento parseada:', vencimento.toISOString());

    // PagBank exige no mínimo D+3
    const minVencimento = new Date(hoje);
    minVencimento.setDate(minVencimento.getDate() + 3);

    console.log('[DEBUG] Data mínima (D+3):', minVencimento.toISOString());

    if (vencimento < minVencimento) {
      console.log('[DEBUG] Data vencimento < D+3, ajustando para:', minVencimento.toISOString());
      vencimento = minVencimento;
    }

    const dueDate = formatDateLocal(vencimento);

    const fineDate = new Date(vencimento);
    fineDate.setDate(fineDate.getDate() + 1);
    const fineInterestDate = formatDateLocal(fineDate);

    console.log('[DEBUG] due_date enviado:', dueDate);
    console.log('[DEBUG] fine_date enviado:', fineInterestDate);

    /* =======================
       Cliente
    ======================= */
    const taxId = apenasNumeros(
      cliente.cpf || cliente.cnpj || cliente.documento
    );

    if (![11, 14].includes(taxId.length)) {
      throw new Error("CPF/CNPJ inválido para boleto");
    }

    const nomeCliente = cliente.nome.includes(" ")
      ? cliente.nome
      : `${cliente.nome} Cliente`;

    const uf = (cliente.estado || "SP").toUpperCase();

    const estadosMap: Record<string, string> = {
      AC: "Acre",
      AL: "Alagoas",
      AP: "Amapá",
      AM: "Amazonas",
      BA: "Bahia",
      CE: "Ceará",
      DF: "Distrito Federal",
      ES: "Espírito Santo",
      GO: "Goiás",
      MA: "Maranhão",
      MT: "Mato Grosso",
      MS: "Mato Grosso do Sul",
      MG: "Minas Gerais",
      PA: "Pará",
      PB: "Paraíba",
      PR: "Paraná",
      PE: "Pernambuco",
      PI: "Piauí",
      RJ: "Rio de Janeiro",
      RN: "Rio Grande do Norte",
      RS: "Rio Grande do Sul",
      RO: "Rondônia",
      RR: "Roraima",
      SC: "Santa Catarina",
      SP: "São Paulo",
      SE: "Sergipe",
      TO: "Tocantins",
    };

    const nomeEstado = estadosMap[uf] || "São Paulo";

    // Lógica de email com fallback
    const emailCobranca = cliente.email_cobranca || cliente.email || "cobranca@jotaempresas.com";
    
    console.log('[DEBUG] Email usado para cobrança:', emailCobranca);
    console.log('[DEBUG] Estado:', uf, '→', nomeEstado);

    /* =======================
       Payload PagBank (VALIDADO)
    ======================= */
    const orderRequest = {
      reference_id: `PARCELA_${parcela_id}`,
      customer: {
        name: nomeCliente,
        email: emailCobranca,
        tax_id: taxId,
      },
      items: [
        {
          reference_id: `ITEM_${parcela_id}`,
          name: `Parcela ${parcela.numero_parcela}`,
          quantity: 1,
          unit_amount: Math.round(parcela.valor_parcela * 100),
        },
      ],
      charges: [
        {
          reference_id: `CHARGE_${parcela_id}`,
          description: parcela.admin_contas_receber.descricao,
          amount: {
            value: Math.round(parcela.valor_parcela * 100),
            currency: "BRL",
          },
          payment_method: {
            type: "BOLETO",
            boleto: {
              template: "COBRANCA",
              due_date: dueDate,
              days_until_expiration: "45",
              instruction_lines: {
                line_1: "Pagamento referente à parcela",
                line_2: "Obrigado pela preferência",
              },
              holder: {
                name: nomeCliente,
                tax_id: taxId,
                email: emailCobranca,
                address: {
                  street: cliente.endereco || "Rua Principal",
                  number: cliente.numero || "S/N",
                  complement: cliente.complemento?.trim() || "Sem complemento",
                  locality: cliente.bairro || "Centro",
                  city: cliente.cidade || "São Paulo",
                  region: uf,
                  region_code: uf,
                  country: "BRA",
                  postal_code: apenasNumeros(cliente.cep) || "00000000",
                },
              },
            },
          },
        },
      ],
    };

    console.log("[DEBUG] Payload FINAL:", JSON.stringify(orderRequest, null, 2));

    /* =======================
       Call PagBank
    ======================= */
    const response = await fetch(`${baseUrl}/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-api-version": "4.0",
      },
      body: JSON.stringify(orderRequest),
    });

    const text = await response.text();
    if (!response.ok) {
      console.error("[PAGBANK ERROR]", text);
      throw new Error(text);
    }

    const order = JSON.parse(text);
    const charge = order.charges[0];

    /* =======================
       Persistência
    ======================= */
    await supabase
      .from("admin_parcelas_receber")
      .update({
        pagbank_charge_id: charge.id,
        pagbank_status: "WAITING",
      })
      .eq("id", parcela_id);

    return new Response(
      JSON.stringify({
        success: true,
        order_id: order.id,
        charge_id: charge.id,
        barcode: charge.payment_method.boleto.formatted_barcode,
        pdf_link: charge.links.find((l: any) => l.media === "application/pdf")?.href,
        valor_original: parcela.valor_parcela,
        valor_multa: 0,
        valor_juros: 0,
        valor_total: parcela.valor_parcela,
        dias_atraso: 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("[generate-pagbank-boleto]", e.message);
    return new Response(
      JSON.stringify({ success: false, error: e.message }),
      { status: 400, headers: corsHeaders }
    );
  }
});
