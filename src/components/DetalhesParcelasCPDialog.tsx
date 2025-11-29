import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatarData } from '@/utils/formatters';
import { AdminContaPagar, AdminParcelaPagar, ExtendedParcelaPagar } from '@/types/contas-pagar';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useSessao } from '@/hooks/use-sessao';
import { getBadgeVariant } from '@/utils/badge-variants';
import { Badge } from './ui/badge';
import { DollarSign, Undo2, Loader2, Trash2, Edit } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import RegistrarPagamentoCPDialog from '@/components/contas-pagar/RegistrarPagamentoCPDialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './ui/alert-dialog';
import { Progress } from './ui/progress';

interface DetalhesParcelasCPDialogProps {
  conta: AdminContaPagar;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDataChange: () => void;
}

const DetalhesParcelasCPDialog: React.FC<DetalhesParcelasCPDialogProps> = ({ conta, open, onOpenChange, onDataChange }) => {
  const { usuario } = useSessao();
  const [parcelas, setParcelas] = useState<ExtendedParcelaPagar[]>([]);
  const [loading, setLoading] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false); // NOVO ESTADO
  const [pagamentoDialog, setPagamentoDialog] = useState<{ open: boolean, parcela: (AdminParcelaPagar & { fornecedor: string }) | null }>({ open: false, parcela: null });

  const fetchParcelas = useCallback(async () => {
    if (!usuario?.id) return;
    setLoading(true);
    
    const { data, error } = await supabase
        .from('admin_parcelas_pagar')
        .select(`
            *,
            admin_contas_pagar ( fornecedor, descricao, origem )
        `)
        .eq('conta_pagar_id', conta.id)
        .order('numero_parcela', { ascending: true });
        
    if (error) {
        showError('Erro ao carregar parcelas: ' + error.message);
        setParcelas([]);
    } else {
        setParcelas(data as ExtendedParcelaPagar[]);
    }
    setLoading(false);
  }, [conta.id, usuario?.id]);
  
  useEffect(() => {
    if (open) {
        fetchParcelas();
    }
  }, [open, fetchParcelas]);
  
  const handleOpenPagamento = (parcela: ExtendedParcelaPagar) => {
    const mappedParcela = {
        ...parcela,
        fornecedor: parcela.admin_contas_pagar?.fornecedor || conta.fornecedor,
    };
    setPagamentoDialog({ open: true, parcela: mappedParcela });
  };
  
  const handlePagamentoComplete = () => {
    setPagamentoDialog({ open: false, parcela: null });
    fetchParcelas();
    onDataChange(); // Notifica a página pai para recarregar o sintético
  };
  
  const handleDeleteParcela = async (parcelaId: string) => {
      setIsDeleting(true);
      try {
          // 1. Verificar se há pagamentos associados
          const { count, error: countError } = await supabase
              .from('admin_pagamentos')
              .select('id', { count: 'exact', head: true })
              .eq('parcela_id', parcelaId);
              
          if (countError) throw countError;
          
          if (count && count > 0) {
              showError('Não é possível excluir. Existem pagamentos registrados para esta parcela.');
              return;
          }
          
          // 2. Deletar a parcela
          const { error } = await supabase
              .from('admin_parcelas_pagar')
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
  
  const handleUndoPayment = async (parcelaId: string) => {
    if (!usuario?.id) return;
    setIsUndoing(true);

    const origemVincular = `pagamento_cp:${parcelaId}`;
    
    try {
        // 1. Buscar a parcela para obter o ID da conta sintética
        const { data: parcelaData, error: parcelaError } = await supabase
            .from('admin_parcelas_pagar')
            .select('conta_pagar_id, id_conta_contabil')
            .eq('id', parcelaId)
            .single();
            
        if (parcelaError || !parcelaData) throw new Error('Parcela não encontrada.');
        
        const contaPagarId = parcelaData.conta_pagar_id; // ID DA CONTA SINTÉTICA
        
        // 2. Buscar a conta sintética para obter a conta patrimonial, descrição e DRE
        const { data: contaSintetica, error: csError } = await supabase
            .from('admin_contas_pagar')
            .select('id_conta_patrimonial, descricao, historico_id, id_conta_resultado')
            .eq('id', contaPagarId)
            .single();
            
        if (csError || !contaSintetica) throw new Error('Conta sintética não encontrada.');
        
        const contaPatrimonial = contaSintetica.id_conta_patrimonial;
        const descricaoContaSintetica = contaSintetica.descricao || 'Pagamento';
        const historicoId = contaSintetica.historico_id;
        const contaDespesaCriacao = contaSintetica.id_conta_resultado;
        
        // 3. Buscar todos os pagamentos registrados (para deletar depois)
        const { data: pagamentos, error: fetchPayError } = await supabase
            .from('admin_pagamentos')
            .select('id, conta_id, valor_pago, id_conta_contabil')
            .eq('parcela_id', parcelaId);
            
        if (fetchPayError) throw fetchPayError;
        
        if (!pagamentos || pagamentos.length === 0) {
            showError('Nenhum pagamento encontrado para estornar.');
            setIsUndoing(false);
            return;
        }
        
        const dataEstornoISO = new Date().toISOString();
        const parcelaIdShort = parcelaId.substring(0, 8);
        const contaPagarIdShort = contaPagarId.substring(0, 8);
        
        // 4. Buscar os lançamentos contábeis ORIGINAIS vinculados ao pagamento desta parcela
        const { data: originalLaunches, error: fetchLaunchError } = await supabase
            .from('lancamentos')
            .select('id, conta_resultado_id, conta_contabil_id, conta_bancaria_id, valor, tipo, descricao, historico_id')
            .eq('proprietario_id', usuario.id)
            .eq('origem', origemVincular); // Busca pela chave de origem da parcela
            
        if (fetchLaunchError) throw fetchLaunchError;

        if (!originalLaunches || originalLaunches.length === 0) {
            showError('Nenhum lançamento contábil original encontrado para estorno.');
            setIsUndoing(false);
            return;
        }
        
        const lancamentosEstornoPayload: any[] = [];
        const originalLaunchIds = originalLaunches.map(l => l.id);

        // 5. Gerar Lançamentos de Estorno (Reversão)
        for (const orig of originalLaunches) {
            const inverseId = crypto.randomUUID();
            const tipoInvertido = orig.tipo === 'Entrada' ? 'Saida' : 'Entrada'; // Inverte o tipo

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
                origem: 'estorno_pagamento_manual',
                historico_id: orig.historico_id,
                conta_resultado_id: orig.id, // Referência cruzada para o original
            };
            lancamentosEstornoPayload.push(lancInvert);
        }
        
        // 5.3. Lançamento 3: Estorno da Despesa/Custo (DRE) - CRÉDITO (Saída)
        // Este lançamento neutraliza o DÉBITO de Despesa/Custo que foi criado na CRIAÇÃO da CP.
        // O valor total pago é o valor que deve ser estornado da Despesa/Custo.
        if (contaDespesaCriacao) {
            const idEstornoDespesa = crypto.randomUUID();
            const totalPagoEstorno = pagamentos.reduce((sum, p) => sum + p.valor_pago, 0);
            
            const lancamentoEstornoDespesa = {
                id: idEstornoDespesa,
                proprietario_id: usuario.id,
                data_movimentacao: dataEstornoISO,
                descricao: `Estorno Despesa/Custo CP: ${descricaoContaSintetica} (CP ID: ${contaPagarIdShort})`,
                valor: totalPagoEstorno,
                tipo: 'Saida' as const, // CRÉDITO (Saída) na Despesa (Credora) para neutralizar o débito original
                conta_bancaria_id: null,
                conta_contabil_id: contaDespesaCriacao,
                origem: 'estorno_pagamento_manual',
                historico_id: historicoId,
                conta_resultado_id: null,
            };
            lancamentosEstornoPayload.push(lancamentoEstornoDespesa);
        }

        // 6. Inserir todos os lançamentos de estorno
        const { error: insErr } = await supabase.from('lancamentos').insert(lancamentosEstornoPayload);
        if (insErr) throw insErr;

        // 7. Marcar os lançamentos originais como estornados
        const { error: markError } = await supabase
            .from('lancamentos')
            .update({ origem: 'pagamento_manual_estornada' })
            .in('id', originalLaunchIds);
        if (markError) throw markError;
        
        // 8. Deletar Registros de Pagamento (Histórico)
        const pagamentoIds = pagamentos.map(r => r.id);
        const { error: deletePagamentosError } = await supabase
            .from('admin_pagamentos')
            .delete()
            .in('id', pagamentoIds);
            
        if (deletePagamentosError) throw deletePagamentosError;
        
        // 9. Resetar a Parcela
        const { error: resetError } = await supabase
            .from('admin_parcelas_pagar')
            .update({
                status: 'aberta',
                valor_pago: 0,
                data_pagamento: null,
                observacao: 'Estorno de pagamento realizado.',
            })
            .eq('id', parcelaId);
            
        if (resetError) throw resetError;
        
        // 10. Resetar o status da conta sintética para 'pendente'
        const { error: updateContaError } = await supabase
            .from('admin_contas_pagar')
            .update({ status: 'pendente' })
            .eq('id', contaPagarId);
            
        if (updateContaError) console.error('Erro ao atualizar conta sintética para pendente:', updateContaError);
        
        showSuccess('Pagamento estornado com sucesso! Saldos reajustados.');
        handlePagamentoComplete();
        
    } catch (error: any) {
        console.error('Erro ao estornar pagamento:', error);
        showError('Falha ao estornar pagamento: ' + error.message);
    } finally {
        setIsUndoing(false);
    }
  };

  const totalValor = useMemo(() => parcelas.reduce((sum, p) => sum + p.valor_parcela, 0), [parcelas]);
  const totalPago = useMemo(() => parcelas.reduce((sum, p) => sum + (p.valor_pago || 0), 0), [parcelas]);
  const progressoPercentual = totalValor > 0 ? Math.round((totalPago / totalValor) * 100) : 0;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes das Parcelas - {conta.fornecedor}</DialogTitle>
            <DialogDescription>
              {conta.descricao} | Valor Total: {formatCurrency(conta.valor_total)}
            </DialogDescription>
          </DialogHeader>

          <Card className="mb-4">
              <CardContent className="p-4 space-y-3">
                  <div className="flex justify-between items-center">
                      <div className="flex items-center space-x-2">
                          <DollarSign className="w-5 h-5 text-primary" />
                          <span className="font-semibold">Progresso de Pagamento</span>
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
                          <p className="text-muted-foreground text-green-600">Pago</p>
                          <p className="font-medium text-green-600">{formatCurrency(totalPago)}</p>
                      </div>
                      <div>
                          <p className="text-muted-foreground text-red-600">Restante</p>
                          <p className="font-medium text-red-600">{formatCurrency(totalValor - totalPago)}</p>
                      </div>
                  </div>
              </CardContent>
          </Card>

          <div className="overflow-x-auto">
              <Table>
                  <TableHeader>
                      <TableRow>
                          <TableHead>Nº</TableHead>
                          <TableHead>Vencimento</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                          <TableHead className="text-right">Pago</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Data Pagamento</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                  </TableHeader>
                  <TableBody>
                      {loading ? (
                          <TableRow><TableCell colSpan={7} className="text-center">Carregando...</TableCell></TableRow>
                      ) : parcelas.length === 0 ? (
                          <TableRow><TableCell colSpan={7} className="text-center">Nenhuma parcela encontrada.</TableCell></TableRow>
                      ) : (
                          parcelas.map((p) => {
                              const statusVariant = getBadgeVariant(p.status, p.data_vencimento);
                              const isPaga = p.status === 'paga';
                              const canEditOrDelete = p.status === 'aberta' || p.status === 'parcial' || p.status === 'reprogramada';
                              
                              return (
                                  <TableRow key={p.id}>
                                      <TableCell>{p.numero_parcela}</TableCell>
                                      <TableCell>{formatarData(p.data_vencimento)}</TableCell>
                                      <TableCell className="text-right">{formatCurrency(p.valor_parcela)}</TableCell>
                                      <TableCell className="text-right">{formatCurrency(p.valor_pago || 0)}</TableCell>
                                      <TableCell>
                                          <Badge variant={statusVariant}>
                                              {p.status}
                                          </Badge>
                                      </TableCell>
                                      <TableCell>{p.data_pagamento ? formatarData(p.data_pagamento) : '-'}</TableCell>
                                      <TableCell className="text-right space-x-2">
                                          
                                          {/* Botão de Edição (Apenas se não estiver paga/cancelada) */}
                                          {canEditOrDelete && (
                                              <Button variant="ghost" size="icon" onClick={() => alert('Edição de parcela CP não implementada.')} title="Editar Parcela" disabled>
                                                  <Edit className="w-4 h-4" />
                                              </Button>
                                          )}
                                          
                                          {/* Botão de Excluir (Apenas se não estiver paga/cancelada) */}
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
                                                              Tem certeza que deseja excluir a parcela {p.numero_parcela}? Esta ação é irreversível e só é permitida se não houver pagamentos associados.
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
                                                      <Button variant="destructive" size="icon" disabled={isUndoing}>
                                                          {isUndoing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />}
                                                      </Button>
                                                  </AlertDialogTrigger>
                                                  <AlertDialogContent>
                                                      <AlertDialogHeader>
                                                          <AlertDialogTitle>Confirmar Estorno de Pagamento</AlertDialogTitle>
                                                          <AlertDialogDescription>
                                                              Esta ação irá reverter o pagamento desta parcela, deletando os registros de pagamento e lançamentos de estorno associados. O saldo da conta de origem e a obrigação no Passivo serão reajustados. Tem certeza?
                                                          </AlertDialogDescription>
                                                      </AlertDialogHeader>
                                                      <AlertDialogFooter>
                                                          <AlertDialogCancel disabled={isUndoing}>Cancelar</AlertDialogCancel>
                                                          <AlertDialogAction onClick={() => handleUndoPayment(p.id)} disabled={isUndoing}>
                                                              {isUndoing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : 'Estornar Recebimento'}
                                                          </AlertDialogAction>
                                                      </AlertDialogFooter>
                                                  </AlertDialogContent>
                                              </AlertDialog>
                                          ) : (
                                              <Button size="sm" onClick={() => handleOpenPagamento(p)} disabled={!canEditOrDelete}>
                                                  <DollarSign className="w-4 h-4" /> Pagar
                                              </Button>
                                          )}
                                      </TableCell>
                                  </TableRow>
                              );
                          })
                      )}
                  </TableBody>
              </Table>
          </div>
          
          {pagamentoDialog.parcela && (
              <RegistrarPagamentoCPDialog
                  open={pagamentoDialog.open}
                  onOpenChange={setPagamentoDialog}
                  parcela={pagamentoDialog.parcela}
                  onSaveComplete={handlePagamentoComplete}
              />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DetalhesParcelasCPDialog;