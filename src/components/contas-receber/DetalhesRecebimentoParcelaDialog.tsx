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
import { ExtendedParcelaDetalhada } from '@/types/contas-receber';
import { supabase } from '@/integrations/supabase/client';
import { useOwner } from '@/hooks/use-owner';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { formatCurrency, formatarData } from '@/utils/formatters';
import useSaldoContaCalculado from '@/hooks/use-saldo-conta-calculado';
import RegistrarPagamentoDialog from './RegistrarPagamentoDialog';
import LancamentoContabilDialog from '@/components/contabilidade/LancamentoContabilDialog';

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

interface PlanoContaItem {
  id: string;
  Conta: string;
  Descricao: string;
}

interface Historico {
  id: string;
  descricao: string;
  codigo: string | null;
}

interface DetalhesRecebimentoParcelaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parcela: ExtendedParcelaDetalhada;
  proprietarioId: string;
  onDataChange: () => void;
}

const DetalhesRecebimentoParcelaDialog: React.FC<DetalhesRecebimentoParcelaDialogProps> = ({
  open,
  onOpenChange,
  parcela,
  proprietarioId,
  onDataChange,
}) => {
  const { ownerId } = useOwner();
  const { role, perfil } = useSessao();

  const isDirectAdmin = role === 'Admin';
  const adminIdFromProfile = (perfil as any)?.admin_id ?? null;
  const isAdminOrEmployee = isDirectAdmin || (role === 'Usuario' && !!adminIdFromProfile);

  const tabelaRecebimentos = isAdminOrEmployee ? 'admin_recebimentos' : 'recebimentos';
  const tabelaParcelas = isAdminOrEmployee ? 'admin_parcelas_receber' : 'parcelas_contas_receber';
  const tabelaContasReceber = isAdminOrEmployee ? 'admin_contas_receber' : 'contas_receber';

  const [recebimentos, setRecebimentos] = useState<RecebimentoRaw[]>([]);
  const [lancamentos, setLancamentos] = useState<LancamentoDetalhe[]>([]);
  const [loading, setLoading] = useState(false);
  const [historicos, setHistoricos] = useState<Historico[]>([]);
  const [contasPatrimoniais, setContasPatrimoniais] = useState<PlanoContaItem[]>([]);
  const [contasResultado, setContasResultado] = useState<PlanoContaItem[]>([]);
  const [estornandoRecebimento, setEstornandoRecebimento] = useState<string | null>(null);
  const [novoRecebimentoDialogOpen, setNovoRecebimentoDialogOpen] = useState(false);
  const [lancamentoDialogOpen, setLancamentoDialogOpen] = useState(false);

  const { contas: contasDestino, refetch: refetchSaldos } = useSaldoContaCalculado('todos', 'todos', '', 'bancos');

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editValores, setEditValores] = useState<{
    data_recebimento: string;
    valor_recebido: string;
    conta_id: string;
    historico_id: string;
    conta_patrimonial_id: string;
    conta_resultado_id: string;
    forma_pagamento: string;
    observacao: string;
  }>({ data_recebimento: '', valor_recebido: '', conta_id: '', historico_id: '', conta_patrimonial_id: '', conta_resultado_id: '', forma_pagamento: '', observacao: '' });
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  const saldoRestante = parcela.valor_parcela - (parcela.valor_pago || 0);
  const cliente = parcela.contas_receber?.clientes?.nome || 'N/A';
  const descricao = parcela.contas_receber?.descricao || 'Conta a Receber';

  const carregarDados = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const [recebimentosRes, lancamentosRes, historicosRes, patrimonialRes, resultadoRes] = await Promise.all([
        supabase
          .from(tabelaRecebimentos)
          .select('id, data_recebimento, valor_recebido, forma_pagamento, observacao, conta_id, historico_id, saldo_contas(nome), historicos(descricao)')
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
        supabase.from('plano_contas').select('id, "Conta", "Descricao"').eq('proprietario_id', proprietarioId).eq('Analitica', 'Sim').eq('is_conta_patrimonial', true).eq('is_a_receber', true).order('Conta'),
        supabase.from('plano_contas').select('id, "Conta", "Descricao"').eq('proprietario_id', proprietarioId).eq('Analitica', 'Sim').eq('is_conta_resultado', true).order('Conta'),
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
      }));
      setRecebimentos(recebimentosMapped);
      setHistoricos((historicosRes.data || []).map((h: any) => ({ id: h.id, descricao: h.descricao, codigo: h.codigo || null })));
      setContasPatrimoniais((patrimonialRes.data || []) as PlanoContaItem[]);
      setContasResultado((resultadoRes.data || []) as PlanoContaItem[]);

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
    if (open) {
      refetchSaldos();
      carregarDados();
    }
  }, [open, carregarDados, refetchSaldos]);

  const abrirEdicao = (r: RecebimentoRaw) => {
    const dataStr = r.data_recebimento
      ? new Date(r.data_recebimento).toISOString().split('T')[0]
      : '';
    setEditValores({
      data_recebimento: dataStr,
      valor_recebido: String(r.valor_recebido),
      conta_id: r.conta_id || '',
      historico_id: r.historico_id || '',
      conta_patrimonial_id: parcela.contas_receber?.id_conta_patrimonial || '',
      conta_resultado_id: parcela.contas_receber?.id_conta_resultado || '',
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
          historico_id: editValores.historico_id || null,
          forma_pagamento: editValores.forma_pagamento || null,
          observacao: editValores.observacao || null,
        })
        .eq('id', recebimentoId);

      if (error) throw error;

      if (parcela.contas_receber?.id) {
        await supabase
          .from(tabelaContasReceber)
          .update({
            id_conta_patrimonial: editValores.conta_patrimonial_id || null,
            id_conta_resultado: editValores.conta_resultado_id || null,
          })
          .eq('id', parcela.contas_receber.id);
      }

      const diferenca = novoValor - valorAnterior;
      const novoValorPagoTotal = Math.max(0, (parcela.valor_pago || 0) + diferenca);
      const saldoAposEdicao = parcela.valor_parcela - novoValorPagoTotal;
      const novoStatus: string = saldoAposEdicao <= 0.01 ? 'paga' : (novoValorPagoTotal > 0 ? 'parcial' : 'aberta');

      await supabase
        .from(tabelaParcelas)
        .update({
          valor_pago: novoValorPagoTotal,
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
      const { data: parcelaData, error: parcelaError } = await supabase
        .from(tabelaParcelas)
        .select('conta_receber_id, valor_parcela, valor_pago')
        .eq('id', parcela.id)
        .single();
      if (parcelaError || !parcelaData) throw new Error('Parcela não encontrada.');

      const contaReceberId = parcelaData.conta_receber_id;
      const dataEstornoISO = new Date().toISOString();

      const { data: originalLaunches } = await supabase
        .from('lancamentos')
        .select('id, conta_resultado_id, conta_contabil_id, conta_bancaria_id, valor, tipo, descricao, historico_id, origem')
        .eq('proprietario_id', ownerId)
        .or(`documento.eq.${parcela.id},origem.ilike.%${parcela.id}%`)
        .not('origem', 'ilike', '%estornada%');

      const lancamentosEstornoPayload: any[] = [];
      for (const orig of (originalLaunches || []).filter((l: any) => l.origem?.startsWith('recebimento_manual'))) {
        lancamentosEstornoPayload.push({
          id: crypto.randomUUID(),
          proprietario_id: ownerId,
          data_movimentacao: dataEstornoISO,
          descricao: `ESTORNO: ${orig.descricao}`,
          valor: orig.valor,
          tipo: orig.tipo === 'Entrada' ? 'Saida' : 'Entrada',
          conta_bancaria_id: orig.conta_bancaria_id,
          conta_contabil_id: orig.conta_contabil_id,
          origem: 'estorno_recebimento_manual',
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
        await supabase.from('lancamentos').update({ origem: 'recebimento_manual_estornada' }).in('id', originalLaunchIds);
      }

      const { error: deleteRecError } = await supabase.from(tabelaRecebimentos).delete().eq('id', recebimentoId);
      if (deleteRecError) throw deleteRecError;

      const valorEstornado = recebimentos.find(r => r.id === recebimentoId)?.valor_recebido || 0;
      const novoValorPago = Math.max(0, (parcelaData.valor_pago || 0) - valorEstornado);
      const novoStatus = novoValorPago <= 0 ? 'aberta' : 'parcial';

      await supabase
        .from(tabelaParcelas)
        .update({
          status: novoStatus,
          valor_pago: novoValorPago,
          data_pagamento: novoValorPago <= 0 ? null : parcela.data_pagamento,
          observacao: 'Estorno de recebimento realizado.',
        })
        .eq('id', parcela.id);

      if (novoValorPago <= 0) {
        await supabase.from(tabelaContasReceber).update({ status: 'aberta' }).eq('id', contaReceberId);
      }

      showSuccess('Recebimento estornado com sucesso!');
      await carregarDados();
      onDataChange();
    } catch (error: any) {
      console.error('Erro ao estornar recebimento:', error);
      showError('Falha ao estornar: ' + error.message);
    } finally {
      setEstornandoRecebimento(null);
    }
  };

  const parcelaParaRecebimento = {
    id: parcela.id,
    conta_receber_id: parcela.contas_receber?.id || '',
    empresa_id: proprietarioId,
    valor_parcela: parcela.valor_parcela,
    valor_pago: parcela.valor_pago || 0,
    cliente_id: parcela.contas_receber?.cliente_id || null,
    status: parcela.status,
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes de Recebimento — Parcela {parcela.numero_parcela}</DialogTitle>
            <DialogDescription>{cliente} · {descricao}</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-3 gap-4 p-4 bg-secondary rounded-md text-sm">
            <div>
              <p className="text-muted-foreground">Valor da Parcela</p>
              <p className="text-lg font-bold">{formatCurrency(parcela.valor_parcela)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Total Recebido</p>
              <p className="text-lg font-bold text-green-600">{formatCurrency(parcela.valor_pago || 0)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Saldo Restante</p>
              <p className={`text-lg font-bold ${saldoRestante > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                {formatCurrency(saldoRestante)}
              </p>
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
                                  <SelectItem key={c.id} value={c.id}>{c.nome} ({c.tipo_saldo})</SelectItem>
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
                            <Label className="text-xs">Conta Patrimonial (A Receber)</Label>
                            <Select
                              value={editValores.conta_patrimonial_id || undefined}
                              onValueChange={val => setEditValores(v => ({ ...v, conta_patrimonial_id: val }))}
                              disabled={salvandoEdicao}
                            >
                              <SelectTrigger><SelectValue placeholder="Selecione a conta patrimonial" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__nenhum__">Nenhuma</SelectItem>
                                {contasPatrimoniais.map(c => (
                                  <SelectItem key={c.id} value={c.id}>{c.Conta} - {c.Descricao}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Conta Resultado (Receita)</Label>
                            <Select
                              value={editValores.conta_resultado_id || undefined}
                              onValueChange={val => setEditValores(v => ({ ...v, conta_resultado_id: val }))}
                              disabled={salvandoEdicao}
                            >
                              <SelectTrigger><SelectValue placeholder="Selecione a conta resultado" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__nenhum__">Nenhuma</SelectItem>
                                {contasResultado.map(c => (
                                  <SelectItem key={c.id} value={c.id}>{c.Conta} - {c.Descricao}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
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
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Estornar este recebimento"
                                disabled={estornandoRecebimento === r.id}
                              >
                                {estornandoRecebimento === r.id
                                  ? <Loader2 className="w-4 h-4 animate-spin" />
                                  : <Undo2 className="w-4 h-4 text-orange-500" />
                                }
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Estornar Recebimento</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Estornar {formatCurrency(r.valor_recebido)} recebido em {formatarData(r.data_recebimento)}? Os lançamentos contábeis serão revertidos.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleEstornarRecebimento(r.id)}>
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
              onClick={() => setNovoRecebimentoDialogOpen(true)}
              disabled={parcela.status === 'cancelada'}
            >
              <PlusCircle className="w-4 h-4 mr-2" />
              {saldoRestante > 0 ? 'Registrar Recebimento' : 'Novo Recebimento'}
            </Button>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {novoRecebimentoDialogOpen && (
        <RegistrarPagamentoDialog
          open={novoRecebimentoDialogOpen}
          onOpenChange={setNovoRecebimentoDialogOpen}
          parcela={parcelaParaRecebimento}
          onSaveComplete={() => {
            setNovoRecebimentoDialogOpen(false);
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
          contaPatrimonialId={parcela.contas_receber?.id_conta_patrimonial || null}
          contaResultadoId={parcela.contas_receber?.id_conta_resultado || null}
          onSaved={() => {
            setLancamentoDialogOpen(false);
            carregarDados();
            onDataChange();
          }}
        />
      )}
    </>
  );
};

export default DetalhesRecebimentoParcelaDialog;
