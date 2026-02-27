import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { PlusCircle, Undo2, Loader2, Pencil, BookOpen } from 'lucide-react';
import { ExtendedParcelaPagar } from '@/types/contas-pagar';
import { supabase } from '@/integrations/supabase/client';
import { useOwner } from '@/hooks/use-owner';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { formatCurrency, formatarData } from '@/utils/formatters';
import useSaldoContaCalculado from '@/hooks/use-saldo-conta-calculado';
import RegistrarPagamentoCPDialog from './RegistrarPagamentoCPDialog';
import LancamentoContabilDialog from '@/components/contabilidade/LancamentoContabilDialog';

interface PagamentoRaw {
  id: string;
  data_pagamento: string;
  valor_pago: number;
  forma_pagamento: string;
  conta_id: string;
  historico_id: string | null;
  observacao: string | null;
  conta_nome: string;
  historico_descricao: string;
  parcela_id: string;
}

interface LancamentoDetalhe {
  id: string;
  data_movimentacao: string;
  tipo: string;
  conta_codigo: string;
  conta_descricao: string;
  valor: number;
  origem: string;
}

interface Historico {
  id: string;
  descricao: string;
  codigo: string | null;
}

interface DetalhesPagementoParcelaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parcela: ExtendedParcelaPagar;
  cadeia?: ExtendedParcelaPagar[];
  proprietarioId: string;
  onDataChange: () => void;
}

const DetalhesPagementoParcelaDialog: React.FC<DetalhesPagementoParcelaDialogProps> = ({
  open,
  onOpenChange,
  parcela,
  cadeia,
  proprietarioId,
  onDataChange,
}) => {
  const { ownerId } = useOwner();
  const { role, perfil } = useSessao();

  const isDirectAdmin = role === 'Admin';
  const adminIdFromProfile = (perfil as any)?.admin_id ?? null;
  const isAdminOrEmployee = isDirectAdmin || (role === 'Usuario' && !!adminIdFromProfile);

  const tabelaPagamentos = isAdminOrEmployee ? 'admin_pagamentos' : 'pagamentos';
  const tabelaParcelas = isAdminOrEmployee ? 'admin_parcelas_pagar' : 'parcelas_contas_pagar';
  const tabelaContasPagar = isAdminOrEmployee ? 'admin_contas_pagar' : 'contas_pagar';

  const { contas: contasOrigem } = useSaldoContaCalculado('todos', 'todos', '', 'bancos');

  const [pagamentos, setPagamentos] = useState<PagamentoRaw[]>([]);
  const [lancamentos, setLancamentos] = useState<LancamentoDetalhe[]>([]);
  const [loading, setLoading] = useState(false);
  const [historicos, setHistoricos] = useState<Historico[]>([]);
  const [estornandoPagamento, setEstornandoPagamento] = useState<string | null>(null);
  const [pagamentoDialogOpen, setPagamentoDialogOpen] = useState(false);
  const [lancamentoDialogOpen, setLancamentoDialogOpen] = useState(false);
  const [confirmEstornoDialog, setConfirmEstornoDialog] = useState<{
    open: boolean;
    pagamentoId: string | null;
    extratoId: string | null;
    extratoDescricao: string;
    extratoValor: number;
    extratoData: string;
    extratoContaNome: string;
  }>({ open: false, pagamentoId: null, extratoId: null, extratoDescricao: '', extratoValor: 0, extratoData: '', extratoContaNome: '' });

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editValores, setEditValores] = useState<{
    data_pagamento: string;
    valor_pago: string;
    conta_id: string;
    historico_id: string;
    forma_pagamento: string;
    observacao: string;
  }>({ data_pagamento: '', valor_pago: '', conta_id: '', historico_id: '', forma_pagamento: '', observacao: '' });
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  const cadeiaCompleta = cadeia && cadeia.length > 0 ? cadeia : [parcela];
  const parcelaRaiz = cadeiaCompleta[0];
  const parcelaAtiva = cadeiaCompleta[cadeiaCompleta.length - 1];
  const temReprogramacao = cadeiaCompleta.length > 1;
  const totalPagoCadeia = React.useMemo(() => {
    if (pagamentos.length > 0) return pagamentos.reduce((s, pg) => s + pg.valor_pago, 0);
    return cadeiaCompleta.reduce((s, p) => s + (p.valor_pago || 0), 0);
  }, [pagamentos, cadeiaCompleta]);
  const saldoRestante = parcelaRaiz.valor_parcela - totalPagoCadeia;
  const fornecedor = parcelaRaiz.admin_contas_pagar?.fornecedor || parcela.admin_contas_pagar?.fornecedor || 'N/A';
  const descricao = parcelaRaiz.admin_contas_pagar?.descricao || parcela.admin_contas_pagar?.descricao || 'Conta a Pagar';

  const carregarDados = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const ids = cadeiaCompleta.map(p => p.id);

      const [pagamentosRes, lancamentosRes, historicosRes] = await Promise.all([
        supabase
          .from(tabelaPagamentos)
          .select('id, data_pagamento, valor_pago, forma_pagamento, observacao, conta_id, historico_id, parcela_id, saldo_contas(nome), historicos(descricao)')
          .in('parcela_id', ids)
          .order('data_pagamento', { ascending: true }),
        supabase
          .from('lancamentos')
          .select('id, data_movimentacao, tipo, conta_contabil_id, valor, origem')
          .eq('proprietario_id', proprietarioId)
          .or(ids.map(id => `documento.eq.${id},origem.ilike.%${id}%`).join(','))
          .not('origem', 'ilike', '%estornada%')
          .order('data_movimentacao', { ascending: true }),
        supabase.from('historicos').select('id, descricao, codigo').eq('proprietario_id', proprietarioId).order('descricao'),
      ]);

      const pagamentosMapped: PagamentoRaw[] = (pagamentosRes.data || []).map((pg: any) => ({
        id: pg.id,
        data_pagamento: pg.data_pagamento,
        valor_pago: pg.valor_pago,
        forma_pagamento: pg.forma_pagamento || '',
        conta_id: pg.conta_id || '',
        historico_id: pg.historico_id || null,
        observacao: pg.observacao || null,
        conta_nome: pg.saldo_contas?.nome || '-',
        historico_descricao: pg.historicos?.descricao || '-',
        parcela_id: pg.parcela_id || '',
      }));
      setPagamentos(pagamentosMapped);

      setHistoricos((historicosRes.data || []).map((h: any) => ({ id: h.id, descricao: h.descricao, codigo: h.codigo || null })));

      const lancamentosRaw = lancamentosRes.data || [];
      if (lancamentosRaw.length > 0) {
        const contaIds = [...new Set(lancamentosRaw.map((l: any) => l.conta_contabil_id).filter(Boolean))];
        const { data: contasData } = await supabase
          .from('plano_contas')
          .select('id, "Conta", "Descricao"')
          .in('id', contaIds);
        const contasMap: Record<string, { Conta: string; Descricao: string }> = {};
        (contasData || []).forEach((c: any) => { contasMap[c.id] = c; });
        setLancamentos(lancamentosRaw.map((l: any) => ({
          id: l.id,
          data_movimentacao: l.data_movimentacao,
          tipo: l.tipo,
          conta_codigo: contasMap[l.conta_contabil_id]?.Conta || '',
          conta_descricao: contasMap[l.conta_contabil_id]?.Descricao || l.conta_contabil_id || '',
          valor: l.valor,
          origem: l.origem || '',
        })));
      } else {
        setLancamentos([]);
      }
    } finally {
      setLoading(false);
    }
  }, [open, parcela.id, cadeia, tabelaPagamentos, proprietarioId]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  const abrirEdicao = (pg: PagamentoRaw) => {
    const dataStr = pg.data_pagamento
      ? new Date(pg.data_pagamento).toISOString().split('T')[0]
      : '';
    setEditValores({
      data_pagamento: dataStr,
      valor_pago: String(pg.valor_pago),
      conta_id: pg.conta_id || '',
      historico_id: pg.historico_id || '',
      forma_pagamento: pg.forma_pagamento || '',
      observacao: pg.observacao || '',
    });
    setEditandoId(pg.id);
  };

  const cancelarEdicao = () => {
    setEditandoId(null);
  };

  const salvarEdicao = async (pagamentoId: string, valorAnterior: number) => {
    const novoValor = parseFloat(editValores.valor_pago.replace(',', '.'));
    if (isNaN(novoValor) || novoValor <= 0) {
      showError('Informe um valor válido.');
      return;
    }
    if (!editValores.data_pagamento) {
      showError('Informe a data do pagamento.');
      return;
    }
    setSalvandoEdicao(true);
    try {
      const { error } = await supabase
        .from(tabelaPagamentos)
        .update({
          data_pagamento: editValores.data_pagamento,
          valor_pago: novoValor,
          conta_id: editValores.conta_id || null,
          historico_id: editValores.historico_id || null,
          forma_pagamento: editValores.forma_pagamento || null,
          observacao: editValores.observacao || null,
        })
        .eq('id', pagamentoId);

      if (error) throw error;

      const diferenca = novoValor - valorAnterior;
      const novoValorPagoTotal = Math.max(0, (parcela.valor_pago || 0) + diferenca);
      const saldoAposEdicao = parcela.valor_parcela - novoValorPagoTotal;
      const novoStatus: string = saldoAposEdicao <= 0.01 ? 'paga' : (novoValorPagoTotal > 0 ? 'parcial' : 'aberta');

      await supabase
        .from(tabelaParcelas)
        .update({
          valor_pago: novoValorPagoTotal,
          status: novoStatus,
          data_pagamento: editValores.data_pagamento,
        })
        .eq('id', parcela.id);

      showSuccess('Pagamento atualizado com sucesso.');
      setEditandoId(null);
      await carregarDados();
      onDataChange();
    } catch (error: any) {
      showError('Erro ao salvar: ' + error.message);
    } finally {
      setSalvandoEdicao(false);
    }
  };

  const handleEstornarPagamento = async (pagamentoId: string) => {
    if (!ownerId) return;
    setEstornandoPagamento(pagamentoId);
    try {
      const pagamentoEstornado = pagamentos.find(pg => pg.id === pagamentoId);
      // Buscar extrato vinculado via id_parcela_pg (qualquer parcela da cadeia)
      const idsDaCadeia = cadeiaCompleta.map(p => p.id);
      const { data: extratoVinculado } = await supabase
        .from('extratos')
        .select('id, descricao, valor, data, id_saldo_contas, saldo_contas(nome)')
        .in('id_parcela_pg', idsDaCadeia)
        .eq('conciliado', false)
        .limit(1)
        .maybeSingle();

      if (extratoVinculado) {
        setEstornandoPagamento(null);
        setConfirmEstornoDialog({
          open: true,
          pagamentoId,
          extratoId: extratoVinculado.id,
          extratoDescricao: extratoVinculado.descricao || '',
          extratoValor: extratoVinculado.valor,
          extratoData: extratoVinculado.data,
          extratoContaNome: (extratoVinculado as any).saldo_contas?.nome || '',
        });
      } else {
        await executarEstorno(pagamentoId, null);
      }
    } catch (error: any) {
      console.error('Erro ao verificar extrato:', error);
      showError('Falha ao verificar extrato: ' + error.message);
      setEstornandoPagamento(null);
    }
  };

  const executarEstorno = async (pagamentoId: string, extratoId: string | null) => {
    if (!ownerId) return;
    setEstornandoPagamento(pagamentoId);
    try {
      const { data: parcelaData, error: parcelaError } = await supabase
        .from(tabelaParcelas)
        .select('conta_pagar_id, valor_parcela, valor_pago')
        .eq('id', parcela.id)
        .single();
      if (parcelaError || !parcelaData) throw new Error('Parcela não encontrada.');

      const contaPagarId = parcelaData.conta_pagar_id;
      const dataEstornoISO = new Date().toISOString();

      const { data: originalLaunches } = await supabase
        .from('lancamentos')
        .select('id, conta_resultado_id, conta_contabil_id, conta_bancaria_id, valor, tipo, descricao, historico_id, origem')
        .eq('proprietario_id', ownerId)
        .or(`documento.eq.${parcela.id},origem.ilike.%${parcela.id}%`)
        .not('origem', 'ilike', '%estornada%');

      const lancamentosEstornoPayload: any[] = [];
      for (const orig of (originalLaunches || []).filter((l: any) => l.origem?.startsWith('pagamento_cp') && !l.origem?.includes('_estornada'))) {
        lancamentosEstornoPayload.push({
          id: crypto.randomUUID(),
          proprietario_id: ownerId,
          data_movimentacao: dataEstornoISO,
          descricao: `ESTORNO: ${orig.descricao}`,
          valor: orig.valor,
          tipo: orig.tipo === 'Entrada' ? 'Saida' : 'Entrada',
          conta_bancaria_id: orig.conta_bancaria_id,
          conta_contabil_id: orig.conta_contabil_id,
          origem: 'estorno_pagamento_manual',
          historico_id: orig.historico_id,
          conta_resultado_id: orig.conta_resultado_id,
        });
      }

      if (lancamentosEstornoPayload.length > 0) {
        const { error: insErr } = await supabase.from('lancamentos').insert(lancamentosEstornoPayload);
        if (insErr) throw insErr;
      }

      const originalLaunchIds = (originalLaunches || []).map((l: any) => l.id);
      if (originalLaunchIds.length > 0) {
        await supabase.from('lancamentos').update({ origem: 'pagamento_manual_estornada' }).in('id', originalLaunchIds);
      }

      const { error: deletePagError } = await supabase.from(tabelaPagamentos).delete().eq('id', pagamentoId);
      if (deletePagError) throw deletePagError;

      if (extratoId) {
        await supabase.from('extratos').delete().eq('id', extratoId);
      }

      const pagamentoEstornado = pagamentos.find(pg => pg.id === pagamentoId);
      const valorEstornado = pagamentoEstornado?.valor_pago || 0;
      const novoValorPago = Math.max(0, (parcelaData.valor_pago || 0) - valorEstornado);
      const novoStatus = novoValorPago <= 0 ? 'aberta' : 'parcial';

      await supabase
        .from(tabelaParcelas)
        .update({
          status: novoStatus,
          valor_pago: novoValorPago,
          data_pagamento: novoValorPago <= 0 ? null : parcela.data_pagamento,
          observacao: 'Estorno de pagamento realizado.',
        })
        .eq('id', parcela.id);

      if (novoValorPago <= 0) {
        await supabase.from(tabelaContasPagar).update({ status: 'pendente' }).eq('id', contaPagarId);
      }

      showSuccess('Pagamento estornado com sucesso!');
      await carregarDados();
      onDataChange();
    } catch (error: any) {
      console.error('Erro ao estornar pagamento:', error);
      showError('Falha ao estornar: ' + error.message);
    } finally {
      setEstornandoPagamento(null);
    }
  };

  const parcelaParaPagamento = parcelaAtiva as ExtendedParcelaPagar & { fornecedor: string };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Detalhes de Pagamento — Parcela {parcelaRaiz.numero_parcela}
              {temReprogramacao && <span className="text-sm font-normal text-muted-foreground ml-2">({cadeiaCompleta.length} etapas)</span>}
            </DialogTitle>
            <DialogDescription>{fornecedor} · {descricao}</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-3 gap-4 p-4 bg-secondary rounded-md text-sm">
            <div>
              <p className="text-muted-foreground">Valor Original</p>
              <p className="text-lg font-bold">{formatCurrency(parcelaRaiz.valor_parcela)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Total Pago</p>
              <p className="text-lg font-bold text-green-600">{formatCurrency(totalPagoCadeia)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Saldo Restante</p>
              <p className={`text-lg font-bold ${saldoRestante > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                {formatCurrency(Math.max(0, saldoRestante))}
              </p>
            </div>
          </div>

          {temReprogramacao && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs space-y-1">
              <p className="font-semibold text-amber-800">Histórico de Reprogramações</p>
              <div className="grid grid-cols-4 gap-2 text-amber-700 font-medium border-b border-amber-200 pb-1">
                <span>Etapa</span><span>Vencimento</span><span className="text-right">Valor</span><span className="text-right">Pago</span>
              </div>
              {cadeiaCompleta.map((p, i) => {
                const pagoPorEtapa = pagamentos
                  .filter(pg => pg.parcela_id === p.id)
                  .reduce((s, pg) => s + pg.valor_pago, 0);
                return (
                  <div key={p.id} className="grid grid-cols-4 gap-2 text-amber-700">
                    <span>{i === 0 ? 'Original' : `Reprog. ${i}`}</span>
                    <span>{formatarData(p.data_vencimento)}</span>
                    <span className="text-right">{formatCurrency(p.valor_parcela)}</span>
                    <span className="text-right text-green-700">{formatCurrency(pagoPorEtapa)}</span>
                  </div>
                );
              })}
            </div>
          )}

          <Separator />

          <div className="space-y-2">
            <h3 className="font-semibold text-sm">Pagamentos Registrados</h3>
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
              </div>
            ) : pagamentos.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4">Nenhum pagamento registrado.</p>
            ) : (
              <div className="space-y-2">
                {pagamentos.map((pg) => (
                  <div key={pg.id} className="border rounded-md">
                    {editandoId === pg.id ? (
                      <div className="p-4 space-y-3 bg-muted/30">
                        <p className="text-sm font-semibold text-blue-700">Editando pagamento</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Data do Pagamento</Label>
                            <Input
                              type="date"
                              value={editValores.data_pagamento}
                              onChange={e => setEditValores(v => ({ ...v, data_pagamento: e.target.value }))}
                              disabled={salvandoEdicao}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Valor Pago (R$)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={editValores.valor_pago}
                              onChange={e => setEditValores(v => ({ ...v, valor_pago: e.target.value }))}
                              disabled={salvandoEdicao}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Conta / Banco</Label>
                            <Select
                              value={editValores.conta_id || undefined}
                              onValueChange={val => setEditValores(v => ({ ...v, conta_id: val }))}
                              disabled={salvandoEdicao}
                            >
                              <SelectTrigger><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
                              <SelectContent>
                                {contasOrigem.map(c => (
                                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Forma de Pagamento</Label>
                            <Input
                              value={editValores.forma_pagamento}
                              onChange={e => setEditValores(v => ({ ...v, forma_pagamento: e.target.value }))}
                              placeholder="Pix, Boleto, TED..."
                              disabled={salvandoEdicao}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Histórico</Label>
                            <Select
                              value={editValores.historico_id || undefined}
                              onValueChange={val => setEditValores(v => ({ ...v, historico_id: val }))}
                              disabled={salvandoEdicao}
                            >
                              <SelectTrigger><SelectValue placeholder="Selecione o histórico" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__nenhum__">Nenhum</SelectItem>
                                {historicos.map(h => (
                                  <SelectItem key={h.id} value={h.id}>
                                    {h.codigo ? `[${h.codigo}] ` : ''}{h.descricao}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1 col-span-2">
                            <Label className="text-xs">Observação</Label>
                            <Textarea
                              rows={2}
                              value={editValores.observacao}
                              onChange={e => setEditValores(v => ({ ...v, observacao: e.target.value }))}
                              disabled={salvandoEdicao}
                            />
                          </div>
                        </div>
                        <div className="flex gap-2 justify-end">
                          <Button variant="outline" size="sm" onClick={cancelarEdicao} disabled={salvandoEdicao}>
                            Cancelar
                          </Button>
                          <Button size="sm" onClick={() => salvarEdicao(pg.id, pg.valor_pago)} disabled={salvandoEdicao}>
                            {salvandoEdicao ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                            Salvar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between p-3 gap-2">
                        {temReprogramacao && (
                          <div className="shrink-0 text-xs text-amber-600 font-medium w-16">
                            {(() => {
                              const idx = cadeiaCompleta.findIndex(p => p.id === pg.parcela_id);
                              return idx === 0 ? 'Original' : idx > 0 ? `Reprog. ${idx}` : '';
                            })()}
                          </div>
                        )}
                        <div className="grid grid-cols-6 gap-x-4 gap-y-1 flex-1 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">Data</p>
                            <p>{formatarData(pg.data_pagamento)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Valor</p>
                            <p className="font-semibold text-green-600">{formatCurrency(pg.valor_pago)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Conta/Banco</p>
                            <p>{pg.conta_nome}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Forma</p>
                            <p>{pg.forma_pagamento || '-'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Histórico</p>
                            <p className="text-muted-foreground">{pg.historico_descricao}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Observação</p>
                            <p className="text-muted-foreground">{pg.observacao || '-'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Editar pagamento"
                            onClick={() => abrirEdicao(pg)}
                          >
                            <Pencil className="w-4 h-4 text-blue-500" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Estornar este pagamento"
                                disabled={estornandoPagamento === pg.id}
                              >
                                {estornandoPagamento === pg.id
                                  ? <Loader2 className="w-4 h-4 animate-spin" />
                                  : <Undo2 className="w-4 h-4 text-orange-500" />
                                }
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Estornar Pagamento</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Estornar {formatCurrency(pg.valor_pago)} pago em {formatarData(pg.data_pagamento)}? Os lançamentos contábeis serão revertidos.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleEstornarPagamento(pg.id)}>
                                  Confirmar Estorno
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Lançamentos Contábeis</h3>
              {!loading && proprietarioId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLancamentoDialogOpen(true)}
                  title="Registrar / editar lançamentos contábeis desta parcela"
                >
                  <BookOpen className="w-4 h-4 mr-2" />
                  {lancamentos.length > 0 ? 'Editar Lançamentos' : 'Registrar Lançamentos'}
                </Button>
              )}
            </div>
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
              </div>
            ) : lancamentos.length === 0 ? (
              <p className="text-muted-foreground text-sm py-2">Nenhum lançamento contábil encontrado. Use o botão acima para registrar.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>D/C</TableHead>
                    <TableHead>Conta</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Origem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lancamentos.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>{formatarData(l.data_movimentacao)}</TableCell>
                      <TableCell>
                        <span className={`font-bold text-sm ${l.tipo === 'Entrada' ? 'text-blue-600' : 'text-orange-600'}`}>
                          {l.tipo === 'Entrada' ? 'D' : 'C'}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {l.conta_codigo && <span className="font-medium">{l.conta_codigo} </span>}
                        <span className="text-muted-foreground">{l.conta_descricao}</span>
                      </TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(l.valor)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{l.origem}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          <Separator />

          <div className="flex justify-between items-center pt-2">
            <Button
              variant="outline"
              onClick={() => setPagamentoDialogOpen(true)}
              disabled={parcela.status === 'cancelada'}
            >
              <PlusCircle className="w-4 h-4 mr-2" />
              {saldoRestante > 0 ? 'Registrar Pagamento' : 'Novo Pagamento'}
            </Button>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {pagamentoDialogOpen && (
        <RegistrarPagamentoCPDialog
          open={pagamentoDialogOpen}
          onOpenChange={setPagamentoDialogOpen}
          parcela={{ ...parcelaParaPagamento, fornecedor }}
          onSaveComplete={() => {
            setPagamentoDialogOpen(false);
            carregarDados();
            onDataChange();
          }}
        />
      )}

      {lancamentoDialogOpen && proprietarioId && (
        <LancamentoContabilDialog
          open={lancamentoDialogOpen}
          onOpenChange={setLancamentoDialogOpen}
          parcelaId={parcela.id}
          parcelaDescricao={descricao}
          parcelaValor={parcela.valor_parcela}
          parcelaData={parcela.data_vencimento}
          origemTipo="contas_pagar"
          proprietarioId={proprietarioId}
          contaPatrimonialId={(parcela.admin_contas_pagar as any)?.id_conta_patrimonial || null}
          contaResultadoId={(parcela.admin_contas_pagar as any)?.id_conta_resultado || null}
          onSaved={() => {
            setLancamentoDialogOpen(false);
            carregarDados();
            onDataChange();
          }}
        />
      )}

      <AlertDialog open={confirmEstornoDialog.open} onOpenChange={(open) => setConfirmEstornoDialog(prev => ({ ...prev, open }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Estorno</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Foi encontrado um lançamento no extrato bancário vinculado a este pagamento. Deseja removê-lo também?</p>
                <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">Conta:</span><span className="font-medium">{confirmEstornoDialog.extratoContaNome}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Data:</span><span className="font-medium">{confirmEstornoDialog.extratoData}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Descrição:</span><span className="font-medium">{confirmEstornoDialog.extratoDescricao}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Valor:</span><span className="font-medium text-red-600">{formatCurrency(Math.abs(confirmEstornoDialog.extratoValor))}</span></div>
                </div>
                <p className="text-xs text-muted-foreground">Se o extrato já foi conciliado, não será possível removê-lo.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmEstornoDialog(prev => ({ ...prev, open: false }))}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={async () => {
                setConfirmEstornoDialog(prev => ({ ...prev, open: false }));
                await executarEstorno(confirmEstornoDialog.pagamentoId!, confirmEstornoDialog.extratoId);
              }}
            >
              Estornar e Remover Extrato
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default DetalhesPagementoParcelaDialog;
