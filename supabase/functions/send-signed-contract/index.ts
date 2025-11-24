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
    const { contratoId, clienteEmail } = body;

    if (!contratoId || !clienteEmail) {
      return new Response(JSON.stringify({ error: 'Missing required fields (contratoId, clienteEmail)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Inicializar Supabase Client com SERVICE ROLE KEY
    const supabaseService = createClient(
      (Deno.env.get('SUPABASE_URL') as any)!,
      (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as any)!,
      { auth: { persistSession: false } }
    );

    // 1. Buscar o contrato assinado e os detalhes da assinatura
    const { data: contrato, error: fetchError } = await supabaseService
      .from('contratos_gerados')
      .select('conteudo_renderizado, assinatura_nome, assinatura_selfie_url, assinatura_proprietario_nome, assinatura_proprietario_url, valores_tags_preenchidos, updated_at')
      .eq('id', contratoId)
      .single();

    if (fetchError || !contrato) {
      console.error('Fetch Contract Error:', fetchError);
      // Retorna 404 se não encontrar
      return new Response(JSON.stringify({ error: 'Contrato não encontrado ou não finalizado.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const isHtml = contrato.valores_tags_preenchidos?.tipo_conteudo === 'html';
    let emailContent = contrato.conteudo_renderizado || 'Conteúdo indisponível.';
    const titulo = contrato.valores_tags_preenchidos?.titulo || 'Contrato Assinado';
    const dataAssinatura = contrato.updated_at ? new Date(contrato.updated_at) : new Date();

    // 2. Adicionar a seção de assinaturas ao conteúdo (para o corpo do email)
    const assinaturasHtml = `
        <div style="margin-top: 50px; padding-top: 20px; border-top: 1px solid #ccc; page-break-before: avoid;">
            <h3 style="font-size: 16px; font-weight: bold; margin-bottom: 20px;">Assinaturas</h3>
            <div style="display: flex; justify-content: space-around; text-align: center;">
                <div style="width: 45%;">
                    ${contrato.assinatura_proprietario_url ? `<img src="${contrato.assinatura_proprietario_url}" style="max-height: 50px; margin-bottom: 5px;" />` : '_________________________'}
                    <div style="border-top: 1px solid #000; padding-top: 5px; font-size: 12px;">
                        ${contrato.assinatura_proprietario_nome || 'Empresa Contratante'}
                    </div>
                    <p style="font-size: 10px; margin-top: 5px;">Contratante (Empresa)</p>
                </div>
                <div style="width: 45%;">
                    ${contrato.assinatura_selfie_url ? `<img src="${contrato.assinatura_selfie_url}" style="max-height: 50px; margin-bottom: 5px;" />` : '_________________________'}
                    <div style="border-top: 1px solid #000; padding-top: 5px; font-size: 12px;">
                        ${contrato.assinatura_nome || 'Cliente Contratado'}
                    </div>
                    <p style="font-size: 10px; margin-top: 5px;">Contratado (Cliente)</p>
                </div>
            </div>
            <p style="font-size: 10px; text-align: center; margin-top: 20px;">
                Documento assinado eletronicamente em ${dataAssinatura.toLocaleDateString('pt-BR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}.
            </p>
        </div>
    `;

    // 3. Substituir as tags de assinatura no conteúdo renderizado
    let finalContent = emailContent;
    
    const empresaSignature = `
        <div style="text-align: center; margin-top: 20px;">
            ${contrato.assinatura_proprietario_url ? `<img src="${contrato.assinatura_proprietario_url}" style="max-height: 50px; margin-bottom: 5px;" />` : '_________________________'}
            <div style="border-top: 1px solid #000; padding-top: 5px; font-size: 12px;">
                ${contrato.assinatura_proprietario_nome || 'Empresa Contratante'}
            </div>
            <p style="font-size: 10px; margin-top: 5px;">Contratante (Empresa)</p>
        </div>
    `;
    
    const clienteSignature = `
        <div style="text-align: center; margin-top: 20px;">
            ${contrato.assinatura_selfie_url ? `<img src="${contrato.assinatura_selfie_url}" style="max-height: 50px; margin-bottom: 5px;" />` : '_________________________'}
            <div style="border-top: 1px solid #000; padding-top: 5px; font-size: 12px;">
                ${contrato.assinatura_nome || 'Cliente Contratado'}
            </div>
            <p style="font-size: 10px; margin-top: 5px;">Contratado (Cliente)</p>
        </div>
    `;
    
    finalContent = finalContent.replace(/\{\{ASSINATURA_EMPRESA\}\}/g, empresaSignature);
    finalContent = finalContent.replace(/\{\{ASSINATURA_CLIENTE\}\}/g, clienteSignature);

    // 4. Injetar o rodapé de assinaturas (se for HTML)
    if (isHtml) {
        const bodyEndIndex = finalContent.toLowerCase().lastIndexOf('</body>');
        if (bodyEndIndex !== -1) {
            finalContent = finalContent.substring(0, bodyEndIndex) + assinaturasHtml + finalContent.substring(bodyEndIndex);
        } else {
            finalContent += assinaturasHtml;
        }
    } else {
        // Se for texto simples, adiciona o rodapé de assinatura
        finalContent += `\n\n--- Assinaturas ---\nContratante: ${contrato.assinatura_proprietario_nome || 'Empresa'}\nContratado: ${contrato.assinatura_nome || 'Cliente'}\nData: ${dataAssinatura.toLocaleDateString('pt-BR')}`;
    }

    // 5. Enviar o email (Simulação)
    
    console.log(`\n--- SIMULAÇÃO DE ENVIO DE EMAIL ---`);
    console.log(`PARA: ${clienteEmail}`);
    console.log(`ASSUNTO: Cópia do Contrato Assinado: ${titulo}`);
    console.log(`CONTEÚDO (HTML/TEXTO): [Contrato Completo com Assinaturas Anexado/Embutido]`);
    console.log(`----------------------------------\n`);

    // Retorna 200 com sucesso
    return new Response(JSON.stringify({ success: true, message: 'Email simulated successfully.' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 FATAL ERROR in send-signed-contract:', error);
    const message = error instanceof Error ? error.message : 'Unknown error.';
    // Retorna 500 em caso de erro fatal
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});