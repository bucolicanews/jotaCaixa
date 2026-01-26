import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// Função para calcular juros e multa
function calcularJurosMulta(params: {
  valorOriginal: number;
  dataVencimento: string;
  percentualMulta: number;
  percentualJurosMes: number;
}) {
  const hoje = new Date();
  const vencimento = new Date(params.dataVencimento);
  
  hoje.setHours(0, 0, 0, 0);
  vencimento.setHours(0, 0, 0, 0);
  
  const diasAtraso = Math.floor((hoje.getTime() - vencimento.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diasAtraso <= 0) {
    return {
      diasAtraso: 0,
      valorMulta: 0,
      valorJuros: 0,
      valorTotal: params.valorOriginal,
      dataCalculo: hoje.toISOString()
    };
  }
  
  const valorMulta = params.valorOriginal * (params.percentualMulta / 100);
  const jurosDiario = (params.percentualJurosMes / 30) / 100;
  const valorJuros = params.valorOriginal * jurosDiario * diasAtraso;
  const valorTotal = params.valorOriginal + valorMulta + valorJuros;
  
  return {
    diasAtraso,
    valorMulta: parseFloat(valorMulta.toFixed(2)),
    valorJuros: parseFloat(valorJuros.toFixed(2)),
    valorTotal: parseFloat(valorTotal.toFixed(2)),
    dataCalculo: hoje.toISOString()
  };
}

function formatarInstrucoesBoleto(config: {
  percentualMulta: number;
  percentualJurosMes: number;
}): string[] {
  const jurosDiario = (config.percentualJurosMes / 30).toFixed(3);
  
  return [
    `Após vencimento: Multa de ${config.percentualMulta}%`,
    `Juros de ${jurosDiario}% ao dia (${config.percentualJurosMes}% ao mês)`
  ];
}

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

    const { parcela_id, admin_id } = await req.json();

    if (!parcela_id || !admin_id) {
      throw new Error('Parâmetros ausentes: parcela_id e admin_id são obrigatórios.');
    }

    console.log(`[generate-pagbank-boleto] 🧾 Gerando boleto para parcela: ${parcela_id}`);

    // 1. Buscar parcela e dados do cliente
    const { data: parcela, error: parcelaError } = await supabaseAdmin
      .from('admin_parcelas_receber')
      .select(`
        *,
        admin_contas_receber (
          *,
          tbl_clientes (
            nome, email, cpf, cnpj, documento, telefone,
            cep, endereco, numero, bairro, cidade, estado, complemento
          )
        )
      `)
      .eq('id', parcela_id)
      .single();

    if (parcelaError || !parcela) throw new Error('Parcela não encontrada.');

    const cliente = parcela.admin_contas_receber?.tbl_clientes;
    if (!cliente) throw new Error('Dados do cliente não encontrados.');

    // 2. Buscar config do PagBank
    const { data: config, error: configError } = await supabaseAdmin
      .from('configuracoes_pagbank')
      .select('*')
      .eq('proprietario_id', admin_id)
      .single();

    if (configError || !config) throw new Error('Configuração PagBank não encontrada.');

    // 3. Processar Token e URL
    const rawToken = config.ambiente === 'producao' ? config.token_producao : config.token_sandbox;
    const token = (rawToken || '').trim();
    const baseUrl = config.ambiente === 'producao' ? 'https://api.pagseguro.com' : 'https://sandbox.api.pagseguro.com';

    if (!token) throw new Error(`Token de ${config.ambiente} não configurado.`);

    // 4. Calcular juros e multa se necessário
    let valorFinal = parcela.valor_parcela;
    let diasAtraso = 0;
    let valorMulta = 0;
    let valorJuros = 0;

    if (config.aplica_juros_multa) {
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const vencimento = new Date(parcela.data_vencimento);
      vencimento.setHours(0, 0, 0, 0);
      
      if (hoje > vencimento) {
        const calculo = calcularJurosMulta({
          valorOriginal: parcela.valor_parcela,
          dataVencimento: parcela.data_vencimento,
          percentualMulta: config.percentual_multa || 2.0,
          percentualJurosMes: config.percentual_juros_mes || 1.0
        });
        
        diasAtraso = calculo.diasAtraso;
        valorMulta = calculo.valorMulta;
        valorJuros = calculo.valorJuros;
        valorFinal = calculo.valorTotal;
        
        console.log(`[generate-pagbank-boleto] ⚠️ Parcela vencida há ${diasAtraso} dias`);
        console.log(`[generate-pagbank-boleto] Valor com acréscimos: R$ ${valorFinal.toFixed(2)}`);
      }
    }

    // 5. Preparar dados do cliente
    const taxId = (cliente.cpf || cliente.cnpj || cliente.documento || '').replace(/\D/g, '');
    let nomeCliente = cliente.nome.trim();
    if (!nomeCliente.includes(' ')) nomeCliente += ' Cliente';
    
    // Validar email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const emailValido = cliente.email && emailRegex.test(cliente.email) 
      ? cliente.email 
      : 'cobranca@jotaempresas.com';
    
    // Calcular data de vencimento do boleto (não pode ser no passado)
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const vencimentoParcela = new Date(parcela.data_vencimento);
    vencimentoParcela.setHours(0, 0, 0, 0);
    
    // Se a parcela já venceu, define vencimento do boleto para D+3
    let dataVencimentoBoleto: Date;
    if (vencimentoParcela < hoje) {
      dataVencimentoBoleto = new Date(hoje);
      dataVencimentoBoleto.setDate(dataVencimentoBoleto.getDate() + 3);
      console.log(`[generate-pagbank-boleto] Parcela vencida. Boleto vencerá em: ${dataVencimentoBoleto.toISOString().split('T')[0]}`);
    } else {
      dataVencimentoBoleto = vencimentoParcela;
    }
    const dueDate = dataVencimentoBoleto.toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Validar e normalizar UF
    const estadosValidos = [
      'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
      'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
      'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
    ];
    let uf = (cliente.estado || 'SP').toUpperCase().trim();
    if (!estadosValidos.includes(uf)) {
      console.warn(`[generate-pagbank-boleto] UF inválida: "${cliente.estado}" -> usando SP como fallback`);
      uf = 'SP';
    }
    console.log(`[generate-pagbank-boleto] UF normalizada: "${uf}"`);
    console.log(`[generate-pagbank-boleto] Dados do cliente:`, {
      nome: cliente.nome,
      estado_original: cliente.estado,
      endereco: cliente.endereco,
      cidade: cliente.cidade,
      cep: cliente.cep
    });

    // 6. Preparar instruções do boleto
    const instrucoes = formatarInstrucoesBoleto({
      percentualMulta: config.percentual_multa || 2.0,
      percentualJurosMes: config.percentual_juros_mes || 1.0
    });

    const webhookUrl = config.webhook_url || `${Deno.env.get('SUPABASE_URL')}/functions/v1/pagbank-webhook`;

    console.log('[generate-pagbank-boleto] Dados do endereço:', {
      street: cliente.endereco || 'Rua Principal',
      number: cliente.numero || 'S/N',
      locality: cliente.bairro || 'Centro',
      city: cliente.cidade || 'São Paulo',
      region_code: uf,
      postal_code: (cliente.cep || '').replace(/\D/g, '') || '00000000'
    });

    // 7. Montar payload da cobrança (Charge API)
    const chargeRequest = {
      reference_id: `PARCELA_${parcela_id}`,
      description: `Parcela ${parcela.numero_parcela} - ${parcela.admin_contas_receber.descricao}`,
      amount: {
        value: Math.round(valorFinal * 100),
        currency: 'BRL'
      },
      payment_method: {
        type: 'BOLETO',
        boleto: {
          due_date: dueDate,
          instruction_lines: {
            line_1: instrucoes[0],
            line_2: instrucoes[1]
          },
          holder: {
            name: nomeCliente,
            tax_id: taxId,
            email: emailValido,
            address: {
              street: cliente.endereco || 'Rua Principal',
              number: cliente.numero || 'S/N',
              complement: cliente.complemento || '',
              locality: cliente.bairro || 'Centro',
              city: cliente.cidade || 'São Paulo',
              region: uf,
              region_code: uf,
              country: 'BRA',
              postal_code: (cliente.cep || '').replace(/\D/g, '') || '00000000'
            }
          }
        }
      },
      notification_urls: [webhookUrl]
    };

    console.log(`[generate-pagbank-boleto] Chamando API: ${baseUrl}/charges`);

    // 8. Executar chamada API
    const response = await fetch(`${baseUrl}/charges`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(chargeRequest),
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error(`[generate-pagbank-boleto] Error ${response.status}:`, responseText);
      throw new Error(`PagBank (${response.status}): ${responseText}`);
    }

    const chargeResponse = JSON.parse(responseText);
    
    const boletoData = chargeResponse.payment_method?.boleto;
    const barcode = boletoData?.barcode || '';
    const formattedBarcode = boletoData?.formatted_barcode || '';
    const pdfLink = chargeResponse.links?.find((l: any) => l.rel === 'PAY')?.href || '';

    console.log(`[generate-pagbank-boleto] ✅ Boleto gerado com sucesso!`);
    console.log(`[generate-pagbank-boleto] - ID: ${chargeResponse.id}`);
    console.log(`[generate-pagbank-boleto] - Código de barras: ${formattedBarcode}`);
    console.log(`[generate-pagbank-boleto] - PDF: ${pdfLink}`);

    // 9. Salvar no banco
    await supabaseAdmin
      .from('admin_parcelas_receber')
      .update({
        pagbank_charge_id: chargeResponse.id,
        pagbank_boleto_barcode: formattedBarcode,
        pagbank_boleto_pdf: pdfLink,
        pagbank_status: 'WAITING',
        pagbank_updated_at: new Date().toISOString(),
        valor_original: parcela.valor_parcela,
        valor_multa: valorMulta,
        valor_juros: valorJuros,
        dias_atraso: diasAtraso,
        data_calculo_juros: diasAtraso > 0 ? new Date().toISOString() : null
      })
      .eq('id', parcela_id);

    // 10. Log de criação
    await supabaseAdmin.from('pagbank_transaction_logs').insert({
      proprietario_id: admin_id,
      transaction_type: 'payment',
      pagbank_id: chargeResponse.id,
      reference_id: `PARCELA_${parcela_id}`,
      status: 'WAITING',
      amount: valorFinal,
      request_payload: chargeRequest,
      response_payload: chargeResponse,
    });

    return new Response(
      JSON.stringify({
        success: true,
        charge_id: chargeResponse.id,
        barcode: formattedBarcode,
        pdf_link: pdfLink,
        valor_original: parcela.valor_parcela,
        valor_multa: valorMulta,
        valor_juros: valorJuros,
        valor_total: valorFinal,
        dias_atraso: diasAtraso
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    console.error('[generate-pagbank-boleto] Fatal Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
