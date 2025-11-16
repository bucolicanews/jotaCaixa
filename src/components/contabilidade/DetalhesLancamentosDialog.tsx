import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, ArrowUpCircle, ArrowDownCircle, Printer, Wallet, Landmark, Trash2 } from 'lucide-react';
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
import { useOwnerBranding } from '@/hooks/use-owner-branding'; // NOVO IMPORT

interface Lancamento {
  id: string;
  data_movimentacao: string;
  descricao: string;
  valor: number;
  tipo: 'Entrada' | 'Saida';
}

interface DetalhesLancamentosDialogProps {
  conta: SaldoContaDetalhada | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const formatDate = (dateString: string) => format(parseISO(dateString), 'dd/MM/yyyy HH:mm', { locale: ptBR });

const DetalhesLancamentosDialog: React.FC<DetalhesLancamentosDialogProps> = ({ conta, open, onOpenChange }) => {
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const { printContent } = usePrint();
  const { logoUrl, ownerName } = useOwnerBranding(); // USANDO HOOK DE BRANDING

  const fetchLancamentos = useCallback(async () => {
    if (!conta) return;
    setLoading(true);
    
    const { data, error } = await supabase
      .from('lancamentos')
      .select('id, data_movimentacao, descricao, valor, tipo')
      .eq('conta_bancaria_id', conta.id)
      .order('data_movimentacao', { ascending: false });

    if (error) {
      showError('Erro ao carregar lançamentos: ' + error.message);
      setLancamentos([]);
    } else {
      setLancamentos(data as Lancamento[]);
    }
    setLoading(false);
  }, [conta]);

  useEffect(() => {
    if (open) {
      fetchLancamentos();
    }
  }, [conta, open, fetchLancamentos]);

  const handleDeleteLancamento = async (lancamentoId: string) => {
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('lancamentos')
        .delete()
        .eq('id', lancamentoId);

      if (error) throw error;

      showSuccess('Lançamento excluído com sucesso!');
      fetchLancamentos(); // Recarrega a lista para atualizar o saldo
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
      showError("Não há dados para imprimir.");
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
                <td>${formatDate(l.data_movimentacao)}</td>
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
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Extrato da Conta: {conta?.nome}</DialogTitle>
          <DialogDescription>
            Detalhes de todas as movimentações (entradas e saídas) registradas nesta conta.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center items-center h-40"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 my-4">
                <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
                    <h4 className="text-sm font-medium text-muted-foreground flex items-center"><Wallet className="w-4 h-4 mr-2" />Saldo Inicial</h4>
                    <p className="text-xl font-bold mt-1">{formatCurrency(saldoInicial)}</p>
                </div>
                <div className="p-4 bg-green-100 dark:bg-green-900/20 rounded-lg">
                    <h4 className="text-sm font-medium text-green-700 dark:text-green-300 flex items-center"><ArrowUpCircle className="w-4 h-4 mr-2" />Total de Entradas</h4>
                    <p className="text-xl font-bold text-green-600 dark:text-green-400 mt-1">{formatCurrency(totalEntradas)}</p>
                </div>
                <div className="p-4 bg-red-100 dark:bg-red-900/20 rounded-lg">
                    <h4 className="text-sm font-medium text-red-700 dark:text-red-300 flex items-center"><ArrowDownCircle className="w-4 h-4 mr-2" />Total de Saídas</h4>
                    <p className="text-xl font-bold text-red-600 dark:text-red-400 mt-1">{formatCurrency(totalSaidas)}</p>
                </div>
                <div className={cn("p-4 rounded-lg", saldoFinal >= 0 ? "bg-blue-100 dark:bg-blue-900/20" : "bg-red-100 dark:bg-red-900/20")}>
                    <h4 className="text-sm font-medium flex items-center" style={{ color: saldoFinal >= 0 ? 'var(--color-blue-700)' : 'var(--color-red-700)' }}><Landmark className="w-4 h-4 mr-2" />Saldo Final</h4>
                    <p className={cn("text-xl font-bold mt-1", saldoFinal >= 0 ? "text-blue-600 dark:text-blue-400" : "text-red-600 dark:text-red-400")}>{formatCurrency(saldoFinal)}</p>
                </div>
            </div>
            <div className="mt-4 flex-1 overflow-y-auto border rounded-md">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead className="w-[20%]">Data</TableHead>
                    <TableHead className="w-[40%]">Descrição</TableHead>
                    <TableHead className="w-[15%]">Tipo</TableHead>
                    <TableHead className="w-[15%] text-right">Valor</TableHead>
                    <TableHead className="w-[10%] text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lancamentos.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        Nenhum lançamento encontrado para esta conta.
                      </TableCell>
                    </TableRow>
                  ) : (
                    lancamentos.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell>{formatDate(l.data_movimentacao)}</TableCell>
                        <TableCell>{l.descricao}</TableCell>
                        <TableCell>
                          <Badge variant={l.tipo === 'Entrada' ? 'success' : 'destructive'} className="flex items-center justify-center">
                            {l.tipo === 'Entrada' ? <ArrowUpCircle className="w-3 h-3 mr-1" /> : <ArrowDownCircle className="w-3 h-3 mr-1" />}
                            {l.tipo}
                          </Badge>
                        </TableCell>
                        <TableCell className={cn("text-right font-semibold", l.tipo === 'Entrada' ? 'text-green-600' : 'text-red-600')}>
                          {formatCurrency(l.valor)}
                        </TableCell>
                        <TableCell className="text-right">
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
                                        <AlertDialogAction onClick={() => handleDeleteLancamento(l.id)} disabled={isDeleting}>
                                            {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Excluir'}
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-end space-x-2 pt-4 border-t">
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