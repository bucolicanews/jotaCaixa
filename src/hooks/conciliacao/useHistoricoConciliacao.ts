import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError } from '@/utils/toast';

interface ParcelaVinculada {
  id: string;
  parcelaId: string;
  tipo: 'CR' | 'CP';
  valorVinculado: number;
  clienteNome: string;
  numeroParcela: number;
  valorParcela: number;
  dataVencimento: string;
  descricao: string;
}

interface LancamentoAvulso {
  id: string;
  valor: number;
  descricao: string;
  contaContabilId: string;
  contaContabilNome: string;
  criadoEm: string;
}

interface HistoricoConciliacao {
  extrato: {
    id: string;
    data: string;
    descricao: string;
    valor: number;
    tipo: 'ENTRADA' | 'SAIDA';
    statusConciliacao: string;
    valorConciliado: number;
    identificacao: string | null;
  } | null;
  vinculos: ParcelaVinculada[];
  lancamentosAvulsos: LancamentoAvulso[];
}

export function useHistoricoConciliacao() {
  const [loading, setLoading] = useState(false);
  const { empresaId } = useSessao();

  const buscarHistorico = useCallback(async (
    transacaoId: string
  ): Promise<HistoricoConciliacao | null> => {
    setLoading(true);

    try {
      if (!empresaId) {
        showError('Empresa não identificada');
        return null;
      }

      // 1. Buscar extrato
      const { data: extrato, error: extratoError } = await supabase
        .from('extratos')
        .select('*')
        .eq('id', transacaoId)
        .eq('empresa_id', empresaId)
        .single();

      if (extratoError) {
        console.error('Erro ao buscar extrato:', extratoError);
        showError('Erro ao buscar extrato');
        return null;
      }

      // 2. Buscar vínculos com parcelas
      const { data: vinculos, error: vinculosError } = await supabase
        .from('extrato_parcela_vinculo')
        .select('*')
        .eq('extrato_id', transacaoId)
        .eq('empresa_id', empresaId);

      if (vinculosError) {
        console.error('Erro ao buscar vínculos:', vinculosError);
      }

      const parcelasVinculadas: ParcelaVinculada[] = [];

      if (vinculos && vinculos.length > 0) {
        for (const vinculo of vinculos) {
          const tipo = vinculo.tipo_parcela as 'CR' | 'CP';
          const tabelaParcela = tipo === 'CR'
            ? 'admin_parcelas_contas_receber'
            : 'admin_parcelas_contas_pagar';

          const { data: parcela, error: parcelaError } = await supabase
            .from(tabelaParcela as any)
            .select(`
              id,
              numero_parcela,
              valor,
              data_vencimento,
              descricao,
              ${tipo === 'CR' ? 'admin_contas_receber ( cliente ( nome ) )' : 'admin_contas_pagar ( fornecedor ( razao_social ) )'}
            `)
            .eq('id', vinculo.parcela_id)
            .eq('empresa_id', empresaId)
            .single();

          let parcelaData = parcela;

          if (parcelaError || !parcela) {
            // Tentar na tabela normal
            const tabelaNormal = tipo === 'CR'
              ? 'parcelas_contas_receber'
              : 'parcelas_contas_pagar';

            const { data: parcelaNormal, error: errorNormal } = await supabase
              .from(tabelaNormal as any)
              .select(`
                id,
                numero_parcela,
                valor,
                data_vencimento,
                descricao,
                ${tipo === 'CR' ? 'contas_receber ( cliente ( nome ) )' : 'contas_pagar ( fornecedor ( razao_social ) )'}
              `)
              .eq('id', vinculo.parcela_id)
              .eq('empresa_id', empresaId)
              .single();

            if (errorNormal || !parcelaNormal) {
              console.error('Parcela não encontrada:', vinculo.parcela_id);
              continue;
            }

            parcelaData = parcelaNormal;
          }

          if (parcelaData) {
            let clienteNome = 'Desconhecido';
            if (tipo === 'CR') {
              clienteNome = (parcelaData as any).admin_contas_receber?.cliente?.nome || (parcelaData as any).contas_receber?.cliente?.nome || 'Desconhecido';
            } else {
              clienteNome = (parcelaData as any).admin_contas_pagar?.fornecedor?.razao_social || (parcelaData as any).contas_pagar?.fornecedor?.razao_social || 'Desconhecido';
            }

            parcelasVinculadas.push({
              id: vinculo.id,
              parcelaId: vinculo.parcela_id,
              tipo,
              valorVinculado: vinculo.valor_vinculado,
              clienteNome,
              numeroParcela: parcelaData.numero_parcela,
              valorParcela: parcelaData.valor,
              dataVencimento: parcelaData.data_vencimento,
              descricao: parcelaData.descricao || '',
            });
          }
        }
      }

      // 3. Buscar lançamentos avulsos
      const { data: lancamentos, error: lancamentosError } = await supabase
        .from('conciliacao_lancamentos_avulsos')
        .select(`
          id,
          valor,
          descricao,
          conta_contabil_id,
          criado_em,
          plano_de_contas ( nome )
        `)
        .eq('extrato_id', transacaoId)
        .eq('empresa_id', empresaId);

      if (lancamentosError) {
        console.error('Erro ao buscar lançamentos avulsos:', lancamentosError);
      }

      const lancamentosAvulsos: LancamentoAvulso[] = (lancamentos || []).map((l: any) => ({
        id: l.id,
        valor: l.valor,
        descricao: l.descricao,
        contaContabilId: l.conta_contabil_id,
        contaContabilNome: l.plano_de_contas?.nome || 'Desconhecida',
        criadoEm: l.criado_em,
      }));

      return {
        extrato: extrato
          ? {
              id: extrato.id,
              data: extrato.data,
              descricao: extrato.descricao,
              valor: extrato.valor,
              tipo: extrato.tipo as 'ENTRADA' | 'SAIDA',
              statusConciliacao: extrato.status_conciliacao,
              valorConciliado: extrato.valor_conciliado,
              identificacao: extrato.identificacao,
            }
          : null,
        vinculos: parcelasVinculadas,
        lancamentosAvulsos,
      };
    } catch (error) {
      console.error('Erro ao buscar histórico de conciliação:', error);
      showError('Erro ao buscar histórico');
      return null;
    } finally {
      setLoading(false);
    }
  }, [empresaId]);

  return {
    buscarHistorico,
    loading,
  };
}
