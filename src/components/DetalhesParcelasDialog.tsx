import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatarData } from '@/utils/formatters';
import { Parcela, ContaReceber } from '@/types/contas-receber';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useSessao } from '@/hooks/use-sessao';
import { getBadgeVariant } from '@/utils/badge-variants';
import { Badge } from './ui/badge';
import { DollarSign, Undo2, Loader2, Edit, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import FormParcelaReceberDialog from '@/components/formularios/FormParcelaReceberDialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './ui/alert-dialog';
import { Progress } from './ui/progress';

// Tipos auxiliares para o diálogo
interface RecebimentoSimples {
    id: string;
    valor_recebido: number;
    conta_id: string;
    historico_id: string | null;
}

interface DetalhesParcelasDialogProps {
  conta: ContaReceber | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDataChange: (parcela?: Parcela) => void; // Adicionado Parcela como opcional
}

const DetalhesParcelasDialog: React.FC<DetalhesParcelasDialogProps> = ({ conta, open, onOpenChange, onDataChange }) => {
  const { usuario, role } = useSessao();
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [loading, setLoading] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [parcelaParaEdicao, setParcelaParaEdicao] = useState<Parcela | null>(null);
  const [dialogEdicaoAberto, setDialogEdicaoAberto] = useState(false);

  const isAdmin = role === 'Admin';
  const tabelaParcelas = isAdmin ? 'admin_parcelas_receber' : 'parcelas_contas_receber';
  const tabelaRecebimentos = isAdmin ? 'admin_recebimentos' : 'recebimentos';
  const tabelaContasReceber = isAdmin ? 'admin_contas_receber' : 'contas_receber';
  const ownerKey = isAdmin ? 'admin_id' : 'empresa_id';

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
  }, [open, fetchParcelas]);
  
  const handleEditParcela = (parcela: Parcela) => {
      if (parcela.status === 'paga' || parcela.status === 'cancelada' || parcela.status === 'bloqueada') {
          showError('Não é possível editar parcelas pagas, canceladas ou bloqueadas.');
          return;
      }
      setParcelaParaEdicao(parcela);
      setDialogEdicaoAberto(true);
  };
  
  const handleParcelaSaveComplete = () => {
      setDialogEdicaoAberto(false);
      fetchParcelas();
      onDataChange(); // Notifica a página pai para recarregar o sintético
  };
  
  const handleOpenPagamento = (parcela: Parcela) => {
      // Ação de abrir o diálogo de pagamento (delegada ao componente pai)
      onDataChange(parcela); 
  };
  
  const handleDeleteParcela = async (parcelaId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta parcela?')) return;

    const { error } = await supabase
      .from(tabelaParcelas)
      .delete()
      .eq('id', parcelaId);

    if (error) {
      showError('Erro ao excluir parcela: ' + error.message);
    } else {
      showSuccess('Parcela excluída com sucesso.');
      fetchParcelas();
      onDataChange();
    }
  };
  
  const handleUndoPayment = async (parcela: Parcela) => {
    if (!usuario?.id || !conta) return;
    setIsUndoing(true);
    
    const ownerId = conta.empresa_id;
    const contaReceberId = conta.id;
    const contaReceberIdShort = contaReceberId.substring(0, 8);
    
    try {
        // 1. Buscar o registro de recebimento associado
        const { data: recebimentosData, error: recebimentoError } = await supabase
            .from(tabelaRecebimentos)
            .select('id, valor_recebido, conta_id, historico_id')
            .eq('parcela_id', parcela.id);
            
        if (recebimentoError) throw recebimentoError;
        const recebimentos = recebimentosData as RecebimentoSimples[];
        
        if (recebimentos.length === 0) {
            showError('Nenhum registro de recebimento encontrado para estornar.');
            setIsUndoing(false);
            return;
        }
        
        const totalEstornado = recebimentos.reduce((sum, r) => sum + r.valor_recebido, 0);
        const dataEstornoISO = new Date().toISOString();
        
        // 2. Gerar Lançamentos de Estorno (Reversão)
        
        // 2.1. Débito (Clientes/Direito a Receber) - D: CLIENTES (AUMENTA O DIREITO A RECEBER)
        if (conta.id_conta_patrimonial) {
            const lancamentoEstornoPatrimonial = {
                proprietario_id: ownerId,
                data_movimentacao: dataEstornoISO,
                descricao: `Estorno Recebimento CR: ${conta.descricao} (CR ID: ${contaReceberIdShort})`,
                valor: totalEstornado,
                tipo: 'Entrada' as const, // Entrada no Ativo (Débito) para restaurar o direito
                conta_bancaria_id: null,
                conta_contabil_id: conta.id_conta_patrimonial,
                origem: 'estorno_recebimento_manual',
                historico_id: recebimentos[0].historico_id,
            };
            await supabase.from('lancamentos').insert(lancamentoEstornoPatrimonial);
        }
        
        // 2.2. Crédito (Caixa/Banco) - C: CAIXA/BANCO (DIMINUI O CAIXA)
        // Precisamos buscar o conta_contabil_id da conta de saldo (Caixa/Banco)
        const saldoContaIds = recebimentos.map(r => r.conta_id);
        const { data: saldosData } = await supabase
            .from('saldo_contas')
            .select('id, conta_contabil_id')
            .in('id', saldoContaIds);
            
        const saldoContaMap = (saldosData || []).reduce((acc, s) => {
            if (s.conta_contabil_id) acc[s.id] = s.conta_contabil_id;
            return acc;
        }, {} as Record<string, string>);
        
        for (const recebimento of recebimentos) {
            const contaContabilCaixaBanco = saldoContaMap[recebimento.conta_id];
            
            if (!contaContabilCaixaBanco) {
                console.warn(`Aviso: Conta de saldo ${recebimento.conta_id} sem vínculo contábil para estorno.`);
                continue;
            }
            
            const lancamentoEstornoAtivo = {
                proprietario_id: ownerId,
                data_movimentacao: dataEstornoISO,
                descricao: `Estorno Recebimento Ativo CR: ${conta.clientes?.nome || 'N/A'} (Parcela ID: ${parcela.id.substring(0, 8)})`,
                valor: recebimento.valor_recebido,
                tipo: 'Saida' as const, // Saída do Ativo (Crédito) para diminuir o saldo
                conta_bancaria_id: recebimento.conta_id,
                conta_contabil_id: contaContabilCaixaBanco, // <-- USANDO CONTA CONTÁBIL DO SALDO
                origem: 'estorno_recebimento_manual',
                historico_id: recebimento.historico_id,
            };
            await supabase.from('lancamentos').insert(lancamentoEstornoAtivo);
        }
        
        // 3. Deletar Registros de Recebimento
        const recebimentoIds = recebimentos.map(r => r.id);
        const { error: deleteRecebimentosError } = await supabase
            .from(tabelaRecebimentos)
            .delete()
            .in('id', recebimentoIds);
            
        if (deleteRecebimentosError) throw deleteRecebimentosError;
        
        // 4. Resetar a Parcela
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
        
        // 5. Resetar o status da conta sintética para 'aberta'
        const { error: updateContaError } = await supabase
            .from(tabelaContasReceber)
            .update({ status: 'aberta' })
            .eq('id', contaReceberId);
            
        if (updateContaError) console.error('Erro ao atualizar conta sintética para aberta:', updateContaError);
        
        showSuccess('Recebimento estornado com sucesso! Saldos reajustados.');
        handleParcelaSaveComplete();
        
    } catch (error: any) {
        console.error('Erro ao estornar recebimento:', error);
        showError('Falha ao estornar recebimento: ' + error.message);
    } finally {
        setIsUndoing(false);
    }
  };

  const totalValor = useMemo(() => parcelas.reduce((sum, p) => sum + p.valor_parcela, 0), [parcelas]);
  const totalPago = useMemo(() => parcelas.reduce((sum, p) => sum + (p.valor_pago || 0), 0), [parcelas]);
  const progressoPercentual = totalValor > 0 ? Math.round((totalPago / totalValor) * 100) : 0;

  if (!conta) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes das Parcelas - {conta.clientes?.nome}</DialogTitle>
            <DialogDescription>
              {conta.descricao} | Valor Total: {formatCurrency(conta.valor_total)}
            </DialogDescription>
          </DialogHeader>
          
          <Card className="mb-4">
              <CardContent className="p-4 space-y-3">
                  <div className="flex justify-between items-center">
                      <div className="flex items-center space-x-2">
                          <DollarSign className="w-5 h-5 text-primary" />
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
                          <TableHead className="text-right">Recebido</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Data Recebimento</TableHead>
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
                                          <Button variant="ghost" size="icon" onClick={() => handleEditParcela(p)} disabled={isPaga || p.status === 'bloqueada'}>
                                              <Edit className="w-4 h-4" />
                                          </Button>
                                          {isPaga ? (
                                              <AlertDialog>
                                                  <AlertDialogTrigger asChild>
                                                      <Button variant="destructive" size="icon" disabled={isUndoing}>
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
                                                              {isUndoing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : 'Estornar'}
                                                          </AlertDialogAction>
                                                      </AlertDialogFooter>
                                                  </AlertDialogContent>
                                              </AlertDialog>
                                          ) : (
                                              <Button size="sm" onClick={() => handleOpenPagamento(p)} disabled={p.status === 'bloqueada'}>
                                                  <DollarSign className="w-4 h-4" /> Receber
                                              </Button>
                                          )}
                                          <Button variant="ghost" size="icon" onClick={() => handleDeleteParcela(p.id)} disabled={isPaga || p.status === 'bloqueada'}>
                                              <Trash2 className="w-4 h-4 text-red-500" />
                                          </Button>
                                      </TableCell>
                                  </TableRow>
                              );
                          })
                      )}
                  </TableBody>
              </Table>
          </div>
          
          {parcelaParaEdicao && (
              <FormParcelaReceberDialog
                  open={dialogEdicaoAberto}
                  onOpenChange={setDialogEdicaoAberto}
                  parcelaInicial={parcelaParaEdicao}
                  onSaveComplete={handleParcelaSaveComplete}
                  tabelaParcelas={tabelaParcelas}
              />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DetalhesParcelasDialog;