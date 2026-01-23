import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError } from '@/utils/toast';
import { calcularSimilaridadeAvancada, normalizarNome } from '@/utils/string-similarity';
import { differenceInDays } from 'date-fns';
import type { ParcelaMatching, ResultadoMatching } from '@/types/conciliacao';

interface BuscarParcelasParams {
  transacaoId: string;
  tipo: 'ENTRADA' | 'SAIDA';
  valor: number;
  data: string;
  identificacao?: string | null;
}

interface ParcelaRaw {
  id: string;
  numero_parcela: number;
  valor: number;
  data_vencimento: string;
  data_pagamento: string | null;
  vinculada_extrato: boolean;
  descricao: string;
  admin_contas_receber?: {
    cliente: {
      nome: string;
    } | null;
  } | null;
  contas_receber?: {
    cliente: {
      nome: string;
    } | null;
  } | null;
  admin_contas_pagar?: {
    fornecedor: {
      razao_social: string;
    } | null;
  } | null;
  contas_pagar?: {
    fornecedor: {
      razao_social: string;
    } | null;
  } | null;
}

export function useMatchingParcelas() {
  const [loading, setLoading] = useState(false);
  const { empresaId } = useSessao();

  const calcularScore = useCallback((
    valorParcela: number,
    valorTransacao: number,
    dataParcela: string,
    dataTransacao: string,
    nomeParcela: string,
    identificacaoTransacao: string | null
  ): { score: number; tipoMatch: ParcelaMatching['tipoMatch'] } => {
    let score = 0;
    let tipoMatch: ParcelaMatching['tipoMatch'] = 'APROXIMADO';

    const valorExato = Math.abs(valorParcela - valorTransacao) < 0.01;
    const diferencaDias = Math.abs(differenceInDays(new Date(dataParcela), new Date(dataTransacao)));
    const mesmaData = diferencaDias === 0;

    let similaridadeNome = 0;
    if (identificacaoTransacao && nomeParcela) {
      const nomeNormalizado = normalizarNome(nomeParcela);
      const identificacaoNormalizada = normalizarNome(identificacaoTransacao);
      similaridadeNome = calcularSimilaridadeAvancada(nomeNormalizado, identificacaoNormalizada);
    }

    if (valorExato) score += 50;
    if (mesmaData) score += 30;
    if (similaridadeNome >= 80) score += 20;

    if (valorExato && mesmaData) {
      tipoMatch = 'VALOR_EXATO_DATA_EXATA';
    } else if (valorExato) {
      tipoMatch = 'VALOR_EXATO';
    } else if (mesmaData) {
      tipoMatch = 'DATA_EXATA';
    }

    return { score, tipoMatch };
  }, []);

  const buscarParcelasComMatching = useCallback(async (
    params: BuscarParcelasParams
  ): Promise<ResultadoMatching> => {
    setLoading(true);

    try {
      if (!empresaId) {
        showError('Empresa não identificada');
        return {
          contasReceber: [],
          contasPagar: [],
          sugestoes: {
            matchExato: false,
            multiplasParcelasDetectadas: false,
          },
        };
      }

      const { tipo, valor, data, identificacao } = params;
      const valorAbs = Math.abs(valor);

      let contasReceber: ParcelaMatching[] = [];
      let contasPagar: ParcelaMatching[] = [];

      if (tipo === 'ENTRADA') {
        // Buscar parcelas em contas a receber (admin + normal)
        const { data: parcelasAdmin, error: errorAdmin } = await supabase
          .from('admin_parcelas_contas_receber')
          .select(`
            id,
            numero_parcela,
            valor,
            data_vencimento,
            data_pagamento,
            vinculada_extrato,
            descricao,
            admin_contas_receber (
              cliente (
                nome
              )
            )
          `)
          .eq('empresa_id', empresaId)
          .is('data_pagamento', null)
          .eq('vinculada_extrato', false)
          .gte('valor', valorAbs * 0.95)
          .lte('valor', valorAbs * 1.05);

        if (errorAdmin) {
          console.error('Erro ao buscar parcelas admin CR:', errorAdmin);
        }

        const { data: parcelasNormal, error: errorNormal } = await supabase
          .from('parcelas_contas_receber')
          .select(`
            id,
            numero_parcela,
            valor,
            data_vencimento,
            data_pagamento,
            vinculada_extrato,
            descricao,
            contas_receber (
              cliente (
                nome
              )
            )
          `)
          .eq('empresa_id', empresaId)
          .is('data_pagamento', null)
          .eq('vinculada_extrato', false)
          .gte('valor', valorAbs * 0.95)
          .lte('valor', valorAbs * 1.05);

        if (errorNormal) {
          console.error('Erro ao buscar parcelas normais CR:', errorNormal);
        }

        const todasParcelas = [
          ...(parcelasAdmin || []) as ParcelaRaw[],
          ...(parcelasNormal || []) as ParcelaRaw[],
        ];

        contasReceber = todasParcelas.map((p) => {
          const clienteNome = p.admin_contas_receber?.cliente?.nome || p.contas_receber?.cliente?.nome || 'Desconhecido';
          const { score, tipoMatch } = calcularScore(
            p.valor,
            valorAbs,
            p.data_vencimento,
            data,
            clienteNome,
            identificacao || null
          );

          return {
            parcelaId: p.id,
            clienteNome,
            valor: p.valor,
            dataVencimento: p.data_vencimento,
            status: p.data_pagamento ? 'PAGO' : 'PENDENTE',
            matchScore: score,
            tipoMatch,
            tipo: 'CR' as const,
            numeroParcela: p.numero_parcela,
            descricao: p.descricao || '',
          };
        });
      } else {
        // Buscar parcelas em contas a pagar (admin + normal)
        const { data: parcelasAdmin, error: errorAdmin } = await supabase
          .from('admin_parcelas_contas_pagar')
          .select(`
            id,
            numero_parcela,
            valor,
            data_vencimento,
            data_pagamento,
            vinculada_extrato,
            descricao,
            admin_contas_pagar (
              fornecedor (
                razao_social
              )
            )
          `)
          .eq('empresa_id', empresaId)
          .is('data_pagamento', null)
          .eq('vinculada_extrato', false)
          .gte('valor', valorAbs * 0.95)
          .lte('valor', valorAbs * 1.05);

        if (errorAdmin) {
          console.error('Erro ao buscar parcelas admin CP:', errorAdmin);
        }

        const { data: parcelasNormal, error: errorNormal } = await supabase
          .from('parcelas_contas_pagar')
          .select(`
            id,
            numero_parcela,
            valor,
            data_vencimento,
            data_pagamento,
            vinculada_extrato,
            descricao,
            contas_pagar (
              fornecedor (
                razao_social
              )
            )
          `)
          .eq('empresa_id', empresaId)
          .is('data_pagamento', null)
          .eq('vinculada_extrato', false)
          .gte('valor', valorAbs * 0.95)
          .lte('valor', valorAbs * 1.05);

        if (errorNormal) {
          console.error('Erro ao buscar parcelas normais CP:', errorNormal);
        }

        const todasParcelas = [
          ...(parcelasAdmin || []) as ParcelaRaw[],
          ...(parcelasNormal || []) as ParcelaRaw[],
        ];

        contasPagar = todasParcelas.map((p) => {
          const fornecedorNome = p.admin_contas_pagar?.fornecedor?.razao_social || p.contas_pagar?.fornecedor?.razao_social || 'Desconhecido';
          const { score, tipoMatch } = calcularScore(
            p.valor,
            valorAbs,
            p.data_vencimento,
            data,
            fornecedorNome,
            identificacao || null
          );

          return {
            parcelaId: p.id,
            clienteNome: fornecedorNome,
            valor: p.valor,
            dataVencimento: p.data_vencimento,
            status: p.data_pagamento ? 'PAGO' : 'PENDENTE',
            matchScore: score,
            tipoMatch,
            tipo: 'CP' as const,
            numeroParcela: p.numero_parcela,
            descricao: p.descricao || '',
          };
        });
      }

      // Ordenar por score e limitar
      contasReceber.sort((a, b) => b.matchScore - a.matchScore);
      contasPagar.sort((a, b) => b.matchScore - a.matchScore);

      const top20CR = contasReceber.slice(0, 20);
      const top20CP = contasPagar.slice(0, 20);

      const matchExato = [...top20CR, ...top20CP].some(p => p.tipoMatch === 'VALOR_EXATO_DATA_EXATA');
      const multiplasParcelasDetectadas = [...top20CR, ...top20CP].filter(p => p.matchScore >= 80).length > 1;

      return {
        contasReceber: top20CR,
        contasPagar: top20CP,
        sugestoes: {
          matchExato,
          multiplasParcelasDetectadas,
        },
      };
    } catch (error) {
      console.error('Erro ao buscar parcelas com matching:', error);
      showError('Erro ao buscar parcelas');
      return {
        contasReceber: [],
        contasPagar: [],
        sugestoes: {
          matchExato: false,
          multiplasParcelasDetectadas: false,
        },
      };
    } finally {
      setLoading(false);
    }
  }, [empresaId, calcularScore]);

  return {
    buscarParcelasComMatching,
    loading,
  };
}
