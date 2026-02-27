import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatarData } from '@/utils/formatters';
import { ContaReceber } from '@/types/contas-receber';
import { showError, showSuccess } from '@/utils/toast';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { cn } from '@/lib/utils';
import { Card, CardContent } from './ui/card';
import { Progress } from './ui/progress';
import FormParcelaReceberDialog from './formularios/FormParcelaReceberDialog';
import EditarParcelaPagaDialog from '@/components/contas-receber/EditarParcelaPagaDialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './ui/alert-dialog';
import { Loader2, BadgeDollarSign, DollarSign, Edit, Trash2, Undo2, Unlink, BookOpen } from 'lucide-react';
import RegistrarPagamentoDialog from '@/components/contas-receber/RegistrarPagamentoDialog';
import { Badge } from '@/components/ui/badge';
import { desvincularMapeamento } from '@/hooks/conciliacao/useMapeamentoParcelas';
import LancamentoContabilDialog from '@/components/contabilidade/LancamentoContabilDialog';
import DetalhesRecebimentoParcelaDialog from '@/components/contas-receber/DetalhesRecebimentoParcelaDialog';
import { useOwner } from '@/hooks/use-owner';

// Interface ParcelaParaPagamento copiada de RegistrarPagamentoDialog.tsx
interface ParcelaParaPagamento {
  id: string;
  conta_receber_id: string;
  empresa_id: string;
  valor_parcela: number;
  valor_pago: number;
  cliente_id: string | null;
}

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

interface DetalhesParcelasDialogProps {
  conta: ContaReceber | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDataChange: () => void;
}

interface LancamentoResumo { tipo: string; conta_codigo: string; conta_descricao: string; origem: string | null; }

const DetalhesParcelasDialog: React.FC<DetalhesParcelasDialogProps> = ({ conta, open, onOpenChange, onDataChange }) => {
  const { role, usuario, perfil } = useSessao();
  const { ownerId } = useOwner();
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagamentoDialogOpen, setPagamentoDialogOpen] = useState(false);
  const [parcelaSelecionada, setParcelaSelecionada] = useState<ParcelaParaPagamento | null>(null);
  
  // Estados para edição
  const [edicaoDialogOpen, setEdicaoDialogOpen] = useState(false);
  const [parcelaParaEdicao, setParcelaParaEdicao] = useState<Parcela | null>(null);
  const [editarPagaDialogOpen, setEditarPagaDialogOpen] = useState(false);
  const [parcelaIdParaEditarPaga, setParcelaIdParaEditarPaga] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUnlinking, setIsUnlinking] = useState(false);
  const [parcelasComLancamento, setParcelasComLancamento] = useState<Set<string>>(new Set());
  const [lancamentoDialog, setLancamentoDialog] = useState<{ open: boolean; parcela: Parcela | null }>({ open: false, parcela: null });
  const [detalhesRecebimentoDialog, setDetalhesRecebimentoDialog] = useState<{ open: boolean; parcela: Parcela | null }>({ open: false, parcela: null });

  const [lancamentosPorParcela, setLancamentosPorParcela] = useState<Record<string, LancamentoResumo[]>>({});

  // Determina a tabela correta com base na role (Admin direto OU funcionário do admin)
  const isDirectAdmin = role === 'Admin';
  const adminIdFromProfile = (perfil as any)?.admin_id ?? null;
  const isAdminUsuario = role === 'Usuario' && !!adminIdFromProfile;
  const isAdminOrEmployee = isDirectAdmin || isAdminUsuario;
  const tabelaParcelas = isAdminOrEmployee ? 'admin_parcelas_receber' : 'parcelas_contas_receber';
  const tabelaRecebimentos = isAdminOrEmployee ? 'admin_recebimentos' : 'recebimentos';
  const tabelaContasReceber = isAdminOrEmployee ? 'admin_contas_receber' : 'contas_receber';

  const fetchParcelas = useCallback(async () => {
    if (!conta) return;
    setLoading(true);
    
    const { data, error } = await supabase
      .from(tabelaParcelas)
      .select('*')
      .eq('conta_receber_id', conta.id)
      .order('numero_parcela', { ascending: true });

    if (error) {
      showError('Erro ao carregar parcelas: ' + error.message);
      setParcelas([]);
    } else {
      setParcelas(data as Parcela[]);
    }
    setLoading(false);
  }, [conta, tabelaParcelas]);

  useEffect(() => {
    if (open) {
      fetchParcelas();
    }
  }, [conta, open, fetchParcelas]);

  useEffect(() => {
    if (!open || parcelas.length === 0 || !usuario?.id || !ownerId) return;
    const carregarLancamentos = async () => {
      const ids = parcelas.map(p => p.id);

      // Query 1: por documento (lançamentos novos)
      const { data: porDocumento } = await supabase
        .from('lancamentos')
        .select('documento, tipo, conta_contabil_id, origem')
        .eq('proprietario_id', ownerId)
        .in('documento', ids)
        .not('origem', 'ilike', '%estornada%');

      // Query 2: fallback por origem contendo o ID (lançamentos antigos sem documento)
      const idsComLancamento = new Set((porDocumento || []).map(l => l.documento).filter(Boolean));
      const idsNaoEncontrados = ids.filter(id => !idsComLancamento.has(id));
      let porOrigem: any[] = [];
      if (idsNaoEncontrados.length > 0) {
        const orFiltros = idsNaoEncontrados.map(id => `origem.ilike.%${id}%`).join(',');
        const { data: fallback } = await supabase
          .from('lancamentos')
          .select('documento, tipo, conta_contabil_id, origem')
          .eq('proprietario_id', ownerId)
          .or(orFiltros)
          .not('origem', 'ilike', '%estornada%');
        porOrigem = fallback || [];
      }

      const lancamentosData = [...(porDocumento || []), ...porOrigem];

      // Monta contasMap a partir de plano_contas
      const contaIds = [...new Set(lancamentosData.map((l: any) => l.conta_contabil_id).filter(Boolean))];
      let contasMap: Record<string, { Conta: string; Descricao: string }> = {};
      if (contaIds.length > 0) {
        const { data: contasData } = await supabase
          .from('plano_contas')
          .select('id, "Conta", "Descricao"')
          .in('id', contaIds);
        (contasData || []).forEach((c: any) => { contasMap[c.id] = c; });
      }

      const agrupado: Record<string, LancamentoResumo[]> = {};

      // Preenche lançamentos reais
      for (const l of lancamentosData as any[]) {
        const parcelaId = l.documento || ids.find(id => l.origem?.includes(id));
        if (!parcelaId) continue;
        if (!agrupado[parcelaId]) agrupado[parcelaId] = [];
        agrupado[parcelaId].push({
          tipo: l.tipo,
          conta_codigo: contasMap[l.conta_contabil_id]?.Conta || '',
          conta_descricao: contasMap[l.conta_contabil_id]?.Descricao || '',
          origem: l.origem,
        });
      }

      // Fallback: parcelas pagas sem lançamento — busca em admin_recebimentos
      const idsSemLancamento = ids.filter(id => !agrupado[id] && parcelas.find(p => p.id === id && (p.status === 'paga' || p.status === 'parcial')));
      if (idsSemLancamento.length > 0) {
        const tabelaRec = isAdminOrEmployee ? 'admin_recebimentos' : 'recebimentos';
        const { data: recebimentos } = await supabase
          .from(tabelaRec)
          .select('parcela_id, conta_id, saldo_contas(nome)')
          .in('parcela_id', idsSemLancamento);

        if (recebimentos) {
          // Busca conta patrimonial via conta sintética
          const contaPatrimonialId = (conta as any)?.id_conta_patrimonial;
          let contaPatrimonialNome = '';
          let contaPatrimonialCodigo = '';
          if (contaPatrimonialId) {
            const { data: pcData } = await supabase
              .from('plano_contas')
              .select('id, "Conta", "Descricao"')
              .eq('id', contaPatrimonialId)
              .single();
            if (pcData) {
              contaPatrimonialCodigo = (pcData as any).Conta || '';
              contaPatrimonialNome = (pcData as any).Descricao || '';
            }
          }

          for (const r of recebimentos as any[]) {
            const pid = r.parcela_id;
            if (!pid) continue;
            if (!agrupado[pid]) agrupado[pid] = [];
            // D: Banco/Caixa (Entrada)
            agrupado[pid].push({
              tipo: 'Entrada',
              conta_codigo: '',
              conta_descricao: r.saldo_contas?.nome || '',
              origem: 'recebimento_recebimentos',
            });
            // C: Conta Patrimonial (Saída)
            if (contaPatrimonialId) {
              agrupado[pid].push({
                tipo: 'Saida',
                conta_codigo: contaPatrimonialCodigo,
                conta_descricao: contaPatrimonialNome,
                origem: 'recebimento_recebimentos',
              });
            }
          }
        }
      }

      setParcelasComLancamento(new Set(
        lancamentosData.filter(l => ['lancamento_manual_cp', 'lancamento_manual_cr'].includes(l.origem || '')).map(l => l.documento).filter(Boolean) as string[]
      ));
      setLancamentosPorParcela(agrupado);
    };
    carregarLancamentos();
  }, [parcelas, open, usuario?.id, ownerId, isAdminOrEmployee, conta]);

  const handleOpenPagamento = (parcela: Parcela) => {
    if (!conta) return;
    
    const mappedParcela: ParcelaParaPagamento = {
        id: parcela.id,
        conta_receber_id: parcela.conta_receber_id,
        empresa_id: parcela.empresa_id,
        valor_parcela: parcela.valor_parcela,
        valor_pago: parcela.valor_pago,
        cliente_id: conta.cliente_id, // <-- Injetando o cliente_id da ContaReceber
    };
    
    setParcelaSelecionada(mappedParcela);
    setPagamentoDialogOpen(true);
  };
  
  const handleOpenEdicao = (parcela: Parcela) => {
      if (parcela.status === 'paga') {
          setParcelaIdParaEditarPaga(parcela.id);
          setEditarPagaDialogOpen(true);
          return;
      }
      if (parcela.status === 'cancelada' || parcela.status === 'bloqueada') {
          showError('Não é possível editar parcelas canceladas ou bloqueadas.');
          return;
      }
      setParcelaParaEdicao(parcela);
      setEdicaoDialogOpen(true);
  };

  const handlePagamentoCompleto = () => {
    setPagamentoDialogOpen(false);
    fetchParcelas(); // Re-busca as parcelas deste dialog
    onDataChange(); // Avisa a página principal para re-buscar tudo
  };
  
  const handleEdicaoCompleta = () => {
      setEdicaoDialogOpen(false);
      fetchParcelas();
      onDataChange();
  };
  
  const handleDeleteParcela = async (parcelaId: string) => {
      setIsDeleting(true);
      try {
          // 1. Verificar se há recebimentos associados (Admin ou funcionário do Admin)
          if (isAdminOrEmployee) {
              const { count, error: countError } = await supabase
                  .from('admin_recebimentos')
                  .select('id', { count: 'exact', head: true })
                  .eq('parcela_id', parcelaId);
                  
              if (countError) throw countError;
              
              if (count && count > 0) {
                  showError('Não é possível excluir. Existem recebimentos registrados para esta parcela.');
                  return;
              }
          }
          
          // 2. Deletar a parcela
          const { error } = await supabase
              .from(tabelaParcelas)
              .delete()
              .eq('id', parcelaId);
              
          if (error) throw error;
          
          showSuccess('Parcela excluída com sucesso.');
          fetchParcelas();
          onDataChange();
      } catch (error: any) {
          showError('Falha ao excluir parcela: ' + error.message);
      } finally {
          setIsDeleting(false);
      }
  };
  
  const handleUndoPayment = (parcela: Parcela) => {
    // Em vez de estornar direto, abre o modal de detalhes
    setDetalhesRecebimentoDialog({
      open: true,
      parcela,
    });
  };

  const handleDesvincularMapeamento = async (parcela: Parcela) => {
    if (!parcela.mapeado_extrato_id) return;
    setIsUnlinking(true);
    
    try {
      const result = await desvincularMapeamento(
        parcela.mapeado_extrato_id,
        parcela.id,
        'CR',
        isAdminOrEmployee
      );
      
      if (!result.success) {
        showError('Erro ao desvincular: ' + result.error);
        return;
      }
      
      showSuccess('Mapeamento desvinculado! A parcela voltou para pendente.');
      fetchParcelas();
      onDataChange();
    } catch (error: any) {
      showError('Erro ao desvincular mapeamento: ' + error.message);
    } finally {
      setIsUnlinking(false);
    }
  };

  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const formatDate = (dateString: string) => new Date(dateString + 'T00:00:00').toLocaleDateString('pt-BR');
  
  const getStatusDisplay = (status: Parcela['status']) => {
      if (status === 'paga') return 'recebida';
      return status;
  };
  
  const { totalValor, totalPago, progressoPercentual } = useMemo(() => {
      const total = parcelas.reduce((sum, p) => sum + p.valor_parcela, 0);
      const pago = parcelas.reduce((sum, p) => sum + (p.valor_pago || 0), 0);
      const percentual = total > 0 ? Math.round((pago / total) * 100) : 0;
      return { totalValor: total, totalPago: pago, progressoPercentual: percentual };
  }, [parcelas]);
  
  const totalRestante = totalValor - totalPago;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-full max-w-full sm:max-w-[90vw] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="truncate">Detalhes do Lançamento</DialogTitle>
            <DialogDescription className="truncate">
                <strong>{conta?.descricao}</strong> para o cliente <strong>{conta?.clientes?.nome || 'N/A'}</strong>
            </DialogDescription>
          </DialogHeader>
          
          {loading ? (
            <div className="flex justify-center items-center h-40"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : (
            <div className="mt-4 flex-1 flex flex-col overflow-hidden">
              
              {/* Resumo de Progresso */}
              <Card className="mb-4">
                  <CardContent className="p-4 space-y-3">
                      <div className="flex justify-between items-center">
                          <div className="flex items-center space-x-2">
                              <DollarSign className="w-5 h-5 mr-2" />
                              <span className="font-semibold">Progresso de Recebimento</span>
                          </div>
                          <span className="text-lg font-bold text-primary">{progressoPercentual}%</span>
                      </div>
                      <Progress value={progressoPercentual} className="h-2" />
                      <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                              <p className="text-muted-foreground">Total</p>
                              <p className="font-medium">{formatCurrency(totalValor)}</p>
                          </div>
                          <div>
                              <p className="text-muted-foreground text-green-600">Recebido</p>
                              <p className="font-medium text-green-600">{formatCurrency(totalPago)}</p>
                          </div>
                          <div>
                              <p className="text-muted-foreground text-red-600">Restante</p>
                              <p className="font-medium text-red-600">{formatCurrency(totalRestante)}</p>
                          </div>
                      </div>
                  </CardContent>
              </Card>
              
              <h3 className="font-semibold mb-2">Parcelas</h3>
              <div className="border rounded-md overflow-x-auto flex-1">
                <Table>
                  <TableHeader>
                    <TableRow>
                        <TableHead className="w-[50px]">Nº</TableHead>
                        <TableHead className="w-[100px]">Vencimento</TableHead>
                        <TableHead className="w-[100px]">Valor</TableHead>
                        <TableHead className="w-[100px]">Vlr Pago</TableHead>
                        <TableHead className="w-[100px]">Data Pagamento</TableHead>
                        <TableHead className="w-[100px]">Status</TableHead>
                        <TableHead className="w-[160px]">Conta D</TableHead>
                        <TableHead className="w-[160px]">Conta C</TableHead>
                        <TableHead className="w-[180px] text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parcelas.map((p) => {
                        const isPaga = p.status === 'paga';
                        const isCanceled = p.status === 'cancelada' || p.status === 'bloqueada';
                        const canEditOrDelete = !isPaga && !isCanceled;
                        
                        return (
                            <TableRow key={p.id} className={cn(isPaga && 'bg-green-500/10', isCanceled && 'bg-red-500/10')}>
                                <TableCell className="font-medium">{p.numero_parcela}</TableCell>
                                <TableCell>{formatDate(p.data_vencimento)}</TableCell>
                                <TableCell>{formatCurrency(p.valor_parcela)}</TableCell>
                                <TableCell className={cn(isPaga && 'font-semibold text-green-600')}>{formatCurrency(p.valor_pago || 0)}</TableCell>
                                <TableCell>{p.data_pagamento ? formatDate(p.data_pagamento) : '-'}</TableCell>
                                <TableCell>
                                    <div className="flex flex-col gap-1">
                                        <Badge variant={isPaga ? 'success' : (isCanceled ? 'destructive' : 'secondary')}>
                                            {getStatusDisplay(p.status)}
                                        </Badge>
                                        {p.mapeado_extrato_id && (
                                            <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">
                                                Mapeado
                                            </Badge>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell className="text-xs align-top">
                                    {(lancamentosPorParcela[p.id] || []).filter(l => l.tipo === 'Entrada').map((l, i) => (
                                        <div key={i} className="whitespace-nowrap text-blue-700">{l.conta_codigo} {l.conta_descricao}</div>
                                    ))}
                                </TableCell>
                                <TableCell className="text-xs align-top">
                                    {(lancamentosPorParcela[p.id] || []).filter(l => l.tipo === 'Saida').map((l, i) => (
                                        <div key={i} className="whitespace-nowrap text-orange-700">{l.conta_codigo} {l.conta_descricao}</div>
                                    ))}
                                </TableCell>
                                <TableCell className="text-right">
                                    <div className="flex justify-end space-x-1">
                                        {p.mapeado_extrato_id && (
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="ghost" size="icon" disabled={isUnlinking} title="Desvincular Mapeamento">
                                                        {isUnlinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlink className="w-4 h-4 text-orange-500" />}
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Desvincular Mapeamento?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            Isso irá remover o vínculo com a transação do extrato, deletar o lançamento de pagamento/recebimento criado pelo mapeamento, e a parcela voltará para status pendente. A transação do extrato ficará disponível para novo mapeamento.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel disabled={isUnlinking}>Cancelar</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleDesvincularMapeamento(p)} disabled={isUnlinking}>
                                                            {isUnlinking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Desvincular'}
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        )}
                                        
                                        {!isCanceled && (
                                            <Button variant="ghost" size="icon" onClick={() => handleOpenEdicao(p)} title="Editar Parcela">
                                                <Edit className="w-4 h-4" />
                                            </Button>
                                        )}
                                        
                                        {canEditOrDelete && (
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="ghost" size="icon" disabled={isDeleting} title="Excluir Parcela">
                                                        <Trash2 className="w-4 h-4 text-red-500" />
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Excluir Parcela?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            Tem certeza que deseja excluir a parcela {p.numero_parcela}? Esta ação é irreversível e só é permitida se não houver recebimentos associados.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleDeleteParcela(p.id)} disabled={isDeleting}>
                                                            {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Excluir'}
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        )}
                                        
                                        {isPaga ? (
                                            p.mapeado_extrato_id ? (                                                <Button 
                                                    variant="destructive" 
                                                    size="icon" 
                                                    disabled={true}
                                                    title="Desvincule o mapeamento antes de estornar"
                                                >
                                                    <Undo2 className="w-4 h-4 opacity-50" />
                                                </Button>
                                            ) : (
                                                <Button
                                                    variant="destructive"
                                                    size="icon"
                                                    title="Estornar Recebimento"
                                                    onClick={() => handleUndoPayment(p)}
                                                >
                                                    <Undo2 className="w-4 h-4" />
                                                </Button>
                                            )
                                        ) : (
                                            !isCanceled && (
                                                <Button variant="outline" size="sm" onClick={() => handleOpenPagamento(p)}>
                                                    <BadgeDollarSign className="w-4 h-4 mr-2 hidden sm:inline" />Receber
                                                </Button>
                                            )
                                        )}
                                        {usuario?.id && (() => {
                                            const lans = lancamentosPorParcela[p.id] || [];
                                            const temLancamentoReal = lans.some(l => l.origem !== 'recebimento_recebimentos');
                                            const semLancamento = isPaga && !temLancamentoReal;
                                            if (semLancamento) {
                                                return (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => { setParcelaIdParaEditarPaga(p.id); setEditarPagaDialogOpen(true); }}
                                                        title="Parcela sem lançamento contábil — clique para gerar"
                                                        className="relative"
                                                    >
                                                        <BookOpen className="w-4 h-4 text-red-500" />
                                                        <span className="absolute -top-1 -right-1 flex h-3 w-3">
                                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                                                            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                                                        </span>
                                                    </Button>
                                                );
                                            }
                                            return (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => setLancamentoDialog({ open: true, parcela: p })}
                                                    title={temLancamentoReal ? 'Lançamento contábil registrado' : 'Registrar lançamento contábil'}
                                                >
                                                    <BookOpen className={`w-4 h-4 ${temLancamentoReal ? 'text-green-600' : 'text-gray-400'}`} />
                                                </Button>
                                            );
                                        })()}
                                    </div>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Diálogo de Pagamento */}
      <RegistrarPagamentoDialog
        parcela={parcelaSelecionada}
        open={pagamentoDialogOpen}
        onOpenChange={setPagamentoDialogOpen}
        onSaveComplete={handlePagamentoCompleto}
      />
      
      {/* Diálogo de Edição de Parcela */}
      {parcelaParaEdicao && (
          <FormParcelaReceberDialog
              open={edicaoDialogOpen}
              onOpenChange={setEdicaoDialogOpen}
              parcelaInicial={parcelaParaEdicao}
              onSaveComplete={handleEdicaoCompleta}
              tabelaParcelas={tabelaParcelas}
          />
      )}

      <EditarParcelaPagaDialog
          parcelaId={parcelaIdParaEditarPaga}
          open={editarPagaDialogOpen}
          onOpenChange={setEditarPagaDialogOpen}
          onSaveComplete={() => {
              setEditarPagaDialogOpen(false);
              fetchParcelas();
              onDataChange();
          }}
      />

      {detalhesRecebimentoDialog.open && detalhesRecebimentoDialog.parcela && conta && ownerId && (
          <DetalhesRecebimentoParcelaDialog
              open={detalhesRecebimentoDialog.open}
              onOpenChange={(open) => setDetalhesRecebimentoDialog({ open, parcela: open ? detalhesRecebimentoDialog.parcela : null })}
              parcela={detalhesRecebimentoDialog.parcela}
              conta={conta}
              proprietarioId={ownerId}
              onDataChange={() => {
                  fetchParcelas();
                  onDataChange();
              }}
          />
      )}

      {lancamentoDialog.open && lancamentoDialog.parcela && ownerId && (
          <LancamentoContabilDialog
              open={lancamentoDialog.open}
              onOpenChange={(open) => setLancamentoDialog({ open, parcela: open ? lancamentoDialog.parcela : null })}
              parcelaId={lancamentoDialog.parcela.id}
              parcelaDescricao={conta?.descricao || 'Conta a Receber'}
              parcelaValor={lancamentoDialog.parcela.valor_parcela}
              parcelaData={lancamentoDialog.parcela.data_vencimento}
              origemTipo="contas_receber"
              proprietarioId={ownerId}
              contaPatrimonialId={conta?.id_conta_patrimonial}
              contaResultadoId={(conta as any)?.id_conta_resultado}
              onSaved={() => {
                  if (lancamentoDialog.parcela) {
                      setParcelasComLancamento(prev => new Set([...prev, lancamentoDialog.parcela!.id]));
                  }
                  setLancamentoDialog({ open: false, parcela: null });
              }}
          />
      )}
    </>
  );
};

export default DetalhesParcelasDialog;