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
import { DollarSign, Undo2, Loader2 } from 'lucide-react';
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
  
  const handleUndoPayment = async (parcelaId: string) => {
    if (!usuario?.id) return;
    setIsUndoing(true);
    
    try {
        // 1. Buscar a parcela para obter o ID da conta sintética
        const { data: parcelaData, error: parcelaError } = await supabase
            .from('admin_parcelas_pagar')
            .select('conta_pagar_id, id_conta_contabil')
            .eq('id', parcelaId)
            .single();
            
        if (parcelaError || !parcelaData) throw new Error('Parcela não encontrada.');
        
        const contaPagarId = parcelaData.conta_pagar_id;
        
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
        const contaDespesaCriacao = contaSintetica.id_conta_resultado; // CORREÇÃO: Lendo a variável aqui
        
        // 3. Buscar todos os pagamentos associados a esta parcela
        const { data: pagamentos, error: fetchError } = await supabase
            .from('admin_pagamentos')
            .select('id, conta_id, valor_pago, id_conta_contabil')
            .eq('parcela_id', parcelaId);
            
        if (fetchError) throw fetchError;
        
        if (!pagamentos || pagamentos.length === 0) {
            showError('Nenhum pagamento encontrado para estornar.');
            setIsUndoing(false);
            return;
        }
        
        const dataEstornoISO = new Date().toISOString();
        
        // 4. Buscar os lançamentos originais (Ativo e Passivo)
        const { data: originalLaunches, error: fetchLaunchError } = await supabase
            .from('lancamentos')
            .select('id, conta_resultado_id')
            .eq('proprietario_id', usuario.id)
            .eq('origem', 'pagamento_manual')
            .ilike('descricao', `%Pagamento Parcela ${parcelaId.substring(0, 8)}%`);
            
        if (fetchLaunchError) throw fetchLaunchError;
        
        if (!originalLaunches || originalLaunches.length === 0) {
            console.warn('Lançamentos originais de pagamento não encontrados. Prosseguindo com reset da parcela.');
        } else {
            // CRÍTICO: Marcar os lançamentos originais como estornados
            const originalLaunchIds = originalLaunches.map(l => l.id);
            const { error: markError } = await supabase
                .from('lancamentos')
                .update({ origem: 'pagamento_manual_estornada' })
                .in('id', originalLaunchIds);
                
            if (markError) throw markError;
        }
        
        // 5. Gerar Lançamentos de Estorno (Reversão do Pagamento) - D: Ativo, C: Passivo
        
        for (const pagamento of pagamentos) {
            // 5.1. Buscar a conta de saldo (Caixa/Banco) para obter o conta_contabil_id
            const { data: saldoContaData } = await supabase
                .from('saldo_contas')
                .select('conta_contabil_id')
                .eq('id', pagamento.conta_id)
                .single();
                
            const contaContabilCaixaBanco = saldoContaData?.conta_contabil_id;
            
            if (!contaContabilCaixaBanco) {
                console.warn(`Aviso: Conta de saldo ${pagamento.conta_id} sem vínculo contábil para estorno. Pulando estorno contábil para este pagamento.`);
                continue;
            }
            
            // NOVO: Geração de IDs para o par de estorno
            const idEstornoAtivo = crypto.randomUUID();
            const idEstornoPassivo = crypto.randomUUID();
            
            // Lançamento 1: D: Ativo (Caixa/Banco) - DÉBITO (Entrada) -> Restaura o saldo
            const lancamentoEstornoAtivo = {
                id: idEstornoAtivo,
                proprietario_id: usuario.id,
                data_movimentacao: dataEstornoISO,
                descricao: `Estorno Pagamento Ativo CP: ${conta.fornecedor} (Parcela ID: ${parcelaId.substring(0, 8)})`,
                valor: pagamento.valor_pago,
                tipo: 'Entrada' as const, // DÉBITO (Entrada) no Ativo para restaurar o saldo
                conta_bancaria_id: pagamento.conta_id,
                conta_contabil_id: contaContabilCaixaBanco,
                origem: 'estorno_pagamento_manual',
                historico_id: historicoId,
                conta_resultado_id: idEstornoPassivo, // REFERÊNCIA CRUZADA
            };
            await supabase.from('lancamentos').insert(lancamentoEstornoAtivo);
            
            // Lançamento 2: C: Passivo (Obrigação a Pagar) - CRÉDITO (Saída) -> Restaura a obrigação
            if (contaPatrimonial) {
                const lancamentoEstornoPassivo = {
                    id: idEstornoPassivo,
                    proprietario_id: usuario.id,
                    data_movimentacao: dataEstornoISO,
                    descricao: `Estorno Baixa Passivo CP: ${descricaoContaSintetica} (CP ID: ${contaPagarId.substring(0, 8)})`,
                    valor: pagamento.valor_pago,
                    tipo: 'Saida' as const, // CRÉDITO (Saída) no Passivo para restaurar a obrigação
                    conta_bancaria_id: null,
                    conta_contabil_id: contaPatrimonial,
                    origem: 'estorno_pagamento_manual',
                    historico_id: historicoId,
                    conta_resultado_id: idEstornoAtivo, // REFERÊNCIA CRUZADA
                };
                await supabase.from('lancamentos').insert(lancamentoEstornoPassivo);
            }
            
            // 5.3. Lançamento 3: Estorno da Despesa/Custo (DRE) - CRÉDITO (Saída)
            if (contaDespesaCriacao) {
                const idEstornoDespesa = crypto.randomUUID();
                
                const lancamentoEstornoDespesa = {
                    id: idEstornoDespesa,
                    proprietario_id: usuario.id,
                    data_movimentacao: dataEstornoISO,
                    descricao: `Estorno Despesa/Custo CP: ${descricaoContaSintetica} (CP ID: ${contaPagarId.substring(0, 8)})`,
                    valor: pagamento.valor_pago,
                    tipo: 'Saida' as const, // CRÉDITO (Saída) na Despesa (Credora) para neutralizar o débito original
                    conta_bancaria_id: null,
                    conta_contabil_id: contaDespesaCriacao,
                    origem: 'estorno_pagamento_manual',
                    historico_id: historicoId,
                    conta_resultado_id: null,
                };
                await supabase.from('lancamentos').insert(lancamentoEstornoDespesa);
            }
        }
        
        // 6. Deletar Registros de Pagamento
        const pagamentoIds = pagamentos.map(r => r.id);
        const { error: deletePagamentosError } = await supabase
            .from('admin_pagamentos')
            .delete()
            .in('id', pagamentoIds);
            
        if (deletePagamentosError) throw deletePagamentosError;
        
        // 7. Resetar a Parcela
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
        
        // 8. Resetar o status da conta sintética para 'pendente'
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
                                                              {isUndoing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : 'Estornar'}
                                                          </AlertDialogAction>
                                                      </AlertDialogFooter>
                                                  </AlertDialogContent>
                                              </AlertDialog>
                                          ) : (
                                              <Button size="sm" onClick={() => handleOpenPagamento(p)}>
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