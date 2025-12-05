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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './ui/alert-dialog';
import { Loader2, BadgeDollarSign, DollarSign, Edit, Trash2, Undo2 } from 'lucide-react';
import RegistrarPagamentoDialog from '@/components/contas-receber/RegistrarPagamentoDialog';
import { Badge } from '@/components/ui/badge'; // IMPORTAÇÃO CORRIGIDA

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
  data_pagamento: string | null; // ADICIONADO
  status: 'aberta' | 'parcial' | 'paga' | 'reprogramada' | 'cancelada' | 'bloqueada';
  id_conta_contabil: string | null; // Adicionado para estorno
  observacao: string | null; // Adicionado para estorno
}

interface DetalhesParcelasDialogProps {
  conta: ContaReceber | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDataChange: () => void;
}

const DetalhesParcelasDialog: React.FC<DetalhesParcelasDialogProps> = ({ conta, open, onOpenChange, onDataChange }) => {
  const { role, usuario } = useSessao();
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagamentoDialogOpen, setPagamentoDialogOpen] = useState(false);
  const [parcelaSelecionada, setParcelaSelecionada] = useState<ParcelaParaPagamento | null>(null);
  
  // Estados para edição
  const [edicaoDialogOpen, setEdicaoDialogOpen] = useState(false);
  const [parcelaParaEdicao, setParcelaParaEdicao] = useState<Parcela | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);

  // Determina a tabela correta com base na role
  const isAdmin = role === 'Admin'; // DEFINIÇÃO AQUI
  const tabelaParcelas = isAdmin ? 'admin_parcelas_receber' : 'parcelas_contas_receber';
  const tabelaRecebimentos = isAdmin ? 'admin_recebimentos' : 'recebimentos';
  const tabelaContasReceber = isAdmin ? 'admin_contas_receber' : 'contas_receber';

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
      if (parcela.status === 'paga' || parcela.status === 'cancelada' || parcela.status === 'bloqueada') {
          showError('Não é possível editar parcelas pagas, canceladas ou bloqueadas.');
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
          // 1. Verificar se há recebimentos associados (apenas Admin)
          if (isAdmin) {
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
  
  const handleUndoPayment = async (parcela: Parcela) => {
    if (!usuario?.id || !conta) return;
    setIsUndoing(true);
    
    const ownerId = conta.empresa_id;
    const contaReceberId = conta.id;
    const contaReceberIdShort = contaReceberId.substring(0, 8);
    
    try {
        // VALIDAÇÃO: Verificar se há lançamento no extrato bancário
        // Busca recebimentos para obter valor, data e conta de destino
        const { data: recebimentosCheck, error: recebimentosCheckError } = await supabase
            .from(tabelaRecebimentos)
            .select('id, conta_id, valor_recebido, data_recebimento')
            .eq('parcela_id', parcela.id);
            
        if (recebimentosCheckError) throw recebimentosCheckError;
        
        if (recebimentosCheck && recebimentosCheck.length > 0) {
            for (const receb of recebimentosCheck) {
                if (receb.conta_id) {
                    const dataRecebimento = receb.data_recebimento 
                        ? receb.data_recebimento.substring(0, 10) 
                        : null;
                    
                    const { data: extratoExistente, error: extratoError } = await supabase
                        .from('extratos')
                        .select('id')
                        .eq('empresa_id', ownerId)
                        .eq('id_saldo_contas', receb.conta_id)
                        .eq('valor', Math.abs(receb.valor_recebido))
                        .eq('tipo', 'Entrada');
                    
                    if (extratoError) {
                        console.warn('Aviso: Erro ao verificar extrato:', extratoError);
                    }
                    
                    if (extratoExistente && extratoExistente.length > 0) {
                        showError('Não é possível estornar. Esta conta possui lançamento no extrato bancário. Delete o lançamento do extrato primeiro e depois estorne a conta recebida.');
                        setIsUndoing(false);
                        return;
                    }
                }
            }
        }
        
        // 1. Buscar todos os registros de recebimento associados
        const { data: recebimentos, error: fetchError } = await supabase
            .from(tabelaRecebimentos)
            .select('id, conta_id, valor_recebido, historico_id')
            .eq('parcela_id', parcela.id);
            
        if (fetchError) throw fetchError;
        
        if (!recebimentos || recebimentos.length === 0) {
            showError('Nenhum recebimento encontrado para estornar.');
            setIsUndoing(false);
            return;
        }
        
        const dataEstornoISO = new Date().toISOString();
        
        // 2. Buscar mapeamento contábil (Admin e Cliente)
        let contaDescontoConcedidoId: string | null = null;
        let contaEstornoDescontoId: string | null = null;
        
        const { data: configData } = await supabase
            .from('configuracao_contas_receber')
            .select('tipo_registro, conta_contabil_id')
            .eq('proprietario_id', usuario.id)
            .in('tipo_registro', ['desconto_concedido', 'estorno_desconto_concedido']);
            
        contaDescontoConcedidoId = configData?.find(c => c.tipo_registro === 'desconto_concedido')?.conta_contabil_id || null;
        contaEstornoDescontoId = configData?.find(c => c.tipo_registro === 'estorno_desconto_concedido')?.conta_contabil_id || null;
        
        // 3. Buscar TODOS os lançamentos originais vinculados a esta parcela
        // Busca por: origem = 'recebimento_manual' E origem = 'desconto_cp:ID'
        const { data: originalLaunches, error: fetchLaunchError } = await supabase
            .from('lancamentos')
            .select('id, conta_resultado_id, conta_contabil_id, conta_bancaria_id, valor, tipo, descricao, historico_id, origem')
            .eq('proprietario_id', usuario.id)
            .or(`origem.eq.recebimento_manual,origem.like.desconto_cp:${parcela.id}%`); // Filtra pelo ID da parcela no desconto
            
        if (fetchLaunchError) throw fetchLaunchError;
        
        const lancamentosEstornoPayload: any[] = [];
        const originalLaunchIds = (originalLaunches || []).map(l => l.id);
        
        if (originalLaunchIds.length === 0) {
            showError('Nenhum lançamento contábil original encontrado para estorno.');
            setIsUndoing(false);
            return;
        }
        
        // 4. Marcar os lançamentos originais como estornados
        const { error: markError } = await supabase
            .from('lancamentos')
            .update({ origem: 'recebimento_manual_estornada' })
            .in('id', originalLaunchIds);
            
        if (markError) throw markError;
        
        // 5. Gerar Lançamentos de Estorno (Reversão)
        
        // 5.1. Estorno do Recebimento (Caixa/Clientes)
        for (const orig of originalLaunches.filter(l => l.origem === 'recebimento_manual')) {
            const inverseId = crypto.randomUUID();
            const tipoInvertido = orig.tipo === 'Entrada' ? 'Saida' : 'Entrada';
            
            // Lançamento de Estorno
            const lancInvert = {
                id: inverseId,
                proprietario_id: usuario.id,
                data_movimentacao: dataEstornoISO,
                descricao: `ESTORNO: ${orig.descricao}`,
                valor: orig.valor,
                tipo: tipoInvertido,
                conta_bancaria_id: orig.conta_bancaria_id,
                conta_contabil_id: orig.conta_contabil_id,
                origem: 'estorno_recebimento_manual',
                historico_id: orig.historico_id,
                conta_resultado_id: orig.id,
            };
            lancamentosEstornoPayload.push(lancInvert);
        }
        
        // 5.2. Estorno do Desconto Concedido (Se houver) - D: Ativo / C: Receita Estorno
        const isDiscountApplied = parcela.observacao?.includes('desconto');
        const valorDesconto = isDiscountApplied ? (parcela.valor_parcela - (parcela.valor_pago || 0)) : 0;

        if (isDiscountApplied && contaEstornoDescontoId && conta.id_conta_patrimonial && valorDesconto > 0.01) {
            
            // Lançamento 1: D: Clientes a Receber (Ativo) - ENTRADA (Aumenta Ativo Devedor)
            const idEstornoAtivo = crypto.randomUUID();
            const idEstornoReceita = crypto.randomUUID();

            // D: Clientes a Receber Avulso (Ativo) - ENTRADA (Aumenta Ativo Devedor)
            const lancamentoEstornoPatrimonial = {
                id: idEstornoAtivo,
                proprietario_id: usuario.id,
                data_movimentacao: dataEstornoISO,
                descricao: `ESTORNO DESCONTO CR: ${conta.descricao} (CR ID: ${contaReceberIdShort})`,
                valor: valorDesconto,
                tipo: 'Entrada' as const, // DÉBITO (Aumenta Ativo Devedor)
                conta_bancaria_id: null,
                conta_contabil_id: conta.id_conta_patrimonial, // Conta Patrimonial (1.x.x)
                origem: 'estorno_recebimento_manual',
                historico_id: recebimentos[0].historico_id,
                conta_resultado_id: idEstornoReceita, // Referência cruzada
            };
            lancamentosEstornoPayload.push(lancamentoEstornoPatrimonial);

            // Lançamento 2: C: Receita Estorno do Desconto (Resultado) - CRÉDITO (Saída)
            const lancamentoEstornoReceita = {
                id: idEstornoReceita,
                proprietario_id: usuario.id,
                data_movimentacao: dataEstornoISO,
                descricao: `RECEITA ESTORNO DESCONTO: ${conta.descricao} (CR ID: ${contaReceberIdShort})`,
                valor: valorDesconto,
                tipo: 'Saida' as const, // CRÉDITO (Saída) na Receita Credora
                conta_bancaria_id: null,
                conta_contabil_id: contaEstornoDescontoId, // Conta de Estorno Desconto Concedido (Receita)
                origem: 'estorno_recebimento_manual',
                historico_id: recebimentos[0].historico_id,
                conta_resultado_id: idEstornoAtivo, // Referência cruzada
            };
            lancamentosEstornoPayload.push(lancamentoEstornoReceita);
        } else if (isDiscountApplied && valorDesconto > 0.01 && !contaEstornoDescontoId) {
            console.warn('Aviso: Conta de Estorno Desconto Concedido (Receita) não configurada. Estorno de desconto não será realizado.');
        }
        
        // 6. Inserir todos os lançamentos de estorno
        const { error: insErr } = await supabase.from('lancamentos').insert(lancamentosEstornoPayload);
        if (insErr) throw insErr;
        
        // 7. Deletar Registros de Recebimento
        const recebimentoIds = recebimentos.map(r => r.id);
        const { error: deleteRecebimentosError } = await supabase
            .from(tabelaRecebimentos)
            .delete()
            .in('id', recebimentoIds);
            
        if (deleteRecebimentosError) throw deleteRecebimentosError;
        
        // 8. Resetar a Parcela
        const { error: resetError } = await supabase
            .from(tabelaParcelas)
            .update({
                status: 'aberta',
                valor_pago: 0,
                data_pagamento: null,
                observacao: 'Estorno de recebimento realizado.',
            })
            .eq('id', parcela.id);
            
        if (resetError) throw resetError;
        
        // 9. Resetar o status da conta sintética para 'aberta'
        const { error: updateContaError } = await supabase
            .from(tabelaContasReceber)
            .update({ status: 'aberta' })
            .eq('id', contaReceberId);
            
        if (updateContaError) console.error('Erro ao atualizar conta sintética para aberta:', updateContaError);
        
        showSuccess('Recebimento estornado com sucesso! Saldos reajustados.');
        handlePagamentoCompleto();
        
    } catch (error: any) {
        console.error('Erro ao estornar recebimento:', error);
        showError('Falha ao estornar recebimento: ' + error.message);
    } finally {
        setIsUndoing(false);
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
                                    <Badge variant={isPaga ? 'success' : (isCanceled ? 'destructive' : 'secondary')}>
                                        {getStatusDisplay(p.status)}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                    <div className="flex justify-end space-x-2">
                                        {canEditOrDelete && (
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
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="destructive" size="icon" disabled={isUndoing} title="Estornar Recebimento">
                                                        {isUndoing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />}
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Confirmar Estorno de Recebimento</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            Esta ação irá reverter o recebimento desta parcela, deletando os registros de recebimento e lançamentos de estorno associados. O saldo da conta de destino e o direito a receber no Ativo serão reajustados. Tem certeza?
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel disabled={isUndoing}>Cancelar</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleUndoPayment(p)} disabled={isUndoing}>
                                                            {isUndoing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : 'Estornar Recebimento'}
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        ) : (
                                            !isCanceled && (
                                                <Button variant="outline" size="sm" onClick={() => handleOpenPagamento(p)}>
                                                    <BadgeDollarSign className="w-4 h-4 mr-2 hidden sm:inline" />Receber
                                                </Button>
                                            )
                                        )}
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
    </>
  );
};

export default DetalhesParcelasDialog;