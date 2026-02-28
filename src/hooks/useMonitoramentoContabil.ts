import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';

export interface ExtratoResumido {
  id: string;
  data: string;
  descricao: string;
  valor: number;
  tipo: string;
  status_conciliacao: string;
  valor_conciliado: number;
}

export interface VinculoParcela {
  parcela_id: string;
  tipo_parcela: 'CR' | 'CP';
  valor_aplicado: number;
  transacao_extrato_id: string;
}

export interface ParcelaMonitorada {
  parcela_id: string;
  tipo_parcela: 'CR' | 'CP';
  valor: number;
  status: string;
  data_vencimento: string;
  // origem do vínculo
  origem: 'extrato_vinculo' | 'lancamento_contabil';
  // se veio de lançamento: id do lançamento e data
  lancamento_id?: string;
  lancamento_descricao?: string;
  data_lancamento?: string;
  // se tem extrato vinculado
  extrato_id?: string;
  // consolidação (dados reais da tabela de parcelas)
  consolidada?: boolean;
  mapeado_extrato_id?: string | null;
  valor_vinculado?: number;
  status_parcela?: string;
}

export interface LancamentoResumido {
  id: string;
  data_movimentacao: string;
  descricao: string;
  valor: number;
  tipo: string;
  conta_contabil_id: string | null;
  origem: string | null;
}

export interface MonitoramentoContabil {
  totalExtratos: number;
  totalExtratosVinculados: number;
  totalExtratosSemVinculo: number;
  extratosSemVinculo: ExtratoResumido[];
  extratosVinculados: ExtratoResumido[];
  parcelasVinculadas: VinculoParcela[];
  parcelasMonitoradas: ParcelaMonitorada[];
  parcelasSemVinculo: ParcelaMonitorada[];
  lancamentos: LancamentoResumido[];
  lancamentosSemVinculo: LancamentoResumido[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useMonitoramentoContabil(contaId: string | null): MonitoramentoContabil {
  const { empresaId } = useSessao();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [totalExtratos, setTotalExtratos] = useState(0);
  const [totalExtratosVinculados, setTotalExtratosVinculados] = useState(0);
  const [totalExtratosSemVinculo, setTotalExtratosSemVinculo] = useState(0);
  const [extratosSemVinculo, setExtratosSemVinculo] = useState<ExtratoResumido[]>([]);
  const [extratosVinculados, setExtratosVinculados] = useState<ExtratoResumido[]>([]);
  const [parcelasVinculadas, setParcelasVinculadas] = useState<VinculoParcela[]>([]);
  const [parcelasMonitoradas, setParcelasMonitoradas] = useState<ParcelaMonitorada[]>([]);
  const [parcelasSemVinculo, setParcelasSemVinculo] = useState<ParcelaMonitorada[]>([]);
  const [lancamentos, setLancamentos] = useState<LancamentoResumido[]>([]);
  const [lancamentosSemVinculo, setLancamentosSemVinculo] = useState<LancamentoResumido[]>([]);

  const fetchMonitoramento = useCallback(async () => {
    if (!contaId || !empresaId) return;

    setLoading(true);
    setError(null);

    try {
      // 1. Buscar todos extratos da conta
      const { data: extratos, error: erroExtratos } = await supabase
        .from('extratos')
        .select('id, data, descricao, valor, tipo, status_conciliacao, valor_conciliado')
        .eq('id_saldo_contas', contaId)
        .eq('empresa_id', empresaId)
        .order('data', { ascending: false });

      if (erroExtratos) throw new Error(erroExtratos.message);

      const todosExtratos: ExtratoResumido[] = (extratos || []).map((e: any) => ({
        id: e.id,
        data: e.data,
        descricao: e.descricao || '',
        valor: parseFloat(e.valor) || 0,
        tipo: e.tipo,
        status_conciliacao: e.status_conciliacao || 'PENDENTE',
        valor_conciliado: parseFloat(e.valor_conciliado) || 0,
      }));

      const idsExtratos = todosExtratos.map(e => e.id);

      // 2. Buscar vínculos em extrato_parcela_vinculo para esses extratos
      let vinculos: any[] = [];
      if (idsExtratos.length > 0) {
        const { data: vinculosData, error: erroVinculos } = await supabase
          .from('extrato_parcela_vinculo')
          .select('id, transacao_extrato_id, parcela_id, tipo_parcela, valor_aplicado')
          .in('transacao_extrato_id', idsExtratos)
          .eq('empresa_id', empresaId);

        if (erroVinculos) throw new Error(erroVinculos.message);
        vinculos = vinculosData || [];
      }

      const idsExtratosVinculados = new Set(vinculos.map((v: any) => v.transacao_extrato_id));
      const semVinculo = todosExtratos.filter(e => !idsExtratosVinculados.has(e.id));
      const comVinculo = todosExtratos.filter(e => idsExtratosVinculados.has(e.id));

      const parcelasVinc: VinculoParcela[] = vinculos.map((v: any) => ({
        parcela_id: v.parcela_id,
        tipo_parcela: v.tipo_parcela as 'CR' | 'CP',
        valor_aplicado: parseFloat(v.valor_aplicado) || 0,
        transacao_extrato_id: v.transacao_extrato_id,
      }));

      // 3. Buscar lançamentos contábeis da conta (fonte principal de parcelas)
      const { data: lancamentosData, error: erroLancamentos } = await supabase
        .from('lancamentos')
        .select('id, data_movimentacao, descricao, valor, tipo, conta_contabil_id, origem')
        .eq('conta_bancaria_id', contaId)
        .order('data_movimentacao', { ascending: false });

      if (erroLancamentos) throw new Error(erroLancamentos.message);

      const todosLancamentos: LancamentoResumido[] = (lancamentosData || []).map((l: any) => ({
        id: l.id,
        data_movimentacao: l.data_movimentacao,
        descricao: l.descricao || '',
        valor: parseFloat(l.valor) || 0,
        tipo: l.tipo,
        conta_contabil_id: l.conta_contabil_id || null,
        origem: l.origem || null,
      }));

      // 4. Extrair parcelas dos lançamentos contábeis via descrição
      //    "Recebimento Parcela XXXXXXXX" / "Pagamento Parcela XXXXXXXX"
      //    Cada lançamento na conta_bancaria representa 1 parcela paga/recebida
      const parcelasDoLancamento: ParcelaMonitorada[] = [];
      const idsParcelasJaVinculadas = new Set(parcelasVinc.map(p => p.parcela_id));

      for (const lanc of todosLancamentos) {
        const origem = lanc.origem || '';
        // Ignorar apenas estornos reais (origem começa com "estorno_")
        if (origem.toLowerCase().startsWith('estorno_')) continue;
        // Ignorar lançamentos cuja descricao começa com "ESTORNO:"
        if (lanc.descricao.toUpperCase().startsWith('ESTORNO:')) continue;

        // Fonte 1: origem no formato "pagamento_cp:UUID" ou "recebimento_cr:UUID" — vínculo forte por ID
        const matchOrigem = origem.match(/^(pagamento_cp|recebimento_cr|recebimento_manual_cr|pagamento_manual_cp):([a-f0-9-]{36})/i);
        if (matchOrigem) {
          const parcelaUUID = matchOrigem[2];
          const tipoParcela: 'CR' | 'CP' = matchOrigem[1].toLowerCase().includes('recebimento') ? 'CR' : 'CP';
          parcelasDoLancamento.push({
            parcela_id: parcelaUUID,
            tipo_parcela: tipoParcela,
            valor: lanc.valor,
            status: 'paga',
            data_vencimento: lanc.data_movimentacao,
            origem: 'lancamento_contabil',
            lancamento_id: lanc.id,
            lancamento_descricao: lanc.descricao,
            data_lancamento: lanc.data_movimentacao,
          });
          continue;
        }

        // Fonte 2: descrição "Pagamento Parcela XXXXXXXX" / "Recebimento Parcela XXXXXXXX"
        const matchDesc = lanc.descricao.match(/[Pp]arcela\s+([a-f0-9]{8,36})/);
        if (!matchDesc) continue;

        const parcelaIdCurto = matchDesc[1];
        const tipoParcela: 'CR' | 'CP' =
          origem.includes('recebimento') || lanc.descricao.toLowerCase().includes('recebimento') ? 'CR' : 'CP';

        parcelasDoLancamento.push({
          parcela_id: parcelaIdCurto,
          tipo_parcela: tipoParcela,
          valor: lanc.valor,
          status: 'paga',
          data_vencimento: lanc.data_movimentacao,
          origem: 'lancamento_contabil',
          lancamento_id: lanc.id,
          lancamento_descricao: lanc.descricao,
          data_lancamento: lanc.data_movimentacao,
        });
      }

      // 5. Parcelas via extrato_parcela_vinculo (vínculo formal)
      const parcelasDoExtrato: ParcelaMonitorada[] = parcelasVinc.map(p => ({
        parcela_id: p.parcela_id,
        tipo_parcela: p.tipo_parcela,
        valor: p.valor_aplicado,
        status: 'vinculada',
        data_vencimento: '',
        origem: 'extrato_vinculo' as const,
        extrato_id: p.transacao_extrato_id,
      }));

      // União: parcelas do extrato + parcelas do lançamento (sem duplicar)
      const todasParcelasMonitoradas: ParcelaMonitorada[] = [
        ...parcelasDoExtrato,
        ...parcelasDoLancamento.filter(p =>
          !parcelasDoExtrato.some(pe => pe.parcela_id === p.parcela_id)
        ),
      ];

      // 5b. Buscar dados reais de consolidação nas tabelas de parcelas CR e CP
      const idsCR = todasParcelasMonitoradas.filter(p => p.tipo_parcela === 'CR').map(p => p.parcela_id);
      const idsCP = todasParcelasMonitoradas.filter(p => p.tipo_parcela === 'CP').map(p => p.parcela_id);

      const consolidacaoMap: Record<string, { consolidada: boolean; mapeado_extrato_id: string | null; valor_vinculado: number; status_parcela: string }> = {};

      if (idsCR.length > 0) {
        const { data: parcelasCR } = await supabase
          .from('admin_parcelas_contas_receber')
          .select('id, vinculada_extrato, mapeado_extrato_id, valor_vinculado, status')
          .in('id', idsCR);
        (parcelasCR || []).forEach((p: any) => {
          consolidacaoMap[p.id] = {
            consolidada: !!p.vinculada_extrato,
            mapeado_extrato_id: p.mapeado_extrato_id || null,
            valor_vinculado: parseFloat(p.valor_vinculado) || 0,
            status_parcela: p.status || '',
          };
        });
      }

      if (idsCP.length > 0) {
        const { data: parcelasCP } = await supabase
          .from('admin_parcelas_contas_pagar')
          .select('id, vinculada_extrato, mapeado_extrato_id, valor_vinculado, status')
          .in('id', idsCP);
        (parcelasCP || []).forEach((p: any) => {
          consolidacaoMap[p.id] = {
            consolidada: !!p.vinculada_extrato,
            mapeado_extrato_id: p.mapeado_extrato_id || null,
            valor_vinculado: parseFloat(p.valor_vinculado) || 0,
            status_parcela: p.status || '',
          };
        });
      }

      // Enriquecer parcelas monitoradas com dados de consolidação
      const parcelasEnriquecidas = todasParcelasMonitoradas.map(p => {
        const c = consolidacaoMap[p.parcela_id];
        return c ? { ...p, ...c } : p;
      });

      // "Sem vínculo" = parcelas que vieram APENAS do lançamento (não têm extrato_parcela_vinculo)
      const parcelasApenasPorLancamento = parcelasDoLancamento.filter(
        p => !idsParcelasJaVinculadas.has(p.parcela_id)
      );

      // 6. Lançamentos sem extrato conciliado correspondente
      const lancSemVinculo = todosLancamentos.filter(l => {
        const origem = l.origem || '';
        if (origem.toLowerCase().includes('estorn')) return false;
        const extratoCorrespondente = comVinculo.find(e =>
          Math.abs(e.valor - l.valor) < 0.01 &&
          ((l.tipo === 'Entrada' && e.tipo === 'Entrada') || (l.tipo === 'Saida' && e.tipo === 'Saida'))
        );
        return !extratoCorrespondente;
      });

      setTotalExtratos(todosExtratos.length);
      setTotalExtratosVinculados(comVinculo.length);
      setTotalExtratosSemVinculo(semVinculo.length);
      setExtratosSemVinculo(semVinculo);
      setExtratosVinculados(comVinculo);
      setParcelasVinculadas(parcelasVinc);
      setParcelasMonitoradas(parcelasEnriquecidas);
      setParcelasSemVinculo(parcelasApenasPorLancamento);
      setLancamentos(todosLancamentos);
      setLancamentosSemVinculo(lancSemVinculo);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar monitoramento');
    } finally {
      setLoading(false);
    }
  }, [contaId, empresaId]);

  useEffect(() => {
    if (contaId) {
      fetchMonitoramento();
    }
  }, [contaId, fetchMonitoramento]);

  return {
    totalExtratos,
    totalExtratosVinculados,
    totalExtratosSemVinculo,
    extratosSemVinculo,
    extratosVinculados,
    parcelasVinculadas,
    parcelasMonitoradas,
    parcelasSemVinculo,
    lancamentos,
    lancamentosSemVinculo,
    loading,
    error,
    refetch: fetchMonitoramento,
  };
}
