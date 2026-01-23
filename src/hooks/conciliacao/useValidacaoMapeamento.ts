import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError } from '@/utils/toast';
import type { MapeamentoRequest, ResultadoValidacao } from '@/types/conciliacao';

export function useValidacaoMapeamento() {
  const [loading, setLoading] = useState(false);
  const { empresaId } = useSessao();

  const validarMapeamento = useCallback(async (
    request: MapeamentoRequest
  ): Promise<ResultadoValidacao> => {
    setLoading(true);

    try {
      if (!empresaId) {
        return {
          valido: false,
          erros: ['Empresa não identificada'],
          avisos: [],
          valorRestante: 0,
          sugerirLancamentoAvulso: false,
        };
      }

      const erros: string[] = [];
      const avisos: string[] = [];

      const { tipo, valorTransacao, parcelasSelecionadas } = request;

      // Validação 1: Verificar compatibilidade de tipos
      for (const parcela of parcelasSelecionadas) {
        if (tipo === 'ENTRADA' && parcela.tipo !== 'CR') {
          erros.push(`Transações de ENTRADA só podem ser vinculadas a parcelas de Contas a Receber (CR)`);
        }
        if (tipo === 'SAIDA' && parcela.tipo !== 'CP') {
          erros.push(`Transações de SAÍDA só podem ser vinculadas a parcelas de Contas a Pagar (CP)`);
        }
      }

      // Validação 2: Verificar se soma dos valores não excede valorTransacao
      const somaValores = parcelasSelecionadas.reduce((acc, p) => acc + p.valorAplicar, 0);
      if (somaValores > Math.abs(valorTransacao)) {
        erros.push(`A soma dos valores aplicados (R$ ${somaValores.toFixed(2)}) excede o valor da transação (R$ ${Math.abs(valorTransacao).toFixed(2)})`);
      }

      // Validação 3: Verificar se parcelas estão em status adequado
      for (const parcela of parcelasSelecionadas) {
        const tabelaParcela = parcela.tipo === 'CR'
          ? 'admin_parcelas_contas_receber'
          : 'admin_parcelas_contas_pagar';

        const { data: parcelaData, error: parcelaError } = await supabase
          .from(tabelaParcela as any)
          .select('id, data_pagamento, vinculada_extrato, valor')
          .eq('id', parcela.parcelaId)
          .eq('empresa_id', empresaId)
          .single();

        if (parcelaError || !parcelaData) {
          // Tentar buscar na tabela normal
          const tabelaNormal = parcela.tipo === 'CR'
            ? 'parcelas_contas_receber'
            : 'parcelas_contas_pagar';

          const { data: parcelaNormal, error: errorNormal } = await supabase
            .from(tabelaNormal as any)
            .select('id, data_pagamento, vinculada_extrato, valor')
            .eq('id', parcela.parcelaId)
            .eq('empresa_id', empresaId)
            .single();

          if (errorNormal || !parcelaNormal) {
            erros.push(`Parcela ${parcela.parcelaId} não encontrada`);
            continue;
          } else {
            if (parcelaNormal.data_pagamento) {
              erros.push(`Parcela ${parcela.parcelaId} já está paga`);
            }
            if (parcelaNormal.vinculada_extrato) {
              avisos.push(`Parcela ${parcela.parcelaId} já está vinculada a outra transação`);
            }
            if (parcela.valorAplicar > parcelaNormal.valor) {
              erros.push(`Valor aplicado (R$ ${parcela.valorAplicar.toFixed(2)}) excede o valor da parcela ${parcela.parcelaId} (R$ ${parcelaNormal.valor.toFixed(2)})`);
            }
          }
        } else {
          if (parcelaData.data_pagamento) {
            erros.push(`Parcela ${parcela.parcelaId} já está paga`);
          }
          if (parcelaData.vinculada_extrato) {
            avisos.push(`Parcela ${parcela.parcelaId} já está vinculada a outra transação`);
          }
          if (parcela.valorAplicar > parcelaData.valor) {
            erros.push(`Valor aplicado (R$ ${parcela.valorAplicar.toFixed(2)}) excede o valor da parcela ${parcela.parcelaId} (R$ ${parcelaData.valor.toFixed(2)})`);
          }
        }
      }

      // Validação 4: Verificar se parcelas não estão já vinculadas
      for (const parcela of parcelasSelecionadas) {
        const { data: vinculos, error: vinculoError } = await supabase
          .from('extrato_parcela_vinculo')
          .select('id')
          .eq('parcela_id', parcela.parcelaId)
          .eq('empresa_id', empresaId);

        if (!vinculoError && vinculos && vinculos.length > 0) {
          avisos.push(`Parcela ${parcela.parcelaId} já possui vínculos em extrato_parcela_vinculo`);
        }
      }

      // Calcular valor restante
      const valorRestante = Math.abs(valorTransacao) - somaValores;
      const sugerirLancamentoAvulso = valorRestante > 0.01;

      if (valorRestante > 0.01) {
        avisos.push(`Valor restante de R$ ${valorRestante.toFixed(2)} poderá ser registrado como lançamento avulso`);
      }

      return {
        valido: erros.length === 0,
        erros,
        avisos,
        valorRestante,
        sugerirLancamentoAvulso,
      };
    } catch (error) {
      console.error('Erro ao validar mapeamento:', error);
      showError('Erro ao validar mapeamento');
      return {
        valido: false,
        erros: ['Erro ao validar mapeamento'],
        avisos: [],
        valorRestante: 0,
        sugerirLancamentoAvulso: false,
      };
    } finally {
      setLoading(false);
    }
  }, [empresaId]);

  return {
    validarMapeamento,
    loading,
  };
}
