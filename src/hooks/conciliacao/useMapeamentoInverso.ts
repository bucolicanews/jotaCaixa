import { supabase } from '@/integrations/supabase/client';
import { differenceInDays } from 'date-fns';
import { calcularSimilaridadeAvancada, normalizarNome } from '@/utils/string-similarity';

export interface TransacaoExtratoCandidata {
  id: string;
  data: string;
  descricao: string;
  identificacao: string | null;
  valor: number;
  tipo: 'Entrada' | 'Saida';
  compatibilidade: 'alta' | 'media' | 'baixa';
  motivo_compatibilidade: string;
  similaridade_nome?: number;
  nome_comparado?: string;
}

export interface DadosParcela {
  valor: number;
  data_vencimento: string;
  cliente_nome?: string;
  fornecedor?: string;
  tipo: 'CR' | 'CP';
}

export async function buscarTransacoesExtratoDisponiveis(
  parcela: DadosParcela,
  ownerId: string
): Promise<TransacaoExtratoCandidata[]> {
  const tipoTransacao = parcela.tipo === 'CR' ? 'Entrada' : 'Saida';
  
  const { data: transacoes, error } = await supabase
    .from('extratos')
    .select('*')
    .eq('empresa_id', ownerId)
    .eq('tipo', tipoTransacao)
    .eq('status_mapeamento', 'pendente_mapeamento')
    .order('data', { ascending: false });

  if (error) {
    console.error('Erro ao buscar transações do extrato:', error);
    return [];
  }

  if (!transacoes || transacoes.length === 0) {
    return [];
  }

  const valorParcela = Math.abs(parcela.valor);
  const dataParcela = new Date(parcela.data_vencimento);
  const nomeParceiro = parcela.tipo === 'CR' ? parcela.cliente_nome : parcela.fornecedor;
  const nomeParceiroNormalizado = normalizarNome(nomeParceiro || '');

  return transacoes.map(t => {
    const valorTransacao = Math.abs(t.valor);
    const dataTransacao = new Date(t.data);
    const nomeExtratoNormalizado = normalizarNome(t.identificacao || '');

    const diferencaValor = Math.abs(valorTransacao - valorParcela);
    const percentualDiferenca = (diferencaValor / valorParcela) * 100;
    const diferencaDias = Math.abs(differenceInDays(dataTransacao, dataParcela));

    const similaridadeNome = nomeExtratoNormalizado && nomeParceiroNormalizado
      ? calcularSimilaridadeAvancada(nomeExtratoNormalizado, nomeParceiroNormalizado)
      : 0;

    let compatibilidade: 'alta' | 'media' | 'baixa' = 'baixa';
    let motivo = '';

    if (diferencaValor < 0.01 && diferencaDias <= 1 && similaridadeNome >= 80) {
      compatibilidade = 'alta';
      motivo = `Valor exato (R$ ${valorTransacao.toFixed(2)}), data próxima (±${diferencaDias} dia), nome muito similar (${similaridadeNome.toFixed(0)}%)`;
    } else if (diferencaValor < 0.01 && diferencaDias <= 3) {
      compatibilidade = 'alta';
      motivo = `Valor exato (R$ ${valorTransacao.toFixed(2)}), data próxima (±${diferencaDias} dias)`;
    } else if (diferencaValor < 0.01 && diferencaDias <= 7) {
      compatibilidade = 'media';
      motivo = `Valor exato (R$ ${valorTransacao.toFixed(2)}), diferença de ${diferencaDias} dias`;
    } else if (percentualDiferenca <= 2 && diferencaDias <= 3 && similaridadeNome >= 70) {
      compatibilidade = 'media';
      motivo = `Valor próximo (±${percentualDiferenca.toFixed(1)}%), data próxima (±${diferencaDias} dias), nome similar (${similaridadeNome.toFixed(0)}%)`;
    } else if (diferencaValor < 0.01) {
      compatibilidade = 'media';
      motivo = `Valor exato (R$ ${valorTransacao.toFixed(2)}), mas datas distantes (${diferencaDias} dias)`;
    } else if (similaridadeNome >= 80 && percentualDiferenca <= 5) {
      compatibilidade = 'media';
      motivo = `Nome muito similar (${similaridadeNome.toFixed(0)}%), valor próximo (±${percentualDiferenca.toFixed(1)}%)`;
    } else {
      motivo = `Diferença de valor: R$ ${diferencaValor.toFixed(2)} (${percentualDiferenca.toFixed(1)}%), diferença de ${diferencaDias} dias`;
      if (similaridadeNome > 0) {
        motivo += `, similaridade de nome: ${similaridadeNome.toFixed(0)}%`;
      }
    }

    return {
      id: t.id,
      data: t.data,
      descricao: t.descricao,
      identificacao: t.identificacao,
      valor: t.valor,
      tipo: t.tipo,
      compatibilidade,
      motivo_compatibilidade: motivo,
      similaridade_nome: similaridadeNome,
      nome_comparado: nomeExtratoNormalizado
    };
  }).sort((a, b) => {
    const ordem = { alta: 3, media: 2, baixa: 1 };
    const diffCompat = ordem[b.compatibilidade] - ordem[a.compatibilidade];
    if (diffCompat !== 0) return diffCompat;
    return (b.similaridade_nome || 0) - (a.similaridade_nome || 0);
  });
}

export async function vincularParcelaComExtrato(
  parcelaId: string,
  transacaoExtratoId: string,
  tipo: 'CR' | 'CP',
  isAdmin: boolean,
  ownerId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const tabelaParcelas = tipo === 'CR' 
      ? (isAdmin ? 'admin_parcelas_contas_receber' : 'parcelas_contas_receber')
      : (isAdmin ? 'admin_parcelas_contas_pagar' : 'parcelas_contas_pagar');

    const { error: updateError } = await supabase
      .from(tabelaParcelas)
      .update({ 
        mapeado_extrato_id: transacaoExtratoId,
        data_pagamento: new Date().toISOString()
      })
      .eq('id', parcelaId);

    if (updateError) throw updateError;

    const { error: extratoError } = await supabase
      .from('extratos')
      .update({ 
        status_mapeamento: tipo === 'CR' ? 'mapeado_cr' : 'mapeado_cp'
      })
      .eq('id', transacaoExtratoId);

    if (extratoError) throw extratoError;

    return { success: true };

  } catch (error: any) {
    console.error('Erro ao vincular parcela com extrato:', error);
    return {
      success: false,
      error: error.message || 'Erro desconhecido ao vincular'
    };
  }
}
