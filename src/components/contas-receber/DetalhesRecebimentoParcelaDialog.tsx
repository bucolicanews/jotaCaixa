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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { PlusCircle, Undo2, Loader2, Pencil, BookOpen, Trash2 } from 'lucide-react';
import { ContaReceber } from '@/types/contas-receber';
import { supabase } from '@/integrations/supabase/client';
import { useOwner } from '@/hooks/use-owner';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { formatCurrency, formatarData } from '@/utils/formatters';
import useSaldoContaCalculado from '@/hooks/use-saldo-conta-calculado';
import LancamentoContabilDialog from '@/components/contabilidade/LancamentoContabilDialog';
import EditarParcelaPagaDialog from '@/components/contas-receber/EditarParcelaPagaDialog';

interface Parcela {
  id: string;
  conta_receber_id: string;
  empresa_id: string;
  numero_parcela: number;
  valor_parcela: number;
  valor_pago: number;
  data_vencimento: string;
  data_pagamento: string | null;
  status: 'aberta' | 'parcial' | 'paga' | 'reprogramada' | 'cancelada' | 'bloqueada';
  id_conta_contabil: string | null;
  observacao: string | null;
  mapeado_extrato_id: string | null;
}

interface RecebimentoRaw {
  id: string;
  data_recebimento: string;
  valor_recebido: number;
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

interface DetalhesRecebimentoParcelaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parcela: Parcela;
  conta?: ContaReceber;
  proprietarioId: string;
  onDataChange: () => void;
}

const DetalhesRecebimentoParcelaDialog: React.FC<DetalhesRecebimentoParcelaDialogProps> = ({
  open,
  onOpenChange,
  parcela,
  conta,
  proprietarioId,
  onDataChange,
}) => {
  const contaReceber = conta ?? (parcela as any).contas_receber ?? null;
  const { ownerId } = useOwner();
  const { role, perfil } = useSessao();

  const isDirectAdmin = role === 'Admin';
  const adminIdFromProfile = (perfil as any)?.admin_id ?? null;
  const isAdminOrEmployee = isDirectAdmin || (role === 'Usuario' && !!adminIdFromProfile);

  const tabelaRecebimentos = isAdminOrEmployee ? 'admin_recebimentos' : 'recebimentos';
  const tabelaParcelas = isAdminOrEmployee ? 'admin_parcelas_receber' : 'parcelas_contas_receber';
  const tabelaContasReceber = isAdminOrEmployee ? 'admin_contas_receber' : 'contas_receber';

  const { contas: contasDestino } = useSaldoContaCalculado('todos', 'todos', '', 'bancos');

  const [recebimentos, setRecebimentos] = useState<RecebimentoRaw[]>([]);
  const [lancamentos, setLancamentos] = useState<LancamentoDetalhe[]>([]);
  const [loading, setLoading] = useState(false);
  const [historicos, setHistoricos] = useState<Historico[]>([]);
  const [estornandoRecebimento, setEstornandoRecebimento] = useState<string | null>(null);
  const [lancamentoDialogOpen, setLancamentoDialogOpen] = useState(false);
  const [editarPagaDialogOpen, setEditarPagaDialogOpen] = useState(false);
  const [deletandoLancamentoId, setDeletandoLancamentoId] = useState<string | null>(null);
  const [confirmDeleteLancamento, setConfirmDeleteLancamento] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });

  const [confirmEstornoDialog, setConfirmEstornoDialog] = useState<{
    open: boolean;
    recebimentoId: string | null;
    extratoId: string | null;
    extratoDescricao: string;
    extratoValor: number;
    extratoData: string;
    extratoContaNome: string;
  }>({ open: false, recebimentoId: null, extratoId: null, extratoDescricao: '', extratoValor: 0, extratoData: '', extratoContaNome: '' });

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editValores, setEditValores] = useState<{
    data_recebimento: string;
    valor_recebido: string;
    conta_id: string;
    historico_id: string;
    forma_pagamento: string;
    observacao: string;
  }>({ data_recebimento: '', valor_recebido: '', conta_id: '', historico_id: '', forma_pagamento: '', observacao: '' });
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  const totalRecebido = React.useMemo(
    () => recebimentos.reduce((s, r) => s + r.valor_recebido, 0),
    [recebimentos]
  );
  const saldoRestante = parcela.valor_parcela - totalRecebido;
  const cliente = contaReceber?.clientes?.nome || 'N/A';
  const descricao = contaReceber?.descricao || 'Conta a Receber';

  const carregarDados = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const [recebimentosRes, lancamentosRes, historicosRes] = await Promise.all([
        supabase
          .from(tabelaRecebimentos)
          .select('id, data_recebimento, valor_recebido, forma_pagamento, observacao, conta_id, historico_id, parcela_id, saldo_contas(nome), historicos(descricao)')
          .eq('parcela_id', parcela.id)
          .order('data_recebimento', { ascending: true }),
        supabase
          .from('lancamentos')
          .select('id, data_movimentacao, tipo, conta_contabil_id, valor, origem')
          .eq('proprietario_id', proprietarioId)
          .or(`documento.eq.${parcela.id},origem.ilike.%${parcela.id}%`)
          .not('origem', 'ilike', '%estornada%')
          .order('data_movimentacao', { ascending: true }),
        supabase.from('historicos').select('id, descricao, codigo').eq('proprietario_id', proprietarioId).order('descricao'),
      ]);

      const recebimentosMapped: RecebimentoRaw[] = (recebimentosRes.data || []).map((r: any) => ({
        id: r.id,
        data_recebimento: r.data_recebimento,
        valor_recebido: r.valor_recebido,
        forma_pagamento: r.forma_pagamento || '',
        conta_id: r.conta_id || '',
        historico_id: r.historico_id || null,
        observacao: r.observacao || null,
        conta_nome: r.saldo_contas?.nome || '-',
        historico_descricao: r.historicos?.descricao || '-',
        parcela_id: r.parcela_id || '',
      }));
      setRecebimentos(recebimentosMapped);

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
  }, [open, parcela.id, tabelaRecebimentos, proprietarioId]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  const abrirEdicao = (r: RecebimentoRaw) => {
    const dataStr = r.data_recebimento
      ? new Date(r.data_recebimento).toISOString().split('T')[0]
      : '';
    setEditValores({
      data_recebimento: dataStr,
      valor_recebido: String(r.valor_recebido),
      conta_id: r.conta_id || '',
      historico_id: r.historico_id || '',
      forma_pagamento: r.forma_pagamento || '',
      observacao: r.observacao || '',
    });
    setEditandoId(r.id);
  };

  const cancelarEdicao = () => {
    setEditandoId(null);
  };

  const salvarEdicao = async (recebimentoId: string, valorAnterior: number) => {
    const novoValor = parseFloat(editValores.valor_recebido.replace(',', '.'));
    if (isNaN(novoValor) || novoValor <= 0) {
      showError('Informe um valor válido.');
      return;
    }
    if (!editValores.data_recebimento) {
      showError('Informe a data do recebimento.');
      return;
    }
    setSalvandoEdicao(true);
    try {
      const { error } = await supabase
        .from(tabelaRecebimentos)
        .update({
          data_recebimento: editValores.data_recebimento,
          valor_recebido: novoValor,
          conta_id: editValores.conta_id || null,
          historico_id: editValores.historico_id && editValores.historico_id !== '__nenhum__' ? editValores.historico_id : null,
          forma_pagamento: editValores.forma_pagamento || null,
          observacao: editValores.observacao || null,
        })
        .eq('id', recebimentoId);

      if (error) throw error;

      const diferenca = novoValor - valorAnterior;
      const novoValorRecebidoTotal = Math.max(0, (parcela.valor_pago || 0) + diferenca);
      const saldoAposEdicao = parcela.valor_parcela - novoValorRecebidoTotal;
      const novoStatus: string = saldoAposEdicao <= 0.01 ? 'paga' : (novoValorRecebidoTotal > 0 ? 'parcial' : 'aberta');

      await supabase
        .from(tabelaParcelas)
        .update({
          valor_pago: novoValorRecebidoTotal,
          status: novoStatus,
          data_pagamento: editValores.data_recebimento,
        })
        .eq('id', parcela.id);

      showSuccess('Recebimento atualizado com sucesso.');
      setEditandoId(null);
      await carregarDados();
      onDataChange();
    } catch (error: any) {
      showError('Erro ao salvar: ' + error.message);
    } finally {
      setSalvandoEdicao(false);
    }
  };

  const handleEstornarRecebimento = async (recebimentoId: string) => {
    if (!ownerId) return;
    setEstornandoRecebimento(recebimentoId);
    try {
      const recebimento = recebimentos.find(r => r.id === recebimentoId);
      const temBanco = !!recebimento?.conta_id;

      if (!temBanco) {
        await executarEstorno(recebimentoId, null);
        return;
      }

      let extratoVinculado: any = null;
      try {
        const { data } = await supabase
          .from('extratos')
          .select('id, descricao, valor, data, saldo_contas(nome)')
          .eq('id_parcela_rb', parcela.id)
          .maybeSingle();
        extratoVinculado = data;
      } catch (err) {
        // Silently handle error
      }

      const dataFallback = recebimento?.data_recebimento 
        ? new Date(recebimento.data_recebimento).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];

      setEstornandoRecebimento(null);
      setConfirmEstornoDialog({
        open: true,
        recebimentoId,
        extratoId: extratoVinculado?.id ?? null,
        extratoDescricao: extratoVinculado?.descricao || 'Transf Pix recebida',
        extratoValor: extratoVinculado?.valor ?? recebimento?.valor_recebido ?? 0,
        extratoData: extratoVinculado?.data || dataFallback,
        extratoContaNome: (extratoVinculado as any)?.saldo_contas?.nome || recebimento?.conta_nome || 'Banco',
      });
    } catch (error: any) {
      showError('Falha ao verificar extrato: ' + error.message);
      setEstornandoRecebimento(null);
    }
  };

  const executarEstorno = async (recebimentoId: string, extratoId: string | null) => {
    if (!ownerId) return;
    setEstornandoRecebimento(recebimentoId);
    try {
      // 1. Deletar recebimento
      const { error: deleteRecError } = await supabase
        .from(tabelaRecebimentos)
        .delete()
        .eq('id', recebimentoId);
      if (deleteRecError) throw deleteRecError;

      // 2. Deletar lançamentos
      const { error: deleteLancError } = await supabase
        .from('lancamentos')
        .delete()
        .eq('proprietario_id', ownerId)
        .eq('documento', parcela.id)
        .like('origem', 'recebimento_manual:%');
      if (deleteLancError) throw deleteLancError;

      // 3. Deletar extrato (por id_parcela_rb sempre)
      await supabase
        .from('extratos')
        .delete()
        .eq('id_parcela_rb', parcela.id);

      // 4. Resetar parcela
      await supabase
        .from(tabelaParcelas)
        .update({
          status: 'aberta',
          valor_pago: 0,
          data_pagamento: null,
        })
        .eq('id', parcela.id);

      showSuccess('Estorno realizado! Parcela, lançamentos e extrato deletados com sucesso.');
      await carregarDados();
      onDataChange();
    } catch (error: any) {
      showError('Falha ao estornar: ' + error.message);
    } finally {
      setEstornandoRecebimento(null);
    }
  };

  const deletarLancamento = async (lancamentoId: string) => {
    setDeletandoLancamentoId(lancamentoId);
    try {
      const { error } = await supabase
        .from('lancamentos')
        .delete()
        .eq('id', lancamentoId)
        .eq('proprietario_id', proprietarioId);
      if (error) throw error;
      showSuccess('Lançamento excluído.');
      await carregarDados();
      onDataChange();
    } catch (error: any) {
      showError('Erro ao excluir lançamento: ' + error.message);
    } finally {
      setDeletandoLancamentoId(null);
      setConfirmDeleteLancamento({ open: false, id: null });
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Detalhes de Recebimento — Parcela {parcela.numero_parcela}
            </DialogTitle>
            <DialogDescription>{cliente} · {descricao}</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-3 gap-4 p-4 bg-secondary rounded-md text-sm">
            <div>
              <p className="text-muted-foreground">Valor Original</p>
              <p className="text-lg font-bold">{formatCurrency(parcela.valor_parcela)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Total Recebido</p>
              <p className="text-lg font-bold text-green-600">{formatCurrency(totalRecebido)}</p>
            </div>
            <div>
              {saldoRestante < 0 ? (
                <>
                  <p className="text-muted-foreground">Acréscimo</p>
                  <p className="text-lg font-bold text-blue-600">{formatCurrency(Math.abs(saldoRestante))}</p>
                </>
              ) : (
                <>
                  <p className="text-muted-foreground">Saldo Restante</p>
                  <p className={`text-lg font-bold ${saldoRestante > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                    {formatCurrency(saldoRestante)}
                  </p>
                </>
              )}
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <h3 className="font-semibold text-sm">Recebimentos Registrados</h3>
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
              </div>
            ) : recebimentos.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4">Nenhum recebimento registrado.</p>
            ) : (
              <div className="space-y-2">
                {recebimentos.map((r) => (
                  <div key={r.id} className="border rounded-md">
                    {editandoId === r.id ? (
                      <div className="p-4 space-y-3 bg-muted/30">
                        <p className="text-sm font-semibold text-blue-700">Editando recebimento</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Data do Recebimento</Label>
                            <Input
                              type="date"
                              value={editValores.data_recebimento}
                              onChange={e => setEditValores(v => ({ ...v, data_recebimento: e.target.value }))}
                              disabled={salvandoEdicao}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Valor Recebido (R$)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={editValores.valor_recebido}
                              onChange={e => setEditValores(v => ({ ...v, valor_recebido: e.target.value }))}
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
                                {contasDestino.map(c => (
                                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Forma de Recebimento</Label>
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
                          <Button size="sm" onClick={() => salvarEdicao(r.id, r.valor_recebido)} disabled={salvandoEdicao}>
                            {salvandoEdicao ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                            Salvar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between p-3 gap-2">
                        <div className="grid grid-cols-6 gap-x-4 gap-y-1 flex-1 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">Data</p>
                            <p>{formatarData(r.data_recebimento)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Valor</p>
                            <p className="font-semibold text-green-600">{formatCurrency(r.valor_recebido)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Conta/Banco</p>
                            <p>{r.conta_nome}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Forma</p>
                            <p>{r.forma_pagamento || '-'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Histórico</p>
                            <p className="text-muted-foreground">{r.historico_descricao}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Observação</p>
                            <p className="text-muted-foreground">{r.observacao || '-'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Editar recebimento"
                            onClick={() => abrirEdicao(r)}
                          >
                            <Pencil className="w-4 h-4 text-blue-500" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Estornar este recebimento"
                            disabled={estornandoRecebimento === r.id}
                            onClick={() => handleEstornarRecebimento(r.id)}
                          >
                            {estornandoRecebimento === r.id
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <Undo2 className="w-4 h-4 text-orange-500" />
                            }
                          </Button>
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
                    <TableHead></TableHead>
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
                      <TableCell>
                        {l.origem === 'lancamento_manual_cr' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Excluir lançamento"
                            disabled={deletandoLancamentoId === l.id}
                            onClick={() => setConfirmDeleteLancamento({ open: true, id: l.id })}
                          >
                            {deletandoLancamentoId === l.id
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <Trash2 className="w-4 h-4 text-red-500" />
                            }
                          </Button>
                        )}
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
              onClick={() => setEditarPagaDialogOpen(true)}
              disabled={parcela.status === 'cancelada'}
            >
              <PlusCircle className="w-4 h-4 mr-2" />
              {saldoRestante > 0 ? 'Registrar Recebimento' : 'Novo Recebimento'}
            </Button>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {editarPagaDialogOpen && (
        <EditarParcelaPagaDialog
          parcelaId={parcela.id}
          open={editarPagaDialogOpen}
          onOpenChange={setEditarPagaDialogOpen}
          onSaveComplete={() => {
            setEditarPagaDialogOpen(false);
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
          origemTipo="contas_receber"
          proprietarioId={proprietarioId}
          contaPatrimonialId={contaReceber?.id_conta_patrimonial}
          contaResultadoId={contaReceber?.id_conta_resultado}
          onSaved={() => {
            setLancamentoDialogOpen(false);
            carregarDados();
            onDataChange();
          }}
        />
      )}

      <AlertDialog open={confirmDeleteLancamento.open} onOpenChange={(open) => setConfirmDeleteLancamento(prev => ({ ...prev, open }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Lançamento</AlertDialogTitle>
            <AlertDialogDescription>
              Este lançamento contábil será excluído permanentemente. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => confirmDeleteLancamento.id && deletarLancamento(confirmDeleteLancamento.id)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmEstornoDialog.open} onOpenChange={(open) => setConfirmEstornoDialog(prev => ({ ...prev, open }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Estorno de Recebimento</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  O lançamento do extrato bancário será DELETADO junto com o recebimento e os lançamentos contábeis.
                </p>
                <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">Parcela:</span><span className="font-medium">Nº {parcela.numero_parcela} — {parcela.id.substring(0, 8)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Conta/Banco:</span><span className="font-medium">{confirmEstornoDialog.extratoContaNome}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Data:</span><span className="font-medium">{confirmEstornoDialog.extratoData}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Descrição:</span><span className="font-medium">{confirmEstornoDialog.extratoDescricao}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Valor:</span><span className="font-medium text-green-600">{formatCurrency(Math.abs(confirmEstornoDialog.extratoValor))}</span></div>
                </div>
                <p className="text-xs text-muted-foreground">Os lançamentos contábeis serão estornados e o extrato bancário será removido.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmEstornoDialog(prev => ({ ...prev, open: false }))}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={async () => {
                setConfirmEstornoDialog(prev => ({ ...prev, open: false }));
                await executarEstorno(confirmEstornoDialog.recebimentoId!, confirmEstornoDialog.extratoId);
              }}
            >
              Confirmar Estorno
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default DetalhesRecebimentoParcelaDialog;
