import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import type { ExecutarMapeamentoRequest, ResultadoExecucao } from '@/types/conciliacao';

export function useExecucaoMapeamento() {
  const [loading, setLoading] = useState(false);
  const { empresaId, usuario } = useSessao();

  const executarMapeamento = useCallback(async (
    request: ExecutarMapeamentoRequest
  ): Promise<ResultadoExecucao> => {
    setLoading(true);

    try {
      if (!empresaId) {
        showError('Empresa não identificada');
        return {
          sucesso: false,
          transacaoConciliada: false,
          parcelasBaixadas: [],
          mensagem: 'Empresa não identificada',
        };
      }

      if (!usuario?.id) {
        showError('Usuário não identificado');
        return {
          sucesso: false,
          transacaoConciliada: false,
          parcelasBaixadas: [],
          mensagem: 'Usuário não identificado',
        };
      }

      const { transacaoId, mapeamentos, valorRestante } = request;
      const parcelasBaixadas: string[] = [];
      let lancamentoAvulsoId: string | undefined;

      // Executar transação atômica no Supabase usando RPC (se disponível)
      // Caso contrário, executar sequencialmente

      for (const mapeamento of mapeamentos) {
        const { parcelaId, tipo, valorAplicado } = mapeamento;

        // 1. Inserir vínculo em extrato_parcela_vinculo
        const { error: vinculoError } = await supabase
          .from('extrato_parcela_vinculo')
          .insert({
            extrato_id: transacaoId,
            parcela_id: parcelaId,
            tipo_parcela: tipo,
            valor_vinculado: valorAplicado,
            empresa_id: empresaId,
            usuario_id: usuario.id,
          });

        if (vinculoError) {
          console.error('Erro ao inserir vínculo:', vinculoError);
          showError('Erro ao criar vínculo de parcela');
          throw new Error('Erro ao criar vínculo de parcela');
        }

        // 2. Atualizar parcela: vinculada_extrato e valor_vinculado
        const tabelaParcela = tipo === 'CR'
          ? 'admin_parcelas_contas_receber'
          : 'admin_parcelas_contas_pagar';

        // Buscar parcela atual
        const { data: parcelaAtual, error: fetchError } = await supabase
          .from(tabelaParcela as any)
          .select('id, valor, valor_vinculado')
          .eq('id', parcelaId)
          .eq('empresa_id', empresaId)
          .single();

        let tabelaReal = tabelaParcela;
        let parcelaData = parcelaAtual;

        if (fetchError || !parcelaAtual) {
          // Tentar na tabela normal
          const tabelaNormal = tipo === 'CR'
            ? 'parcelas_contas_receber'
            : 'parcelas_contas_pagar';

          const { data: parcelaNormal, error: errorNormal } = await supabase
            .from(tabelaNormal as any)
            .select('id, valor, valor_vinculado')
            .eq('id', parcelaId)
            .eq('empresa_id', empresaId)
            .single();

          if (errorNormal || !parcelaNormal) {
            showError('Parcela não encontrada');
            throw new Error('Parcela não encontrada');
          }

          tabelaReal = tabelaNormal;
          parcelaData = parcelaNormal;
        }

        const novoValorVinculado = (parcelaData.valor_vinculado || 0) + valorAplicado;
        const valorParcela = parcelaData.valor;

        const updateData: any = {
          vinculada_extrato: true,
          valor_vinculado: novoValorVinculado,
        };

        // 3. Se valor_vinculado == valor_parcela, atualizar data_pagamento
        if (Math.abs(novoValorVinculado - valorParcela) < 0.01) {
          updateData.data_pagamento = new Date().toISOString();
          parcelasBaixadas.push(parcelaId);
        }

        const { error: updateError } = await supabase
          .from(tabelaReal as any)
          .update(updateData)
          .eq('id', parcelaId)
          .eq('empresa_id', empresaId);

        if (updateError) {
          console.error('Erro ao atualizar parcela:', updateError);
          showError('Erro ao atualizar parcela');
          throw new Error('Erro ao atualizar parcela');
        }
      }

      // 4. Se houver valorRestante, criar lançamento avulso
      if (valorRestante && valorRestante.valor > 0.01) {
        const { data: lancamento, error: lancamentoError } = await supabase
          .from('conciliacao_lancamentos_avulsos')
          .insert({
            extrato_id: transacaoId,
            valor: valorRestante.valor,
            conta_contabil_id: valorRestante.contaContabilId,
            descricao: valorRestante.descricao,
            empresa_id: empresaId,
            usuario_id: usuario.id,
          })
          .select('id')
          .single();

        if (lancamentoError) {
          console.error('Erro ao criar lançamento avulso:', lancamentoError);
          showError('Erro ao criar lançamento avulso');
          throw new Error('Erro ao criar lançamento avulso');
        }

        lancamentoAvulsoId = lancamento?.id;
      }

      // 5. Atualizar extrato: status_conciliacao e valor_conciliado
      const valorConciliado = mapeamentos.reduce((acc, m) => acc + m.valorAplicado, 0) + (valorRestante?.valor || 0);

      const { error: extratoError } = await supabase
        .from('extratos')
        .update({
          status_conciliacao: 'conciliado',
          valor_conciliado: valorConciliado,
        })
        .eq('id', transacaoId)
        .eq('empresa_id', empresaId);

      if (extratoError) {
        console.error('Erro ao atualizar extrato:', extratoError);
        showError('Erro ao atualizar status do extrato');
        throw new Error('Erro ao atualizar extrato');
      }

      showSuccess('Mapeamento executado com sucesso!');

      return {
        sucesso: true,
        transacaoConciliada: true,
        parcelasBaixadas,
        lancamentoAvulsoId,
        mensagem: `Mapeamento concluído. ${parcelasBaixadas.length} parcela(s) baixada(s).`,
      };
    } catch (error: any) {
      console.error('Erro ao executar mapeamento:', error);
      showError(error.message || 'Erro ao executar mapeamento');
      return {
        sucesso: false,
        transacaoConciliada: false,
        parcelasBaixadas: [],
        mensagem: error.message || 'Erro ao executar mapeamento',
      };
    } finally {
      setLoading(false);
    }
  }, [empresaId, usuario]);

  return {
    executarMapeamento,
    loading,
  };
}
