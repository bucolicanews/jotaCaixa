import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { DollarSign, BookOpen, Edit, Undo2, Loader2, Receipt } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ExtendedParcelaPagar } from '@/types/contas-pagar';
import { PagBankTransferStatus } from '@/components/contas-pagar/PagBankTransferStatus';
import { supabase } from '@/integrations/supabase/client';
import LancamentoContabilDialog from '@/components/contabilidade/LancamentoContabilDialog';
import DetalhesPagementoParcelaDialog from '@/components/contas-pagar/DetalhesPagementoParcelaDialog';
import { useOwner } from '@/hooks/use-owner';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';

type ContaStatus = 'pendente' | 'pago' | 'atrasado' | 'cancelada' | 'aberta' | 'parcial' | 'reprogramada';

interface LancamentoResumo {
  tipo: string;
  conta_contabil_id: string;
  conta_codigo: string;
  conta_descricao: string;
  origem: string;
}

interface PagamentoInfo {
  conta_patrimonial_id: string;
  conta_patrimonial_codigo: string;
  conta_patrimonial_descricao: string;
  conta_fonte_contabil_id: string;
  historico_descricao: string;
  fontes: { nome: string; conta_codigo: string; valor: number }[];
}

interface ParcelasTabProps {
    loading: boolean;
    parcelas: ExtendedParcelaPagar[];
    totalParcelas: number;
    handleOpenPagamento: (parcela: ExtendedParcelaPagar, fornecedor: string) => void;
    formatarData: (date: string) => string;
    formatCurrency: (value: number) => string;
    formatarOrigem: (origem: string) => string;
    getBadgeVariant: (status: ContaStatus, dataVencimento: string) => 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning';
    onRealizarPagamentoPagBank?: (parcela: ExtendedParcelaPagar) => void;
    proprietarioId?: string;
    onDataChange?: () => void;
}

const ParcelasTab: React.FC<ParcelasTabProps> = ({
    loading,
    parcelas,
    totalParcelas,
    handleOpenPagamento,
    formatarData,
    formatCurrency,
    formatarOrigem,
    getBadgeVariant,
    onRealizarPagamentoPagBank,
    proprietarioId,
    onDataChange,
}) => {
    const { ownerId } = useOwner();
    const { role, perfil } = useSessao();

    const isDirectAdmin = role === 'Admin';
    const adminIdFromProfile = (perfil as any)?.admin_id ?? null;
    const isAdminOrEmployee = isDirectAdmin || (role === 'Usuario' && !!adminIdFromProfile);

    const tabelaParcelas = isAdminOrEmployee ? 'admin_parcelas_pagar' : 'parcelas_contas_pagar';
    const tabelaPagamentos = isAdminOrEmployee ? 'admin_pagamentos' : 'pagamentos';
    const tabelaContasPagar = isAdminOrEmployee ? 'admin_contas_pagar' : 'contas_pagar';

    const [parcelasComLancamento, setParcelasComLancamento] = useState<Set<string>>(new Set());
    const [lancamentosPorParcela, setLancamentosPorParcela] = useState<Record<string, LancamentoResumo[]>>({});
    const [lancamentoDialog, setLancamentoDialog] = useState<{ open: boolean; parcela: ExtendedParcelaPagar | null }>({ open: false, parcela: null });
    const [parcelaEstornando, setParcelaEstornando] = useState<string | null>(null);
    const [pagamentosInfo, setPagamentosInfo] = useState<Record<string, PagamentoInfo>>({});
    const [detalhesDialog, setDetalhesDialog] = useState<{ open: boolean; parcela: ExtendedParcelaPagar | null }>({ open: false, parcela: null });

    const carregarLancamentos = useCallback(async () => {
        if (!proprietarioId || parcelas.length === 0) return;
        const ids = parcelas.map(p => p.id);

        const { data: lancamentosData } = await supabase
            .from('lancamentos')
            .select('documento, tipo, conta_contabil_id, origem')
            .eq('proprietario_id', proprietarioId)
            .in('documento', ids)
            .not('origem', 'ilike', '%estornada%');

        if (!lancamentosData || lancamentosData.length === 0) return;

        const contaIds = [...new Set(lancamentosData.map(l => l.conta_contabil_id).filter(Boolean))];
        const { data: contasData } = await supabase
            .from('plano_contas')
            .select('id, "Conta", "Descricao"')
            .in('id', contaIds);

        const contasMap: Record<string, { Conta: string; Descricao: string }> = {};
        (contasData || []).forEach((c: any) => { contasMap[c.id] = c; });

        const comLancamento = new Set<string>();
        const porParcela: Record<string, LancamentoResumo[]> = {};
        lancamentosData.forEach((l: any) => {
            if (!l.documento) return;
            comLancamento.add(l.documento);
            if (!porParcela[l.documento]) porParcela[l.documento] = [];
            const conta = contasMap[l.conta_contabil_id];
            porParcela[l.documento].push({
                tipo: l.tipo,
                conta_contabil_id: l.conta_contabil_id,
                conta_codigo: conta?.Conta || '',
                conta_descricao: conta?.Descricao || '',
                origem: l.origem || '',
            });
        });
        setParcelasComLancamento(comLancamento);
        setLancamentosPorParcela(porParcela);
    }, [parcelas, proprietarioId]);

    useEffect(() => {
        carregarLancamentos();
    }, [carregarLancamentos]);

    const carregarPagamentosInfo = useCallback(async () => {
        if (!proprietarioId || parcelas.length === 0) return;
        const ids = parcelas.map(p => p.id);

        const { data: pagamentosData } = await supabase
            .from(tabelaPagamentos)
            .select('parcela_id, valor_pago, conta_id, historico_id, saldo_contas(nome, conta_contabil_id)')
            .in('parcela_id', ids);

        const patrimonialIds = [...new Set(
            parcelas
                .map(p => (p.admin_contas_pagar as any)?.id_conta_patrimonial)
                .filter(Boolean)
        )];

        const contaIdsFromFontes = pagamentosData ? [...new Set(
            pagamentosData.map((pg: any) => pg.saldo_contas?.conta_contabil_id).filter(Boolean)
        )] : [];

        const allContaIds = [...new Set([...patrimonialIds, ...contaIdsFromFontes])];

        const historicoIds = pagamentosData ? [...new Set(
            pagamentosData.map((pg: any) => pg.historico_id).filter(Boolean)
        )] : [];

        const [contasRes, historicosRes] = await Promise.all([
            allContaIds.length > 0
                ? supabase.from('plano_contas').select('id, "Conta", "Descricao"').in('id', allContaIds)
                : Promise.resolve({ data: [] }),
            historicoIds.length > 0
                ? supabase.from('historicos').select('id, descricao').in('id', historicoIds)
                : Promise.resolve({ data: [] }),
        ]);

        const contasMap: Record<string, { Conta: string; Descricao: string }> = {};
        ((contasRes as any).data || []).forEach((c: any) => { contasMap[c.id] = c; });

        const historicosMap: Record<string, string> = {};
        ((historicosRes as any).data || []).forEach((h: any) => { historicosMap[h.id] = h.descricao; });

        const porParcela: Record<string, PagamentoInfo> = {};

        parcelas.forEach(p => {
            const patrimonialId = (p.admin_contas_pagar as any)?.id_conta_patrimonial;
            const contaPatrimonial = patrimonialId ? contasMap[patrimonialId] : null;
            porParcela[p.id] = {
                conta_patrimonial_id: patrimonialId || '',
                conta_patrimonial_codigo: contaPatrimonial?.Conta || '',
                conta_patrimonial_descricao: contaPatrimonial?.Descricao || '',
                conta_fonte_contabil_id: '',
                historico_descricao: '',
                fontes: [],
            };
        });

        (pagamentosData || []).forEach((pg: any) => {
            const parcelaId = pg.parcela_id;
            if (!parcelaId || !porParcela[parcelaId]) return;

            const contaContabilId = pg.saldo_contas?.conta_contabil_id;
            const contaInfo = contaContabilId ? contasMap[contaContabilId] : null;
            const historicoDesc = pg.historico_id ? (historicosMap[pg.historico_id] || '') : '';
            const contaNome = pg.saldo_contas?.nome || '';
            const contaCodigo = contaInfo?.Conta || '';

            if (!porParcela[parcelaId].historico_descricao && historicoDesc) {
                porParcela[parcelaId].historico_descricao = historicoDesc;
            }

            if (!porParcela[parcelaId].conta_fonte_contabil_id && contaContabilId) {
                porParcela[parcelaId].conta_fonte_contabil_id = contaContabilId;
            }

            if (contaNome) {
                porParcela[parcelaId].fontes.push({
                    nome: contaNome,
                    conta_codigo: contaCodigo,
                    valor: pg.valor_pago,
                });
            }
        });

        setPagamentosInfo(porParcela);
    }, [parcelas, proprietarioId, tabelaPagamentos]);

    useEffect(() => {
        carregarPagamentosInfo();
    }, [carregarPagamentosInfo]);

    const handleUndoPayment = async (p: ExtendedParcelaPagar) => {
        if (!ownerId) return;
        const parcelaId = p.id;
        const contaDescricao = p.admin_contas_pagar?.descricao || 'Conta a Pagar';

        setParcelaEstornando(parcelaId);
        try {
            const { data: parcelaData, error: parcelaError } = await supabase
                .from(tabelaParcelas)
                .select('conta_pagar_id, valor_parcela, valor_pago, observacao')
                .eq('id', parcelaId)
                .single();

            if (parcelaError || !parcelaData) throw new Error('Parcela não encontrada.');

            const contaPagarId = parcelaData.conta_pagar_id;
            const isDiscountApplied = parcelaData.observacao?.includes('desconto');

            const { data: pagamentos, error: fetchPayError } = await supabase
                .from(tabelaPagamentos)
                .select('id, conta_id, valor_pago, historico_id, data_pagamento')
                .eq('parcela_id', parcelaId);

            if (fetchPayError) throw fetchPayError;

            if (!pagamentos || pagamentos.length === 0) {
                showError('Nenhum pagamento encontrado para estornar.');
                return;
            }

            const dataEstornoISO = new Date().toISOString();
            const lancamentosEstornoPayload: any[] = [];

            const origemPagamento = `pagamento_cp:${parcelaId}`;
            const origemDesconto = `desconto_cp:${parcelaId}`;

            let { data: originalLaunches, error: fetchLaunchError } = await supabase
                .from('lancamentos')
                .select('id, conta_resultado_id, conta_contabil_id, conta_bancaria_id, valor, tipo, descricao, historico_id, origem')
                .eq('proprietario_id', ownerId)
                .eq('documento', parcelaId)
                .not('origem', 'like', '%_estornada');

            if (fetchLaunchError) throw fetchLaunchError;

            if (!originalLaunches || originalLaunches.length === 0) {
                const { data: fallbackLaunches, error: fallbackError } = await supabase
                    .from('lancamentos')
                    .select('id, conta_resultado_id, conta_contabil_id, conta_bancaria_id, valor, tipo, descricao, historico_id, origem')
                    .eq('proprietario_id', ownerId)
                    .or(`origem.eq.${origemPagamento},origem.eq.${origemDesconto}`)
                    .not('origem', 'like', '%_estornada');
                if (fallbackError) throw fallbackError;
                originalLaunches = fallbackLaunches;
            }

            const originalLaunchIds = (originalLaunches || []).map(l => l.id);

            for (const orig of (originalLaunches || []).filter(l => l.origem?.startsWith('pagamento_cp') && !l.origem?.includes('_estornada'))) {
                const inverseId = crypto.randomUUID();
                const tipoInvertido = orig.tipo === 'Entrada' ? 'Saida' : 'Entrada';
                lancamentosEstornoPayload.push({
                    id: inverseId,
                    proprietario_id: ownerId,
                    data_movimentacao: dataEstornoISO,
                    descricao: `ESTORNO: ${orig.descricao}`,
                    valor: orig.valor,
                    tipo: tipoInvertido,
                    conta_bancaria_id: orig.conta_bancaria_id,
                    conta_contabil_id: orig.conta_contabil_id,
                    origem: 'estorno_pagamento_manual',
                    historico_id: orig.historico_id,
                    conta_resultado_id: orig.conta_resultado_id,
                });
            }

            if (isDiscountApplied) {
                const descontoLaunch = (originalLaunches || []).find(l => l.origem?.startsWith('desconto_cp') && !l.origem?.includes('_estornada'));
                if (descontoLaunch) {
                    const valorDesconto = descontoLaunch.valor;
                    const { data: configData } = await supabase
                        .from('configuracao_contas_pagar')
                        .select('tipo_registro, conta_contabil_id')
                        .eq('proprietario_id', ownerId)
                        .in('tipo_registro', ['estorno_desconto_obtido', 'a_pagar']);

                    const contaEstornoDescontoId = configData?.find(c => c.tipo_registro === 'estorno_desconto_obtido')?.conta_contabil_id;
                    const contaFornecedorId = configData?.find(c => c.tipo_registro === 'a_pagar')?.conta_contabil_id;

                    if (!contaEstornoDescontoId || !contaFornecedorId) {
                        throw new Error('Contas contábeis de estorno de desconto não configuradas.');
                    }

                    const idEstornoDespesa = crypto.randomUUID();
                    const idEstornoPassivo = crypto.randomUUID();

                    lancamentosEstornoPayload.push({
                        id: idEstornoDespesa,
                        proprietario_id: ownerId,
                        data_movimentacao: dataEstornoISO,
                        descricao: `ESTORNO DESCONTO OBTIDO: ${contaDescricao} (CP ID: ${contaPagarId.substring(0, 8)})`,
                        valor: valorDesconto,
                        tipo: 'Entrada' as const,
                        conta_bancaria_id: null,
                        conta_contabil_id: contaEstornoDescontoId,
                        origem: 'estorno_pagamento_manual',
                        historico_id: descontoLaunch.historico_id,
                        conta_resultado_id: idEstornoPassivo,
                    });

                    lancamentosEstornoPayload.push({
                        id: idEstornoPassivo,
                        proprietario_id: ownerId,
                        data_movimentacao: dataEstornoISO,
                        descricao: `REVERSÃO PASSIVO DESCONTO: ${contaDescricao} (CP ID: ${contaPagarId.substring(0, 8)})`,
                        valor: valorDesconto,
                        tipo: 'Saida' as const,
                        conta_bancaria_id: null,
                        conta_contabil_id: contaFornecedorId,
                        origem: 'estorno_pagamento_manual',
                        historico_id: descontoLaunch.historico_id,
                        conta_resultado_id: idEstornoDespesa,
                    });
                }
            }

            const { error: insErr } = await supabase.from('lancamentos').insert(lancamentosEstornoPayload);
            if (insErr) throw insErr;

            const { error: markError } = await supabase
                .from('lancamentos')
                .update({ origem: 'pagamento_manual_estornada' })
                .in('id', originalLaunchIds);
            if (markError) throw markError;

            const pagamentoIds = pagamentos.map(r => r.id);
            const { error: deletePagamentosError } = await supabase
                .from(tabelaPagamentos)
                .delete()
                .in('id', pagamentoIds);
            if (deletePagamentosError) throw deletePagamentosError;

            // Deletar extratos correspondentes se existirem (pagamentos via banco)
            for (const pag of pagamentos) {
                if (pag.conta_id && pag.data_pagamento) {
                    const dataFormatada = pag.data_pagamento.substring(0, 10);
                    const valorExtrato = -Math.abs(pag.valor_pago);
                    await supabase
                        .from('extratos')
                        .delete()
                        .eq('id_saldo_contas', pag.conta_id)
                        .eq('data', dataFormatada)
                        .eq('valor', valorExtrato)
                        .eq('conciliado', false);
                }
            }

            const { error: resetError } = await supabase
                .from(tabelaParcelas)
                .update({
                    status: 'aberta',
                    valor_pago: 0,
                    data_pagamento: null,
                    observacao: 'Estorno de pagamento realizado.',
                })
                .eq('id', parcelaId);
            if (resetError) throw resetError;

            const { error: updateContaError } = await supabase
                .from(tabelaContasPagar)
                .update({ status: 'pendente' })
                .eq('id', contaPagarId);
            if (updateContaError) console.error('Erro ao atualizar conta sintética para pendente:', updateContaError);

            showSuccess('Pagamento estornado com sucesso! Saldos reajustados.');
            carregarLancamentos();
            carregarPagamentosInfo();
            onDataChange?.();

        } catch (error: any) {
            console.error('Erro ao estornar pagamento:', error);
            showError('Falha ao estornar pagamento: ' + error.message);
        } finally {
            setParcelaEstornando(null);
        }
    };

    return (
        <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="border-l-4 border-secondary">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Total Parcelas</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold">{formatCurrency(totalParcelas)}</div></CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader><CardTitle>Parcelas a Pagar (Analítico)</CardTitle></CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="text-xs text-muted-foreground">ID Conta</TableHead>
                                    <TableHead className="text-xs text-muted-foreground">ID Parcela</TableHead>
                                    <TableHead>Vencimento</TableHead>
                                    <TableHead>Fornecedor</TableHead>
                                    <TableHead>Descrição</TableHead>
                                    <TableHead className="text-right">Valor Parcela</TableHead>
                                    <TableHead className="text-right">Valor Pago</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Data Pagamento</TableHead>
                                    <TableHead>Origem</TableHead>
                                    <TableHead>PagBank</TableHead>
                                    <TableHead>Conta Patrimonial</TableHead>
                                    <TableHead>Histórico</TableHead>
                                    <TableHead>Fontes de Pagamento</TableHead>
                                    <TableHead className="text-center">Contábil</TableHead>
                                    <TableHead className="text-right">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow><TableCell colSpan={16} className="text-center">Carregando...</TableCell></TableRow>
                                ) : parcelas.length === 0 ? (
                                    <TableRow><TableCell colSpan={16} className="text-center">Nenhuma parcela encontrada no período.</TableCell></TableRow>
                                ) : (
                                    parcelas.map((p) => {
                                        const statusVariant = getBadgeVariant(p.status as ContaStatus, p.data_vencimento);
                                        const isPaga = p.status === 'paga';
                                        const isCanceled = p.status === 'cancelada';
                                        const contaCP = p.admin_contas_pagar || (p as any).contas_pagar;
                                        const fornecedor = contaCP?.fornecedor || 'N/A';
                                        const descricao = contaCP?.descricao || 'N/A';
                                        const origem = contaCP?.origem || 'manual';
                                        const temLancamento = parcelasComLancamento.has(p.id);
                                        const lancamentos = lancamentosPorParcela[p.id] || [];
                                        const temMapeamento = !!(p as any).mapeado_extrato_id;
                                        const pagInfo = pagamentosInfo[p.id];

                                        return (
                                            <TableRow key={p.id}>
                                                <TableCell className="text-xs text-muted-foreground font-mono">{contaCP?.id ? contaCP.id.substring(0, 8) : '-'}</TableCell>
                                                <TableCell className="text-xs text-muted-foreground font-mono">{p.id.substring(0, 8)}</TableCell>
                                                <TableCell>{formatarData(p.data_vencimento)}</TableCell>
                                                <TableCell>{fornecedor}</TableCell>
                                                <TableCell>{descricao}</TableCell>
                                                <TableCell className="text-right">{formatCurrency(p.valor_parcela)}</TableCell>
                                                <TableCell className="text-right font-semibold text-green-600">{formatCurrency(p.valor_pago || 0)}</TableCell>
                                                <TableCell><Badge variant={statusVariant}>{p.status}</Badge></TableCell>
                                                <TableCell>{p.data_pagamento ? formatarData(p.data_pagamento) : '-'}</TableCell>
                                                <TableCell>{formatarOrigem(origem)}</TableCell>
                                                <TableCell>
                                                    {(p as any).pagbank_transfer_id ? (
                                                        <PagBankTransferStatus status={(p as any).pagbank_status} />
                                                    ) : p.status === 'aberta' && !isPaga ? (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => onRealizarPagamentoPagBank?.(p)}
                                                        >
                                                            Realizar Pagamento
                                                        </Button>
                                                    ) : (
                                                        <span className="text-muted-foreground text-sm">-</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    {pagInfo?.conta_patrimonial_codigo ? (
                                                        <span className="text-xs">
                                                            <span className="font-medium">{pagInfo.conta_patrimonial_codigo}</span>
                                                            {pagInfo.conta_patrimonial_descricao && (
                                                                <span className="text-muted-foreground"> {pagInfo.conta_patrimonial_descricao}</span>
                                                            )}
                                                        </span>
                                                    ) : (
                                                        <span className="text-muted-foreground text-sm">-</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    {pagInfo?.historico_descricao ? (
                                                        <span className="text-xs text-muted-foreground">{pagInfo.historico_descricao}</span>
                                                    ) : (
                                                        <span className="text-muted-foreground text-sm">-</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    {pagInfo?.fontes && pagInfo.fontes.length > 0 ? (
                                                        <div className="flex flex-col gap-0.5">
                                                            {pagInfo.fontes.map((f, i) => (
                                                                <span key={i} className="text-xs">
                                                                    {f.conta_codigo && <span className="font-medium">{f.conta_codigo} </span>}
                                                                    <span>{f.nome}</span>
                                                                    <span className="text-muted-foreground"> ({formatCurrency(f.valor)})</span>
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className="text-muted-foreground text-sm">-</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    {proprietarioId && (
                                                        <div className="flex flex-col items-start gap-1">
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={() => setLancamentoDialog({ open: true, parcela: p })}
                                                                title={temLancamento ? 'Ver/editar lançamento contábil' : 'Registrar lançamento contábil'}
                                                            >
                                                                <BookOpen className={`w-4 h-4 ${temLancamento ? 'text-green-600' : 'text-gray-400'}`} />
                                                            </Button>
                                                            {lancamentos.length > 0 && (
                                                                <div className="flex flex-col gap-0.5 min-w-[160px]">
                                                                    {lancamentos.map((l, i) => (
                                                                        <span key={i} className="text-xs text-muted-foreground leading-tight">
                                                                            <span className={`font-semibold ${l.tipo === 'Entrada' ? 'text-blue-600' : 'text-orange-600'}`}>
                                                                                {l.tipo === 'Entrada' ? 'D' : 'C'}
                                                                            </span>
                                                                            {' '}{l.conta_codigo} {l.conta_descricao}
                                                                            {' '}
                                                                            <span className="text-[10px] text-muted-foreground opacity-60">
                                                                                {l.origem?.startsWith('pagamento_cp') ? '(pag)' : l.origem === 'lancamento_cp' ? '(prov)' : ''}
                                                                            </span>
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        {!isCanceled && proprietarioId && (
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={() => setDetalhesDialog({ open: true, parcela: p })}
                                                                title="Ver detalhes de pagamento"
                                                            >
                                                                <Receipt className="w-4 h-4 text-purple-500" />
                                                            </Button>
                                                        )}
                                                        {!isPaga && !isCanceled && (
                                                            <Button size="sm" onClick={() => handleOpenPagamento(p, fornecedor)}>
                                                                <DollarSign className="w-4 h-4 mr-2" /> Pagar
                                                            </Button>
                                                        )}

                                                        {!isCanceled && (
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={() => handleOpenPagamento(p, fornecedor)}
                                                                title="Editar Pagamento"
                                                            >
                                                                <Edit className="w-4 h-4 text-blue-500" />
                                                            </Button>
                                                        )}

                                                        {isPaga && !isCanceled && (
                                                            temMapeamento ? (
                                                                <Button variant="ghost" size="icon" disabled title="Desvincule o mapeamento antes de estornar">
                                                                    <Undo2 className="w-4 h-4 text-gray-300" />
                                                                </Button>
                                                            ) : (
                                                                <AlertDialog>
                                                                    <AlertDialogTrigger asChild>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            title="Estornar Pagamento"
                                                                            disabled={parcelaEstornando === p.id}
                                                                        >
                                                                            {parcelaEstornando === p.id
                                                                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                                                                : <Undo2 className="w-4 h-4 text-orange-500" />
                                                                            }
                                                                        </Button>
                                                                    </AlertDialogTrigger>
                                                                    <AlertDialogContent>
                                                                        <AlertDialogHeader>
                                                                            <AlertDialogTitle>Estornar Pagamento</AlertDialogTitle>
                                                                            <AlertDialogDescription>
                                                                                Tem certeza que deseja estornar o pagamento desta parcela? Os lançamentos contábeis serão revertidos.
                                                                            </AlertDialogDescription>
                                                                        </AlertDialogHeader>
                                                                        <AlertDialogFooter>
                                                                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                                            <AlertDialogAction onClick={() => handleUndoPayment(p)}>
                                                                                Confirmar Estorno
                                                                            </AlertDialogAction>
                                                                        </AlertDialogFooter>
                                                                    </AlertDialogContent>
                                                                </AlertDialog>
                                                            )
                                                        )}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {lancamentoDialog.open && lancamentoDialog.parcela && proprietarioId && (
                <LancamentoContabilDialog
                    open={lancamentoDialog.open}
                    onOpenChange={(open) => setLancamentoDialog({ open, parcela: open ? lancamentoDialog.parcela : null })}
                    parcelaId={lancamentoDialog.parcela.id}
                    parcelaDescricao={lancamentoDialog.parcela.admin_contas_pagar?.descricao || 'Conta a Pagar'}
                    parcelaValor={lancamentoDialog.parcela.valor_parcela}
                    parcelaData={lancamentoDialog.parcela.data_vencimento}
                    origemTipo="contas_pagar"
                    proprietarioId={proprietarioId}
                    contaPatrimonialId={pagamentosInfo[lancamentoDialog.parcela.id]?.conta_patrimonial_id || (lancamentoDialog.parcela.admin_contas_pagar as any)?.id_conta_patrimonial || null}
                    contaResultadoId={pagamentosInfo[lancamentoDialog.parcela.id]?.conta_fonte_contabil_id || null}
                    onSaved={() => {
                        carregarLancamentos();
                        setLancamentoDialog({ open: false, parcela: null });
                    }}
                />
            )}

            {detalhesDialog.open && detalhesDialog.parcela && proprietarioId && (
                <DetalhesPagementoParcelaDialog
                    open={detalhesDialog.open}
                    onOpenChange={(open) => setDetalhesDialog({ open, parcela: open ? detalhesDialog.parcela : null })}
                    parcela={detalhesDialog.parcela}
                    proprietarioId={proprietarioId}
                    onDataChange={() => {
                        carregarLancamentos();
                        carregarPagamentosInfo();
                        onDataChange?.();
                    }}
                />
            )}
        </div>
    );
};

export default ParcelasTab;
