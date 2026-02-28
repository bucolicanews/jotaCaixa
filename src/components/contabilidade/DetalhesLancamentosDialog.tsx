import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, ArrowUpCircle, ArrowDownCircle, Printer, Wallet, Landmark, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Badge } from '../ui/badge';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';
import { usePrint } from '@/hooks/use-print';
import { SaldoContaDetalhada } from '@/types/saldo-conta';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../ui/alert-dialog';
import { useOwnerBranding } from '@/hooks/use-owner-branding';
import { useMonitoramentoContabil } from '@/hooks/useMonitoramentoContabil';

interface ContaContabil {
  id: string;
  Conta: string;
  Descricao: string;
}

interface LancamentoDC {
  lancamento_id: string;
  conta_contabil_id: string;
  conta_contabil?: ContaContabil | null;
  descricao: string;
  valor: number;
  tipo: 'Entrada' | 'Saida';
}

interface Lancamento {
  id: string;
  data_movimentacao: string;
  descricao: string;
  valor: number;
  tipo: 'Entrada' | 'Saida';
  origem?: string;
  fonte?: 'lancamento' | 'extrato';
  documento?: string | null;
  parcela_id?: string | null;
  tipo_parcela?: 'CR' | 'CP' | null;
  lancamento_par_id?: string | null;
  debito?: LancamentoDC | null;
  credito?: LancamentoDC | null;
}

interface DetalhesLancamentosDialogProps {
  conta: SaldoContaDetalhada | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const formatDate = (dateString: string) => {
  try {
    return format(parseISO(dateString), 'dd/MM/yyyy', { locale: ptBR });
  } catch {
    return dateString;
  }
};
const formatDateTime = (dateString: string) => {
  try {
    return format(parseISO(dateString), 'dd/MM/yyyy HH:mm', { locale: ptBR });
  } catch {
    return dateString;
  }
};

const DetalhesLancamentosDialog: React.FC<DetalhesLancamentosDialogProps> = ({ conta, open, onOpenChange }) => {
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [totalLancamentosContabeis, setTotalLancamentosContabeis] = useState(0);
  const [totalExtratosNaLista, setTotalExtratosNaLista] = useState(0);
  const [filtroLancamentos, setFiltroLancamentos] = useState<'todos' | 'contabil' | 'extrato'>('todos');
  const [loading, setLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const { printContent } = usePrint();
  const { logoUrl, ownerName } = useOwnerBranding();

  const mon = useMonitoramentoContabil(open && conta ? conta.id : null);

  const fetchLancamentos = useCallback(async () => {
    if (!conta) return;
    setLoading(true);

    const isCaixaBanco = conta.plano_contas?.is_conta_caixa_banco;

    let lancamentosResult: Lancamento[] = [];

    let query = supabase
      .from('lancamentos')
      .select('id, data_movimentacao, descricao, valor, tipo, origem, documento, conta_contabil_id, conta_resultado_id');

    if (isCaixaBanco) {
      query = query.eq('conta_bancaria_id', conta.id);
    } else if (conta.conta_contabil_id) {
      query = query.eq('conta_contabil_id', conta.conta_contabil_id);
    } else {
      setLancamentos([]);
      setLoading(false);
      return;
    }

    const { data, error } = await query.order('data_movimentacao', { ascending: false });

    if (error) {
      showError('Erro ao carregar lançamentos: ' + error.message);
      setLoading(false);
      return;
    }

    const lancamentosRaw: any[] = (data || []).filter(l => {
      const origem = l.origem || '';
      return !origem.toLowerCase().includes('estorn');
    });

    // Buscar todos os pares (conta_resultado_id) de uma só vez
    const idsParesNecessarios = lancamentosRaw
      .map(l => l.conta_resultado_id)
      .filter(Boolean) as string[];

    let paresMap: Record<string, any> = {};
    if (idsParesNecessarios.length > 0) {
      const { data: pares } = await supabase
        .from('lancamentos')
        .select('id, descricao, valor, tipo, conta_contabil_id')
        .in('id', idsParesNecessarios);
      if (pares) {
        pares.forEach((p: any) => { paresMap[p.id] = p; });
      }
    }

    // Coletar todos os conta_contabil_id para buscar os nomes de uma vez
    const todosContaIds = new Set<string>();
    lancamentosRaw.forEach(l => { if (l.conta_contabil_id) todosContaIds.add(l.conta_contabil_id); });
    Object.values(paresMap).forEach((p: any) => { if (p.conta_contabil_id) todosContaIds.add(p.conta_contabil_id); });

    let contasMap: Record<string, ContaContabil> = {};
    if (todosContaIds.size > 0) {
      const { data: contas } = await supabase
        .from('plano_contas')
        .select('id, Conta, Descricao')
        .in('id', Array.from(todosContaIds));
      if (contas) {
        contas.forEach((c: any) => { contasMap[c.id] = c; });
      }
    }

    lancamentosResult = lancamentosRaw.map(l => {
      const par = l.conta_resultado_id ? paresMap[l.conta_resultado_id] : null;

      // Determinar quem é débito (Entrada) e quem é crédito (Saida)
      const lado_atual: LancamentoDC = {
        lancamento_id: l.id,
        conta_contabil_id: l.conta_contabil_id,
        conta_contabil: contasMap[l.conta_contabil_id] || null,
        descricao: l.descricao,
        valor: parseFloat(l.valor) || 0,
        tipo: l.tipo,
      };
      const lado_par: LancamentoDC | null = par ? {
        lancamento_id: par.id,
        conta_contabil_id: par.conta_contabil_id,
        conta_contabil: contasMap[par.conta_contabil_id] || null,
        descricao: par.descricao,
        valor: parseFloat(par.valor) || 0,
        tipo: par.tipo,
      } : null;

      const debito = lado_atual.tipo === 'Entrada' ? lado_atual : lado_par;
      const credito = lado_atual.tipo === 'Saida' ? lado_atual : lado_par;

      const matchParcela = l.descricao?.match(/[Pp]arcela\s+([a-f0-9-]{8,36})/);
      const parcelaIdCurto = matchParcela ? matchParcela[1] : null;
      const tipoParcela: 'CR' | 'CP' | null =
        l.origem?.includes('cr') || l.descricao?.toLowerCase().includes('recebimento') ? 'CR'
        : l.origem?.includes('cp') || l.descricao?.toLowerCase().includes('pagamento') ? 'CP'
        : null;

      return {
        id: l.id,
        data_movimentacao: l.data_movimentacao,
        descricao: l.descricao,
        valor: parseFloat(l.valor) || 0,
        tipo: l.tipo as 'Entrada' | 'Saida',
        origem: l.origem,
        fonte: 'lancamento' as const,
        documento: l.documento,
        parcela_id: parcelaIdCurto,
        tipo_parcela: tipoParcela,
        lancamento_par_id: l.conta_resultado_id || null,
        debito,
        credito,
      };
    });

    if (isCaixaBanco) {
      const { data: extratoData, error: extratoError } = await supabase
        .from('extratos')
        .select('id, data, descricao, valor, tipo, id_parcela_rb, id_parcela_pg')
        .eq('id_saldo_contas', conta.id)
        .eq('conciliado', false)
        .order('data', { ascending: false });

      if (!extratoError && extratoData) {
        const idsExtratos = extratoData.map((e: any) => e.id);
        let vinculosMap: Record<string, { parcela_id: string; tipo_parcela: string }[]> = {};

        if (idsExtratos.length > 0) {
          const { data: vinculos } = await supabase
            .from('extrato_parcela_vinculo')
            .select('transacao_extrato_id, parcela_id, tipo_parcela')
            .in('transacao_extrato_id', idsExtratos);

          if (vinculos) {
            vinculos.forEach((v: any) => {
              if (!vinculosMap[v.transacao_extrato_id]) vinculosMap[v.transacao_extrato_id] = [];
              vinculosMap[v.transacao_extrato_id].push({ parcela_id: v.parcela_id, tipo_parcela: v.tipo_parcela });
            });
          }
        }

        const extratoLancamentos: Lancamento[] = extratoData.map((e: any) => {
          const vincs = vinculosMap[e.id] || [];
          const parcelaRb = e.id_parcela_rb as string | null;
          const parcelaPg = e.id_parcela_pg as string | null;
          const vinculado = vincs[0] || null;
          const parcelaIdFinal = vinculado?.parcela_id || parcelaRb || parcelaPg || null;
          const tipoParcela: 'CR' | 'CP' | null =
            vinculado ? (vinculado.tipo_parcela as 'CR' | 'CP')
            : parcelaRb ? 'CR'
            : parcelaPg ? 'CP'
            : null;

          const dataExtrato = e.data;
          const lancamentoPar = lancamentosResult.find(l =>
            l.fonte === 'lancamento' &&
            Math.abs(l.valor - Math.abs(parseFloat(e.valor))) < 0.01 &&
            l.data_movimentacao.startsWith(dataExtrato)
          );

          return {
            id: e.id,
            data_movimentacao: e.data + 'T00:00:00',
            descricao: e.descricao || 'Extrato bancário',
            valor: parseFloat(e.valor) || 0,
            tipo: e.tipo as 'Entrada' | 'Saida',
            fonte: 'extrato' as const,
            parcela_id: parcelaIdFinal,
            tipo_parcela: tipoParcela,
            lancamento_par_id: lancamentoPar?.id || null,
            debito: lancamentoPar?.debito || null,
            credito: lancamentoPar?.credito || null,
          };
        });

        lancamentosResult = [...lancamentosResult, ...extratoLancamentos];
        lancamentosResult.sort((a, b) => b.data_movimentacao.localeCompare(a.data_movimentacao));
      }
    }

    setLancamentos(lancamentosResult);
    setTotalLancamentosContabeis(lancamentosRaw.length);
    setTotalExtratosNaLista(lancamentosResult.filter(l => l.fonte === 'extrato').length);
    setLoading(false);
  }, [conta]);

  useEffect(() => {
    if (open) {
      fetchLancamentos();
      setFiltroLancamentos('todos');
    }
  }, [conta, open, fetchLancamentos]);

  const handleDeleteLancamento = async (lancamento: Lancamento) => {
    setIsDeleting(true);
    try {
      if (lancamento.documento) {
        showError('Não é possível excluir. Este lançamento está vinculado a uma parcela (CP/CR). Estorne o pagamento/recebimento antes de excluir.');
        setIsDeleting(false);
        return;
      }

      const { error } = await supabase
        .from('lancamentos')
        .delete()
        .eq('id', lancamento.id);

      if (error) throw error;

      showSuccess('Lançamento excluído com sucesso!');
      fetchLancamentos();
    } catch (error: any) {
      showError('Falha ao excluir lançamento: ' + error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const saldoInicial = conta?.saldo_inicial || 0;
  const totalEntradas = lancamentos.filter(l => l.tipo === 'Entrada').reduce((sum, l) => sum + l.valor, 0);
  const totalSaidas = lancamentos.filter(l => l.tipo === 'Saida').reduce((sum, l) => sum + l.valor, 0);
  const saldoFinal = saldoInicial + totalEntradas - totalSaidas;

  const handlePrint = (orientation: 'portrait' | 'landscape') => {
    if (!conta) {
      showError('Não há dados para imprimir.');
      return;
    }

    const printHtml = `
      <div class="print-header">
        ${logoUrl ? `<img src="${logoUrl}" alt="${ownerName}" class="print-logo" />` : ''}
        <div class="print-header-content">
            <h1>Extrato da Conta: ${conta.nome}</h1>
            <p>Empresa: ${ownerName} | Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</p>
        </div>
      </div>
      <div class="print-section">
        <h2 style="font-size: 14px; font-weight: bold;">Resumo</h2>
        <p>Saldo Inicial: ${formatCurrency(saldoInicial)}</p>
        <p>Total de Entradas: ${formatCurrency(totalEntradas)}</p>
        <p>Total de Saídas: ${formatCurrency(totalSaidas)}</p>
        <p style="font-weight: bold;">Saldo Final: ${formatCurrency(saldoFinal)}</p>
      </div>
      <div class="print-section">
        <h2 style="font-size: 14px; font-weight: bold;">Lançamentos</h2>
        <table class="print-table">
          <thead>
            <tr>
              <th style="width: 20%;">Data</th>
              <th style="width: 50%;">Descrição</th>
              <th style="width: 15%;">Tipo</th>
              <th style="width: 15%; text-align: right;">Valor</th>
            </tr>
          </thead>
          <tbody>
            ${lancamentos.map(l => `
              <tr>
                <td>${formatDateTime(l.data_movimentacao)}</td>
                <td>${l.descricao}</td>
                <td>${l.tipo}</td>
                <td style="text-align: right; color: ${l.tipo === 'Entrada' ? 'green' : 'red'};">${formatCurrency(l.valor)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    printContent(printHtml, `Extrato - ${conta.nome}`, orientation);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[92vw] max-h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Extrato da Conta: {conta?.nome}</DialogTitle>
          <DialogDescription>
            Movimentações, vínculos de parcelas e lançamentos contábeis desta conta.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center items-center h-40">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 my-2">
              <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <h4 className="text-xs font-medium text-muted-foreground flex items-center"><Wallet className="w-3 h-3 mr-1" />Saldo Inicial</h4>
                <p className="text-lg font-bold mt-1">{formatCurrency(saldoInicial)}</p>
              </div>
              <div className="p-3 bg-green-100 dark:bg-green-900/20 rounded-lg">
                <h4 className="text-xs font-medium text-green-700 dark:text-green-300 flex items-center"><ArrowUpCircle className="w-3 h-3 mr-1" />Entradas</h4>
                <p className="text-lg font-bold text-green-600 dark:text-green-400 mt-1">{formatCurrency(totalEntradas)}</p>
              </div>
              <div className="p-3 bg-red-100 dark:bg-red-900/20 rounded-lg">
                <h4 className="text-xs font-medium text-red-700 dark:text-red-300 flex items-center"><ArrowDownCircle className="w-3 h-3 mr-1" />Saídas</h4>
                <p className="text-lg font-bold text-red-600 dark:text-red-400 mt-1">{formatCurrency(totalSaidas)}</p>
              </div>
              <div className={cn("p-3 rounded-lg", saldoFinal >= 0 ? "bg-blue-100 dark:bg-blue-900/20" : "bg-red-100 dark:bg-red-900/20")}>
                <h4 className="text-xs font-medium flex items-center" style={{ color: saldoFinal >= 0 ? 'var(--color-blue-700)' : 'var(--color-red-700)' }}><Landmark className="w-3 h-3 mr-1" />Saldo Final</h4>
                <p className={cn("text-lg font-bold mt-1", saldoFinal >= 0 ? "text-blue-600 dark:text-blue-400" : "text-red-600 dark:text-red-400")}>{formatCurrency(saldoFinal)}</p>
              </div>
            </div>

            <Tabs defaultValue="lancamentos" className="flex-1 flex flex-col min-h-0">
              <TabsList className="w-full justify-start">
                <TabsTrigger value="lancamentos">
                  <button
                    className={`text-xs px-2 py-0.5 rounded transition-colors ${filtroLancamentos === 'todos' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'}`}
                    onClick={(e) => { e.stopPropagation(); setFiltroLancamentos('todos'); }}
                  >
                    Todos
                  </button>
                  <button
                    className={`ml-1 text-xs px-2 py-0.5 rounded transition-colors ${filtroLancamentos === 'contabil' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'}`}
                    onClick={(e) => { e.stopPropagation(); setFiltroLancamentos('contabil'); }}
                  >
                    {totalLancamentosContabeis} contábeis
                  </button>
                  {totalExtratosNaLista > 0 && (
                    <button
                      className={`ml-1 text-xs px-2 py-0.5 rounded transition-colors ${filtroLancamentos === 'extrato' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'}`}
                      onClick={(e) => { e.stopPropagation(); setFiltroLancamentos('extrato'); }}
                    >
                      {totalExtratosNaLista} extratos
                    </button>
                  )}
                </TabsTrigger>
                <TabsTrigger value="extratos">
                  Extratos e Vínculos
                  {mon.totalExtratosSemVinculo > 0 && (
                    <Badge variant="destructive" className="ml-2 text-xs">{mon.totalExtratosSemVinculo} sem vínculo</Badge>
                  )}
                  {mon.totalExtratosSemVinculo === 0 && mon.totalExtratos > 0 && (
                    <Badge variant="success" className="ml-2 text-xs">ok</Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="parcelas">
                  Parcelas
                  {mon.parcelasMonitoradas.length > 0 && (
                    <Badge variant="secondary" className="ml-2 text-xs">{mon.parcelasMonitoradas.length}</Badge>
                  )}
                  {mon.parcelasSemVinculo.length > 0 && (
                    <Badge variant="warning" className="ml-2 text-xs">{mon.parcelasSemVinculo.length} sem extrato</Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              {/* ABA: LANÇAMENTOS */}
              <TabsContent value="lancamentos" className="flex-1 flex flex-col min-h-0 mt-2">
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                  <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-green-200/70 text-xs text-green-900 dark:bg-green-900/40 dark:text-green-200">
                    <CheckCircle2 className="w-3 h-3" /> parcela + lançamento contábil + extrato bancário
                  </span>
                  <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-orange-200/70 text-xs text-orange-900 dark:bg-orange-900/40 dark:text-orange-200">
                    <AlertCircle className="w-3 h-3" /> parcela + apenas lançamento OU extrato
                  </span>
                  <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-red-200/70 text-xs text-red-900 dark:bg-red-900/40 dark:text-red-200">
                    <AlertCircle className="w-3 h-3" /> parcela sem nenhum vínculo
                  </span>
                  <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-muted text-xs text-muted-foreground">
                    sem parcela associada
                  </span>
                  <span className="flex items-center gap-1.5 px-2 py-0.5 rounded border text-xs text-muted-foreground">
                    <CheckCircle2 className="w-3 h-3 text-blue-500" /> consolidada = parcela com <code className="mx-0.5">vinculada_extrato=true</code> no financeiro
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto border rounded-md">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <TableHead className="w-[10%]">Data</TableHead>
                      <TableHead className="w-[18%]">Descrição</TableHead>
                      <TableHead className="w-[7%]">Tipo</TableHead>
                      <TableHead className="w-[9%]">Parcela</TableHead>
                      <TableHead className="w-[8%]">Extrato</TableHead>
                      <TableHead className="w-[8%]">Consolid.</TableHead>
                      <TableHead className="w-[16%]">D: Débito</TableHead>
                      <TableHead className="w-[16%]">C: Crédito</TableHead>
                      <TableHead className="w-[8%] text-right">Valor</TableHead>
                      <TableHead className="w-[5%]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(() => {
                      const lista = lancamentos.filter(l => {
                        if (filtroLancamentos === 'contabil') return l.fonte === 'lancamento';
                        if (filtroLancamentos === 'extrato') return l.fonte === 'extrato';
                        return true;
                      });
                      if (lista.length === 0) return (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                            Nenhum lançamento encontrado para esta conta.
                          </TableCell>
                        </TableRow>
                      );
                      return lista.map((l) => {
                        // Determinar status de vínculo para cor de fundo
                        const pm = l.parcela_id
                          ? mon.parcelasMonitoradas.find(p => p.parcela_id.startsWith(l.parcela_id!) || l.parcela_id!.startsWith(p.parcela_id))
                          : null;
                        const temLancamentoContabil = l.fonte === 'lancamento' || !!l.lancamento_par_id;
                        const temExtratoBancario = l.fonte === 'extrato' || (pm && (pm.origem === 'extrato_vinculo' || !!pm.extrato_id));
                        const temParcela = !!l.parcela_id;

                        let rowBg = '';
                        if (temParcela) {
                          if (temLancamentoContabil && temExtratoBancario) {
                            rowBg = 'bg-green-200/70 dark:bg-green-900/40';
                          } else if (temLancamentoContabil || temExtratoBancario) {
                            rowBg = 'bg-orange-200/70 dark:bg-orange-900/40';
                          } else {
                            rowBg = 'bg-red-200/70 dark:bg-red-900/40';
                          }
                        }

                        return (
                        <TableRow key={l.id} className={rowBg}>
                          <TableCell className="text-xs">{formatDateTime(l.data_movimentacao)}</TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-xs">{l.descricao}</span>
                              {l.fonte === 'extrato' && (
                                <span className="text-xs text-muted-foreground italic">Extrato (não conciliado)</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={l.tipo === 'Entrada' ? 'success' : 'destructive'} className="flex items-center w-fit text-xs">
                              {l.tipo === 'Entrada' ? <ArrowUpCircle className="w-3 h-3 mr-1" /> : <ArrowDownCircle className="w-3 h-3 mr-1" />}
                              {l.tipo === 'Entrada' ? 'Entrada' : 'Saída'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {l.parcela_id ? (
                              <div className="flex items-center gap-1">
                                {l.tipo_parcela && (
                                  <Badge variant={l.tipo_parcela === 'CR' ? 'success' : 'warning'} className="text-xs shrink-0">
                                    {l.tipo_parcela}
                                  </Badge>
                                )}
                                <span className="text-xs font-mono text-muted-foreground" title={l.parcela_id}>
                                  {l.parcela_id.slice(0, 8)}
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {l.parcela_id ? (
                              temExtratoBancario ? (
                                <div className="flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3 text-green-600 shrink-0" />
                                  <span className="text-xs text-green-700 dark:text-green-400">ok</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3 text-amber-500 shrink-0" />
                                  <span className="text-xs text-amber-700 dark:text-amber-400">sem extrato</span>
                                </div>
                              )
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {l.parcela_id ? (() => {
                              const pmC = mon.parcelasMonitoradas.find(p => p.parcela_id.startsWith(l.parcela_id!) || l.parcela_id!.startsWith(p.parcela_id));
                              if (!pmC) return <span className="text-xs text-muted-foreground">—</span>;
                              if (pmC.consolidada) return (
                                <div className="flex flex-col gap-0.5">
                                  <div className="flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3 text-blue-600 shrink-0" />
                                    <span className="text-xs text-blue-700 dark:text-blue-400 font-semibold">{pmC.status_parcela || 'paga'}</span>
                                  </div>
                                  {pmC.valor_vinculado != null && pmC.valor_vinculado > 0 && (
                                    <span className="text-xs text-muted-foreground">R$ {pmC.valor_vinculado.toFixed(2)}</span>
                                  )}
                                </div>
                              );
                              return (
                                <div className="flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3 text-gray-400 shrink-0" />
                                  <span className="text-xs text-muted-foreground">pendente</span>
                                </div>
                              );
                            })() : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {l.debito ? (
                              <div className="flex flex-col gap-0.5">
                                <span className="text-xs font-mono text-blue-700 dark:text-blue-400 font-semibold">
                                  {l.debito.conta_contabil?.Conta || l.debito.conta_contabil_id.slice(0, 8)}
                                </span>
                                <span className="text-xs text-muted-foreground leading-tight">
                                  {l.debito.conta_contabil?.Descricao || '—'}
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {l.credito ? (
                              <div className="flex flex-col gap-0.5">
                                <span className="text-xs font-mono text-orange-700 dark:text-orange-400 font-semibold">
                                  {l.credito.conta_contabil?.Conta || l.credito.conta_contabil_id.slice(0, 8)}
                                </span>
                                <span className="text-xs text-muted-foreground leading-tight">
                                  {l.credito.conta_contabil?.Descricao || '—'}
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className={cn("text-right font-semibold text-xs", l.tipo === 'Entrada' ? 'text-green-600' : 'text-red-600')}>
                            {formatCurrency(l.valor)}
                          </TableCell>
                          <TableCell className="text-right">
                            {l.fonte !== 'extrato' && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon" disabled={isDeleting} title="Excluir Lançamento">
                                    <Trash2 className="w-4 h-4 text-red-500" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Tem certeza que deseja excluir?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Esta ação irá remover permanentemente este lançamento do extrato e recalcular o saldo da conta.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDeleteLancamento(l)} disabled={isDeleting}>
                                      {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Excluir'}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </TableCell>
                        </TableRow>
                        );
                      });
                    })()}
                  </TableBody>
                </Table>
                </div>
              </TabsContent>

              {/* ABA: EXTRATOS E VÍNCULOS */}
              <TabsContent value="extratos" className="flex-1 overflow-y-auto mt-2 space-y-3">
                {mon.loading ? (
                  <div className="flex justify-center items-center h-32">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : (
                  <>
                    <div className="flex gap-3 text-sm flex-wrap">
                      <div className="flex items-center gap-1 bg-muted/50 rounded px-2 py-1">
                        <span className="text-muted-foreground">Total:</span>
                        <span className="font-semibold">{mon.totalExtratos}</span>
                      </div>
                      <div className="flex items-center gap-1 bg-green-50 dark:bg-green-900/20 rounded px-2 py-1">
                        <CheckCircle2 className="w-3 h-3 text-green-600" />
                        <span className="text-green-700 dark:text-green-300">Vinculados:</span>
                        <span className="font-semibold text-green-700 dark:text-green-300">{mon.totalExtratosVinculados}</span>
                      </div>
                      <div className="flex items-center gap-1 bg-red-50 dark:bg-red-900/20 rounded px-2 py-1">
                        <AlertCircle className="w-3 h-3 text-red-600" />
                        <span className="text-red-700 dark:text-red-300">Sem vínculo:</span>
                        <span className="font-semibold text-red-700 dark:text-red-300">{mon.totalExtratosSemVinculo}</span>
                      </div>
                    </div>

                    {mon.totalExtratosSemVinculo > 0 && (
                      <div className="border rounded-md">
                        <div className="px-3 py-2 bg-red-50 dark:bg-red-900/20 border-b flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 text-red-600" />
                          <span className="text-sm font-semibold text-red-700 dark:text-red-300">
                            Extratos SEM VÍNCULO ({mon.totalExtratosSemVinculo})
                          </span>
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[15%]">Data</TableHead>
                              <TableHead className="w-[40%]">Descrição</TableHead>
                              <TableHead className="w-[12%]">Tipo</TableHead>
                              <TableHead className="w-[15%] text-right">Valor</TableHead>
                              <TableHead className="w-[18%]">Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {mon.extratosSemVinculo.map(e => (
                              <TableRow key={e.id} className="bg-red-50/30 dark:bg-red-900/10">
                                <TableCell className="text-xs">{formatDate(e.data)}</TableCell>
                                <TableCell className="text-xs">{e.descricao}</TableCell>
                                <TableCell>
                                  <Badge variant={e.tipo === 'Entrada' ? 'success' : 'destructive'} className="text-xs">
                                    {e.tipo}
                                  </Badge>
                                </TableCell>
                                <TableCell className={cn("text-right text-xs font-medium", e.tipo === 'Entrada' ? 'text-green-600' : 'text-red-600')}>
                                  {formatCurrency(e.valor)}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="destructive" className="text-xs">SEM VÍNCULO</Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}

                    {mon.totalExtratosVinculados > 0 && (
                      <div className="border rounded-md">
                        <div className="px-3 py-2 bg-green-50 dark:bg-green-900/20 border-b flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                          <span className="text-sm font-semibold text-green-700 dark:text-green-300">
                            Extratos VINCULADOS ({mon.totalExtratosVinculados})
                          </span>
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[15%]">Data</TableHead>
                              <TableHead className="w-[35%]">Descrição</TableHead>
                              <TableHead className="w-[12%]">Tipo</TableHead>
                              <TableHead className="w-[13%] text-right">Valor</TableHead>
                              <TableHead className="w-[25%]">Parcelas Vinculadas</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {mon.extratosVinculados.map(e => {
                              const parcelas = mon.parcelasVinculadas.filter(p => p.transacao_extrato_id === e.id);
                              return (
                                <TableRow key={e.id}>
                                  <TableCell className="text-xs">{formatDate(e.data)}</TableCell>
                                  <TableCell className="text-xs">{e.descricao}</TableCell>
                                  <TableCell>
                                    <Badge variant={e.tipo === 'Entrada' ? 'success' : 'destructive'} className="text-xs">
                                      {e.tipo}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className={cn("text-right text-xs font-medium", e.tipo === 'Entrada' ? 'text-green-600' : 'text-red-600')}>
                                    {formatCurrency(e.valor)}
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex flex-wrap gap-1">
                                      {parcelas.map(p => (
                                        <Badge
                                          key={p.parcela_id}
                                          variant={p.tipo_parcela === 'CR' ? 'success' : 'warning'}
                                          className="text-xs font-mono"
                                          title={`ID: ${p.parcela_id} | R$ ${p.valor_aplicado.toFixed(2)}`}
                                        >
                                          {p.tipo_parcela} · {p.parcela_id.slice(0, 8)}
                                        </Badge>
                                      ))}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}

                    {mon.totalExtratos === 0 && (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        Nenhum extrato encontrado para esta conta.
                      </div>
                    )}
                  </>
                )}
              </TabsContent>

              {/* ABA: PARCELAS */}
              <TabsContent value="parcelas" className="flex-1 overflow-y-auto mt-2 space-y-3">
                {mon.loading ? (
                  <div className="flex justify-center items-center h-32">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : (
                  <>
                    <div className="flex gap-3 text-sm flex-wrap">
                      <div className="flex items-center gap-1 bg-green-50 dark:bg-green-900/20 rounded px-2 py-1">
                        <CheckCircle2 className="w-3 h-3 text-green-600" />
                        <span className="text-green-700 dark:text-green-300">Total monitoradas:</span>
                        <span className="font-semibold text-green-700 dark:text-green-300">{mon.parcelasMonitoradas.length}</span>
                      </div>
                      <div className="flex items-center gap-1 bg-blue-50 dark:bg-blue-900/20 rounded px-2 py-1">
                        <CheckCircle2 className="w-3 h-3 text-blue-600" />
                        <span className="text-blue-700 dark:text-blue-300">Via extrato:</span>
                        <span className="font-semibold text-blue-700 dark:text-blue-300">{mon.parcelasMonitoradas.filter(p => p.origem === 'extrato_vinculo').length}</span>
                      </div>
                      <div className="flex items-center gap-1 bg-amber-50 dark:bg-amber-900/20 rounded px-2 py-1">
                        <AlertCircle className="w-3 h-3 text-amber-600" />
                        <span className="text-amber-700 dark:text-amber-300">Sem extrato vinculado:</span>
                        <span className="font-semibold text-amber-700 dark:text-amber-300">{mon.parcelasSemVinculo.length}</span>
                      </div>
                    </div>

                    {mon.parcelasMonitoradas.length > 0 && (
                      <div className="border rounded-md">
                        <div className="px-3 py-2 bg-muted/50 border-b flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                          <span className="text-sm font-semibold">
                            Todas as Parcelas desta Conta ({mon.parcelasMonitoradas.length})
                          </span>
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[18%]">ID da Parcela</TableHead>
                              <TableHead className="w-[7%]">Tipo</TableHead>
                              <TableHead className="w-[12%] text-right">Valor</TableHead>
                              <TableHead className="w-[10%]">Data</TableHead>
                              <TableHead className="w-[15%]">Lançamento</TableHead>
                              <TableHead className="w-[15%]">Extrato Bancário</TableHead>
                              <TableHead className="w-[23%]">Descrição</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {mon.parcelasMonitoradas.map((p, idx) => {
                              const temExtrato = p.origem === 'extrato_vinculo' || !!p.extrato_id;
                              return (
                              <TableRow key={`${p.parcela_id}-${idx}`} className={!temExtrato ? 'bg-amber-50/40 dark:bg-amber-900/10' : ''}>
                                <TableCell className="text-xs font-mono font-semibold">{p.parcela_id.slice(0, 8)}</TableCell>
                                <TableCell>
                                  <Badge variant={p.tipo_parcela === 'CR' ? 'success' : 'warning'} className="text-xs">
                                    {p.tipo_parcela}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right text-xs font-medium">
                                  {formatCurrency(p.valor)}
                                </TableCell>
                                <TableCell className="text-xs">
                                  {p.data_lancamento ? formatDate(p.data_lancamento) : p.data_vencimento ? formatDate(p.data_vencimento) : '—'}
                                </TableCell>
                                <TableCell>
                                  {p.lancamento_id ? (
                                    <div className="flex items-center gap-1">
                                      <CheckCircle2 className="w-3 h-3 text-green-600 shrink-0" />
                                      <span className="text-xs font-mono text-muted-foreground" title={p.lancamento_id}>{p.lancamento_id.slice(0, 8)}…</span>
                                    </div>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {temExtrato && p.extrato_id ? (
                                    <div className="flex items-center gap-1">
                                      <CheckCircle2 className="w-3 h-3 text-green-600 shrink-0" />
                                      <span className="text-xs font-mono text-muted-foreground" title={p.extrato_id}>{p.extrato_id.slice(0, 8)}…</span>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1">
                                      <AlertCircle className="w-3 h-3 text-amber-600 shrink-0" />
                                      <span className="text-xs text-amber-700 dark:text-amber-400 font-semibold">Sem extrato</span>
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground truncate max-w-[160px]" title={p.lancamento_descricao}>
                                  {p.lancamento_descricao || '—'}
                                </TableCell>
                              </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}

                    {mon.parcelasSemVinculo.length > 0 && (
                      <div className="border rounded-md">
                        <div className="px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border-b flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 text-amber-600" />
                          <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                            Sem extrato vinculado — lançadas sem conciliação ({mon.parcelasSemVinculo.length})
                          </span>
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[18%]">ID da Parcela</TableHead>
                              <TableHead className="w-[7%]">Tipo</TableHead>
                              <TableHead className="w-[12%] text-right">Valor</TableHead>
                              <TableHead className="w-[12%]">Data Lanç.</TableHead>
                              <TableHead className="w-[51%]">Lançamento</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {mon.parcelasSemVinculo.map((p, idx) => (
                              <TableRow key={`sem-${p.parcela_id}-${idx}`} className="bg-amber-50/30 dark:bg-amber-900/10">
                                <TableCell className="text-xs font-mono font-semibold">{p.parcela_id}</TableCell>
                                <TableCell>
                                  <Badge variant={p.tipo_parcela === 'CR' ? 'success' : 'warning'} className="text-xs">
                                    {p.tipo_parcela}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right text-xs font-medium">
                                  {formatCurrency(p.valor)}
                                </TableCell>
                                <TableCell className="text-xs">
                                  {p.data_lancamento ? formatDate(p.data_lancamento) : '—'}
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {p.lancamento_id && (
                                    <div className="flex flex-col gap-0.5">
                                      <span className="font-mono" title={p.lancamento_id}>{p.lancamento_id.slice(0, 8)}…</span>
                                      {p.lancamento_descricao && (
                                        <span className="truncate max-w-[280px]" title={p.lancamento_descricao}>{p.lancamento_descricao}</span>
                                      )}
                                    </div>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}

                    {mon.parcelasMonitoradas.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        Nenhuma parcela encontrada para esta conta.
                      </div>
                    )}
                  </>
                )}
              </TabsContent>
            </Tabs>

            <div className="flex justify-end space-x-2 pt-3 border-t">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    <Printer className="w-4 h-4 mr-2" /> Imprimir Extrato
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handlePrint('portrait')}>
                    Imprimir (Retrato)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handlePrint('landscape')}>
                    Imprimir (Paisagem)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button onClick={() => onOpenChange(false)} variant="secondary">
                Fechar
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default DetalhesLancamentosDialog;
