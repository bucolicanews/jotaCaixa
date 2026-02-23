import { supabase } from '@/integrations/supabase/client';
import { TransacaoExtrato } from '@/types/conciliacao';
import { parseISO, format, subDays, addDays, differenceInDays, isValid } from 'date-fns';
import { normalizeString } from '@/utils/formatters';
import { calcularSimilaridadeAvancada, normalizarNome } from '@/utils/string-similarity';

export interface ParcelaCandidato {
  id: string;
  numero_parcela: number;
  valor_parcela: number;
  data_vencimento: string;
  data_pagamento: string | null;
  anexo_url: string | null;
  mapeado_extrato_id: string | null;
  conta_receber_id?: string;
  conta_pagar_id?: string;
  tipo: 'CR' | 'CP';
  compatibilidade: 'alta' | 'media' | 'baixa';
  motivo_compatibilidade: string;
  descricao_conta?: string;
  cliente_nome?: string;
  fornecedor?: string;
  origem?: string;
  status?: string;
  similaridade_nome?: number;
  nome_comparado?: string;
  pagbank_transaction_id?: string | null;
}

export interface TransacaoComId extends TransacaoExtrato {
  id: string;
}

// Helper para identificar transações PagBank
function isPagBankTransaction(descricao: string, origem?: string): boolean {
  const descNormalized = normalizeString(descricao);
  return (
    origem === 'recebimento_pagbank' ||
    origem === 'taxa_pagbank' ||
    origem === 'link_pagamento_pagbank' ||
    descNormalized.includes('parcela_') ||
    descNormalized.includes('pagbank') ||
    descNormalized.includes('pag bank')
  );
}

export async function buscarParcelasCandidatas(
  transacao: TransacaoExtrato,
  ownerId: string
): Promise<ParcelaCandidato[]> {
  const tipo = transacao.tipo === 'Entrada' ? 'CR' : 'CP';
  // Simplificado: Se há ownerId, sempre usamos as tabelas de admin.
  // A RLS cuidará da permissão.
  const tabelaParcelas = tipo === 'CR' ? 'admin_parcelas_receber' : 'admin_parcelas_pagar';
  const tabelaRecebimentos = 'admin_recebimentos';
  const tabelaPagamentos = 'admin_pagamentos';
  const tabelaContasSinteticas = tipo === 'CR' ? 'admin_contas_receber' : 'admin_contas_pagar';
  const ownerKey = 'admin_id';

  const isPagBank = isPagBankTransaction(transacao.descricao);

  // CONVERSÃO DE DATA ROBUSTA
  let dataTransacao: Date;
  const rawData = transacao.data;
  
  if (rawData instanceof Date) {
      dataTransacao = rawData;
  } else {
      // Tenta parseISO primeiro
      const parsed = parseISO(rawData);
      if (isValid(parsed)) {
          dataTransacao = parsed;
      } else {
          // Tenta formato brasileiro DD/MM/YYYY
          const partes = rawData.split(/[\/\-]/);
          if (partes.length === 3) {
              // Se o primeiro item tiver 4 dígitos, assume YYYY-MM-DD
              if (partes[0].length === 4) {
                  dataTransacao = new Date(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2]));
              } else {
                  // Assume DD/MM/YYYY
                  dataTransacao = new Date(parseInt(partes[2]), parseInt(partes[1]) - 1, parseInt(partes[0]));
              }
          } else {
              dataTransacao = new Date();
          }
      }
  }
  
  if (!isValid(dataTransacao)) {
      dataTransacao = new Date();
  }
  
  const diasBusca = isPagBank ? 2 : 3;
  const dataInicio = format(subDays(dataTransacao, diasBusca), 'yyyy-MM-dd');
  const dataFim = format(addDays(dataTransacao, diasBusca), 'yyyy-MM-dd');

  const { data: parcelas, error: parcelasError } = await supabase
    .from(tabelaParcelas)
    .select('*')
    .eq(ownerKey, ownerId)
    .is('mapeado_extrato_id', null)
    .in('status', ['aberta', 'parcial', 'paga'])
    .gte('data_vencimento', dataInicio)
    .lte('data_vencimento', dataFim);

  if (parcelasError || !parcelas) {
    console.error('Erro ao buscar parcelas candidatas:', parcelasError);
    return [];
  }

  const parcelaIds = parcelas.map(p => p.id);
  if (parcelaIds.length === 0) return [];

  const tabelaAnexos = tipo === 'CR' ? tabelaRecebimentos : tabelaPagamentos;
  const { data: anexos } = await supabase
    .from(tabelaAnexos)
    .select('parcela_id, anexo_url')
    .in('parcela_id', parcelaIds)
    .not('anexo_url', 'is', null);

  const anexoMap = (anexos || []).reduce((acc, a) => {
    acc[a.parcela_id] = a.anexo_url;
    return acc;
  }, {} as Record<string, string>);

  const contaIds = [...new Set(parcelas.map(p => tipo === 'CR' ? p.conta_receber_id : p.conta_pagar_id))];
  
  let contaDescMap: Record<string, { descricao: string; origem: string; cliente_id: string | null; fornecedor: string | null }> = {};
  let clienteMap: Record<string, string> = {};

  if (tipo === 'CR') {
    const { data: contasSinteticas } = await supabase
      .from(tabelaContasSinteticas)
      .select('id, descricao, origem, cliente_id')
      .in('id', contaIds);

    contaDescMap = (contasSinteticas || []).reduce((acc, c) => {
      acc[c.id] = { descricao: c.descricao, origem: c.origem || 'manual', cliente_id: c.cliente_id, fornecedor: null };
      return acc;
    }, {} as Record<string, { descricao: string; origem: string; cliente_id: string | null; fornecedor: string | null }>);

    const clienteIds = (contasSinteticas || [])
      .map(c => c.cliente_id)
      .filter(Boolean) as string[];
    
    const { data: clientes } = await supabase
      .from('tbl_clientes')
      .select('id, nome')
      .in('id', clienteIds);

    clienteMap = (clientes || []).reduce((acc, c) => {
      acc[c.id] = c.nome;
      return acc;
    }, {} as Record<string, string>);
  } else {
    const campoDescricao = 'descricao';
    const { data: contasSinteticas } = await supabase
      .from(tabelaContasSinteticas)
      .select(`id, ${campoDescricao}, origem, fornecedor`)
      .in('id', contaIds);

    contaDescMap = (contasSinteticas || []).reduce((acc, c: any) => {
      acc[c.id] = { 
        descricao: c.descricao || '', 
        origem: c.origem || 'manual', 
        cliente_id: null, 
        fornecedor: c.fornecedor 
      };
      return acc;
    }, {} as Record<string, { descricao: string; origem: string; cliente_id: string | null; fornecedor: string | null }>);
  }

  const valorTransacao = Math.abs(transacao.valor);
  const nomeExtratoNormalizado = normalizarNome(transacao.identificacao || '');
  const codigoTransacaoExtrato = transacao.identificacao?.trim();

  return parcelas.map(p => {
    const diferencaValor = Math.abs(p.valor_parcela - valorTransacao);
    const dataPagamento = p.data_pagamento || p.data_vencimento;
    
    let dataPgto: Date;
    try {
      dataPgto = parseISO(dataPagamento);
    } catch {
      dataPgto = new Date();
    }
    
    const diferencaDias = Math.abs(differenceInDays(dataPgto, dataTransacao));

    const contaId = tipo === 'CR' ? p.conta_receber_id : p.conta_pagar_id;
    const contaInfo = contaId ? contaDescMap[contaId] : null;
    const clienteNome = contaInfo?.cliente_id ? clienteMap[contaInfo.cliente_id] : null;
    const nomeParceiroNormalizado = normalizarNome(tipo === 'CR' ? (clienteNome || '') : (contaInfo?.fornecedor || ''));
    
    const similaridadeNome = nomeExtratoNormalizado && nomeParceiroNormalizado 
      ? calcularSimilaridadeAvancada(nomeExtratoNormalizado, nomeParceiroNormalizado)
      : 0;

    let compatibilidade: 'alta' | 'media' | 'baixa' = 'baixa';
    let motivo = '';

    // Match por Código de Transação (Prioridade Máxima)
    if (codigoTransacaoExtrato && p.pagbank_transaction_id === codigoTransacaoExtrato) {
        compatibilidade = 'alta';
        motivo = 'Código de transação idêntico encontrado.';
    } else if (diferencaValor < 0.01 && diferencaDias <= 1 && similaridadeNome >= 80) {
      compatibilidade = 'alta';
      motivo = `Valor exato, data próxima (±1 dia) e nome similar (${similaridadeNome.toFixed(0)}%)`;
    } else if (diferencaValor < 0.01 && diferencaDias === 0) {
      compatibilidade = 'alta';
      motivo = 'Valor e data exatos';
    } else if (diferencaValor < 0.01 && diferencaDias <= 1) {
      compatibilidade = 'media';
      motivo = 'Valor exato, data próxima (±1 dia)';
    } else if (diferencaValor < 0.01 && diferencaDias <= 3 && similaridadeNome >= 70) {
      compatibilidade = 'media';
      motivo = `Valor exato, data próxima (±3 dias) e nome similar (${similaridadeNome.toFixed(0)}%)`;
    } else if (diferencaValor < 1 && diferencaDias <= 3 && similaridadeNome >= 80) {
      compatibilidade = 'media';
      motivo = `Valor aproximado, data próxima e nome similar (${similaridadeNome.toFixed(0)}%)`;
    } else if (diferencaValor < 1 && diferencaDias <= 3) {
      compatibilidade = 'media';
      motivo = 'Valor e data aproximados';
    } else {
      motivo = 'Compatibilidade baixa';
    }

    return {
      id: p.id,
      numero_parcela: p.numero_parcela,
      valor_parcela: p.valor_parcela,
      data_vencimento: p.data_vencimento,
      data_pagamento: p.data_pagamento,
      anexo_url: anexoMap[p.id] || null,
      mapeado_extrato_id: p.mapeado_extrato_id,
      conta_receber_id: tipo === 'CR' ? p.conta_receber_id : undefined,
      conta_pagar_id: tipo === 'CP' ? p.conta_pagar_id : undefined,
      tipo,
      compatibilidade,
      motivo_compatibilidade: motivo,
      descricao_conta: contaInfo?.descricao,
      cliente_nome: clienteNome,
      fornecedor: contaInfo?.fornecedor || undefined,
      origem: contaInfo?.origem,
      status: p.status,
      similaridade_nome: similaridadeNome > 0 ? similaridadeNome : undefined,
      nome_comparado: nomeParceiroNormalizado || undefined,
      pagbank_transaction_id: p.pagbank_transaction_id,
    } as ParcelaCandidato;
  }).sort((a, b) => {
    const ordem = { alta: 3, media: 2, baixa: 1 };
    const diffCompat = ordem[b.compatibilidade] - ordem[a.compatibilidade];
    if (diffCompat !== 0) return diffCompat;
    return (b.similaridade_nome || 0) - (a.similaridade_nome || 0);
  });
}

export interface ConfirmacaoMapeamentoResult {
  success: boolean;
  error?: string;
  needsAccountSelection?: boolean;
  valorFaltante?: number;
  contaAtualId?: string;
  contaAtualNome?: string;
  saldoAtual?: number;
}

export async function confirmarMapeamento(
  transacaoId: string,
  parcelaId: string,
  tipo: 'CR' | 'CP',
  isAdmin: boolean,
  ownerId: string
): Promise<ConfirmacaoMapeamentoResult> {
  const tabelaParcelas = isAdmin 
    ? (tipo === 'CR' ? 'admin_parcelas_receber' : 'admin_parcelas_pagar')
    : (tipo === 'CR' ? 'parcelas_contas_receber' : 'parcelas_contas_pagar');
  const tabelaMovimentacao = isAdmin
    ? (tipo === 'CR' ? 'admin_recebimentos' : 'admin_pagamentos')
    : (tipo === 'CR' ? 'recebimentos' : 'pagamentos');
  const ownerKey = isAdmin ? 'admin_id' : 'empresa_id';

  try {
    const { data: extrato, error: extratoFetchError } = await supabase
      .from('extratos')
      .select('id, valor, data, descricao, id_saldo_contas')
      .eq('id', transacaoId)
      .single();

    if (extratoFetchError || !extrato) throw extratoFetchError || new Error('Extrato não encontrado');

    const campoContaId = tipo === 'CR' ? 'conta_receber_id' : 'conta_pagar_id';
    const { data: parcela, error: fetchError } = await supabase
      .from(tabelaParcelas)
      .select(`*, ${campoContaId}`)
      .eq('id', parcelaId)
      .single();

    if (fetchError || !parcela) throw fetchError || new Error('Parcela não encontrada');

    const valorExtrato = Math.abs(extrato.valor);
    const valorParcela = parcela.valor_parcela;
    const valorPagoAnterior = parcela.valor_pago || 0;
    const novoValorPago = valorPagoAnterior + valorExtrato;
    const quitou = novoValorPago >= valorParcela;
    const dataTransacao = extrato.data;
    const contaBancariaId = extrato.id_saldo_contas;

    if (tipo === 'CP' && contaBancariaId) {
      const { data: saldoConta } = await supabase
        .from('saldo_contas')
        .select('id, nome, saldo_atual')
        .eq('id', contaBancariaId)
        .single();

      if (saldoConta && saldoConta.saldo_atual < valorExtrato) {
        return {
          success: false,
          needsAccountSelection: true,
          valorFaltante: valorExtrato - saldoConta.saldo_atual,
          contaAtualId: contaBancariaId,
          contaAtualNome: saldoConta.nome,
          saldoAtual: saldoConta.saldo_atual,
        };
      }
    }

    const [configRes] = await Promise.all([
      supabase.from(tipo === 'CR' ? 'configuracao_contas_receber' : 'configuracao_contas_pagar')
        .select('conta_contabil_id')
        .eq('proprietario_id', ownerId)
        .eq('tipo_registro', tipo === 'CR' ? 'recebimento' : 'pagamento')
        .maybeSingle()
    ]);
    const contaContabil = configRes.data?.conta_contabil_id || null;

    if (tipo === 'CR') {
      const recebimentoPayload: any = {
        parcela_id: parcelaId,
        [ownerKey]: ownerId,
        valor_recebido: valorExtrato,
        data_recebimento: dataTransacao,
        forma_pagamento: 'Transferência',
        tipo_recebimento: quitou ? 'total' : 'parcial',
        conta_id: contaBancariaId,
      };
      if (contaContabil) recebimentoPayload.id_conta_contabil = contaContabil;
      if (isAdmin && parcela.cliente_id) recebimentoPayload.cliente_id = parcela.cliente_id;

      const { error: recebError } = await supabase.from(tabelaMovimentacao).insert(recebimentoPayload);
      if (recebError) throw recebError;
    } else {
      const pagamentoPayload: any = {
        parcela_id: parcelaId,
        [ownerKey]: ownerId,
        valor_pago: valorExtrato,
        data_pagamento: dataTransacao,
        forma_pagamento: 'Transferência',
        tipo_pagamento: quitou ? 'total' : 'parcial',
        conta_id: contaBancariaId,
      };
      if (contaContabil) pagamentoPayload.id_conta_contabil = contaContabil;

      const { error: pagError } = await supabase.from(tabelaMovimentacao).insert(pagamentoPayload);
      if (pagError) throw pagError;
    }

    const updateData: any = {
      mapeado_extrato_id: transacaoId,
      valor_pago: novoValorPago,
      status: quitou ? 'paga' : 'parcial',
    };
    if (!parcela.data_pagamento) {
      updateData.data_pagamento = dataTransacao;
    }

    const { error: parcelaError } = await supabase
      .from(tabelaParcelas)
      .update(updateData)
      .eq('id', parcelaId);

    if (parcelaError) throw parcelaError;

    if (quitou) {
      const tabelaContasSinteticas = isAdmin 
        ? (tipo === 'CR' ? 'admin_contas_receber' : 'admin_contas_pagar')
        : (tipo === 'CR' ? 'contas_receber' : 'contas_pagar');
      const campoContaIdSint = tipo === 'CR' ? 'conta_receber_id' : 'conta_pagar_id';
      const contaSinteticaId = parcela[campoContaIdSint];
      
      if (contaSinteticaId) {
        const { data: todasParcelas } = await supabase
          .from(tabelaParcelas)
          .select('id, status')
          .eq(campoContaIdSint, contaSinteticaId);
        
        const todasQuitadas = (todasParcelas || []).every(p => p.status === 'paga');
        
        if (todasQuitadas) {
          await supabase
            .from(tabelaContasSinteticas)
            .update({ status: tipo === 'CR' ? 'recebido' : 'pago' })
            .eq('id', contaSinteticaId);
        }
      }
    }

    const { error: extratoError } = await supabase
      .from('extratos')
      .update({ status_mapeamento: 'mapeado_manual' })
      .eq('id', transacaoId);

    if (extratoError) throw extratoError;

    return { success: true };
  } catch (error: any) {
    console.error('Erro ao confirmar mapeamento:', error);
    return { success: false, error: error.message };
  }
}

export async function desvincularMapeamento(
  transacaoId: string,
  parcelaId: string,
  tipo: 'CR' | 'CP',
  isAdmin: boolean
): Promise<{ success: boolean; error?: string }> {
  const tabelaParcelas = isAdmin 
    ? (tipo === 'CR' ? 'admin_parcelas_receber' : 'admin_parcelas_pagar')
    : (tipo === 'CR' ? 'parcelas_contas_receber' : 'parcelas_contas_pagar');
  const tabelaMovimentacao = isAdmin
    ? (tipo === 'CR' ? 'admin_recebimentos' : 'admin_pagamentos')
    : (tipo === 'CR' ? 'recebimentos' : 'pagamentos');

  try {
    const { data: movimentacoes, error: movError } = await supabase
      .from(tabelaMovimentacao)
      .select('id, valor_recebido, valor_pago')
      .eq('parcela_id', parcelaId);

    if (movError) throw movError;

    let valorARemover = 0;
    if (movimentacoes && movimentacoes.length > 0) {
      const ultimaMov = movimentacoes[movimentacoes.length - 1];
      valorARemover = tipo === 'CR' ? (ultimaMov.valor_recebido || 0) : (ultimaMov.valor_pago || 0);
      
      const { error: delMovError } = await supabase
        .from(tabelaMovimentacao)
        .delete()
        .eq('id', ultimaMov.id);
      if (delMovError) throw delMovError;
    }

    const { data: parcela } = await supabase
      .from(tabelaParcelas)
      .select('valor_pago, valor_parcela')
      .eq('id', parcelaId)
      .single();

    const novoValorPago = Math.max(0, (parcela?.valor_pago || 0) - valorARemover);
    const status = novoValorPago === 0 ? 'aberta' : 'parcial';

    const { error: parcelaError } = await supabase
      .from(tabelaParcelas)
      .update({ 
        mapeado_extrato_id: null,
        valor_pago: novoValorPago,
        status,
        data_pagamento: novoValorPago === 0 ? null : undefined
      })
      .eq('id', parcelaId);

    if (parcelaError) throw parcelaError;

    const { error: extratoError } = await supabase
      .from('extratos')
      .update({ status_mapeamento: 'pendente_mapeamento' })
      .eq('id', transacaoId);

    if (extratoError) throw extratoError;

    return { success: true };
  } catch (error: any) {
    console.error('Erro ao desvincular mapeamento:', error);
    return { success: false, error: error.message };
  }
}

export async function buscarTransacoesPendentes(
  ownerId: string
): Promise<TransacaoComId[]> {
  const { data, error } = await supabase
    .from('extratos')
    .select('*')
    .eq('empresa_id', ownerId)
    .eq('status_mapeamento', 'pendente_mapeamento')
    .order('data', { ascending: true });

  if (error) {
    console.error('Erro ao buscar transações pendentes:', error);
    return [];
  }

  return (data || []).map(e => ({
    id: e.id,
    data: e.data,
    descricao: e.descricao,
    valor: e.valor,
    tipo: e.tipo as 'Entrada' | 'Saida',
    identificacao: e.identificacao,
    conciliada: e.conciliado,
    conta_contabil_id: e.conta_contabil_id,
  }));
}
