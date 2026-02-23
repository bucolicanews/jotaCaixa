import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useSessao } from '@/hooks/use-sessao';
import { useOwner } from '@/hooks/use-owner';

export interface DadosCategorizacao {
  id_conta_contabil: string;
  id_historico: string;
  observacao?: string;
}

export interface ResultadoConciliacao {
  success: boolean;
  lancamentoId?: string;
  error?: string;
}

export async function conciliarTransacaoDireta(
  transacaoId: string,
  dados: DadosCategorizacao,
  isAdmin: boolean,
  ownerId: string
): Promise<ResultadoConciliacao> {
  try {
    const { data: extrato, error: extratoError } = await supabase
      .from('extratos')
      .select('id, valor, data, descricao, identificacao, tipo, id_saldo_contas')
      .eq('id', transacaoId)
      .single();

    if (extratoError || !extrato) {
      throw extratoError || new Error('Extrato não encontrado');
    }

    const valorAbsoluto = Math.abs(extrato.valor);
    const isEntrada = extrato.tipo === 'Entrada';
    const dataTransacao = extrato.data;
    const contaBancariaId = extrato.id_saldo_contas;

    const tabelaLancamentos = isAdmin ? 'admin_lancamentos' : 'lancamentos';
    const ownerKey = isAdmin ? 'admin_id' : 'empresa_id';

    if (!isEntrada && contaBancariaId) {
      const { data: saldoConta } = await supabase
        .from('saldo_contas')
        .select('saldo_atual, nome')
        .eq('id', contaBancariaId)
        .single();

      if (saldoConta && saldoConta.saldo_atual < valorAbsoluto) {
        return {
          success: false,
          error: `Saldo insuficiente na conta "${saldoConta.nome}". Saldo atual: R$ ${saldoConta.saldo_atual.toFixed(2)}, Valor necessário: R$ ${valorAbsoluto.toFixed(2)}`
        };
      }
    }

    const lancamentoPrincipal: any = {
      [ownerKey]: ownerId,
      data_lancamento: dataTransacao,
      valor: valorAbsoluto,
      tipo: isEntrada ? 'C' : 'D',
      id_conta_contabil: dados.id_conta_contabil,
      id_historico: dados.id_historico,
      observacao: dados.observacao || `Conciliação direta - ${extrato.descricao || extrato.identificacao || 'Sem descrição'}`,
      origem: 'conciliacao_direta',
      id_saldo_contas: contaBancariaId,
    };

    const { data: lancamentoCriado, error: lancamentoError } = await supabase
      .from(tabelaLancamentos)
      .insert(lancamentoPrincipal)
      .select()
      .single();

    if (lancamentoError) {
      throw lancamentoError;
    }

    if (contaBancariaId) {
      const lancamentoContrapartida: any = {
        [ownerKey]: ownerId,
        data_lancamento: dataTransacao,
        valor: valorAbsoluto,
        tipo: isEntrada ? 'D' : 'C',
        id_conta_contabil: dados.id_conta_contabil,
        id_historico: dados.id_historico,
        observacao: `Contrapartida bancária - ${extrato.descricao || extrato.identificacao || 'Sem descrição'}`,
        origem: 'conciliacao_direta_contrapartida',
        id_saldo_contas: contaBancariaId,
      };

      const { error: contrapartidaError } = await supabase
        .from(tabelaLancamentos)
        .insert(lancamentoContrapartida);

      if (contrapartidaError) {
        console.warn('Erro ao criar contrapartida:', contrapartidaError);
      }

      const novoSaldo = isEntrada 
        ? supabase.rpc('increment_saldo', { conta_id: contaBancariaId, valor: valorAbsoluto })
        : supabase.rpc('decrement_saldo', { conta_id: contaBancariaId, valor: valorAbsoluto });

      const { error: saldoError } = await novoSaldo;
      
      if (saldoError) {
        const operacao = isEntrada ? '+' : '-';
        const { error: updateError } = await supabase
          .from('saldo_contas')
          .update({ 
            saldo_atual: supabase.raw(`saldo_atual ${operacao} ${valorAbsoluto}`)
          })
          .eq('id', contaBancariaId);

        if (updateError) {
          console.warn('Erro ao atualizar saldo:', updateError);
        }
      }
    }

    const { error: extratoUpdateError } = await supabase
      .from('extratos')
      .update({ 
        status_mapeamento: 'conciliado_direto',
        conta_contabil_id: dados.id_conta_contabil
      })
      .eq('id', transacaoId);

    if (extratoUpdateError) {
      console.warn('Erro ao atualizar status do extrato:', extratoUpdateError);
    }

    return {
      success: true,
      lancamentoId: lancamentoCriado?.id
    };

  } catch (error: any) {
    console.error('Erro ao conciliar transação direta:', error);
    return {
      success: false,
      error: error.message || 'Erro desconhecido ao conciliar'
    };
  }
}

export async function buscarHistoricosPadrao(
  isAdmin: boolean,
  ownerId: string
): Promise<{ id: string; descricao: string }[]> {
  const { data, error } = await supabase
    .from('historicos')
    .select('id, descricao')
    .eq('proprietario_id', ownerId)
    .order('descricao', { ascending: true });

  if (error) {
    console.error('Erro ao buscar históricos:', error);
    return [];
  }

  return data || [];
}

export async function buscarContasContabeis(
  isAdmin: boolean,
  ownerId: string,
  tipo: 'receita' | 'despesa'
): Promise<{ id: string; codigo: string; nome: string }[]> {
  const ownerKey = 'proprietario_id';
  const prefixo = tipo === 'receita' ? '4' : '5';

  const { data, error } = await supabase
    .from('plano_contas')
    .select('id, Conta, Descricao, Analitica, is_conta_resultado')
    .eq(ownerKey, ownerId)
    .eq('Analitica', 'S')
    .like('Conta', `${prefixo}%`)
    .order('Conta', { ascending: true });

  if (error) {
    console.error('Erro ao buscar contas contábeis:', error);
    return [];
  }

  return (data || []).map(c => ({
    id: c.id,
    codigo: c.Conta,
    nome: c.Descricao
  }));
}

export function useConciliacaoDireta(
    transacaoAtual: any,
    transacoesPendentes: any[],
    setTransacoesPendentes: (updater: (prev: any[]) => any[]) => void,
    setTransacaoAtual: (transacao: any) => void,
    setIndiceAtual: (updater: (prev: number) => number) => void,
    setCarregandoCandidatos: (loading: boolean) => void,
    setCandidatosAtuais: (candidatos: any[]) => void,
    setModalMapeamentoOpen: (open: boolean) => void
) {
    const { role } = useSessao();
    const { ownerId, ownerType } = useOwner();
    const isAdmin = role === 'Admin';
    const [modalCategorizacaoDiretaOpen, setModalCategorizacaoDiretaOpen] = useState(false);

    const handleAbrirCategorizacaoDireta = useCallback(() => {
        setModalCategorizacaoDiretaOpen(true);
    }, []);

    const handleFecharCategorizacaoDireta = useCallback(() => {
        setModalCategorizacaoDiretaOpen(false);
    }, []);

    const handleConfirmarCategorizacaoDireta = useCallback(async (dados: DadosCategorizacao) => {
        if (!transacaoAtual || !ownerId) return;

        const result = await conciliarTransacaoDireta(
            transacaoAtual.id,
            dados,
            isAdmin,
            ownerId
        );

        if (!result.success) {
            showError(result.error || 'Erro ao conciliar transação');
            return;
        }

        showSuccess('Transação conciliada diretamente com sucesso!');
        
        const novasPendentes = transacoesPendentes.filter(t => t.id !== transacaoAtual.id);
        setTransacoesPendentes(() => novasPendentes);

        if (novasPendentes.length > 0) {
            const proxima = novasPendentes[0];
            setTransacaoAtual(proxima);
            setIndiceAtual(prev => prev + 1);
            setModalCategorizacaoDiretaOpen(false);
            setModalMapeamentoOpen(true);
        } else {
            setModalCategorizacaoDiretaOpen(false);
            setModalMapeamentoOpen(false);
            showSuccess('Todas as transações foram processadas!');
        }
    }, [transacaoAtual, transacoesPendentes, ownerId, isAdmin, ownerType, setTransacoesPendentes, setTransacaoAtual, setIndiceAtual, setCarregandoCandidatos, setCandidatosAtuais, setModalMapeamentoOpen]);

    return {
        modalCategorizacaoDiretaOpen,
        handleAbrirCategorizacaoDireta,
        handleFecharCategorizacaoDireta,
        handleConfirmarCategorizacaoDireta,
        setModalCategorizacaoDiretaOpen,
    };
}
