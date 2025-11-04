import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Badge } from './ui/badge';
import { cn } from '@/lib/utils';

interface Lancamento {
  id: string;
  data_movimentacao: string;
  descricao: string;
  valor: number;
  tipo: 'Entrada' | 'Saida';
}

interface DetalhesLancamentosDialogProps {
  conta: { id: string; nome: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const formatDate = (dateString: string) => format(parseISO(dateString), 'dd/MM/yyyy HH:mm', { locale: ptBR });

const DetalhesLancamentosDialog: React.FC<DetalhesLancamentosDialogProps> = ({ conta, open, onOpenChange }) => {
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLancamentos = useCallback(async () => {
    if (!conta) return;
    setLoading(true);
    
    const { data, error } = await supabase
      .from('lancamentos')
      .select('*')
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

  const totalEntradas = lancamentos.filter(l => l.tipo === 'Entrada').reduce((sum, l) => sum + l.valor, 0);
  const totalSaidas = lancamentos.filter(l => l.tipo === 'Saida').reduce((sum, l) => sum + l.valor, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
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
            <div className="grid grid-cols-2 gap-4 my-4">
                <div className="p-4 bg-green-100 dark:bg-green-900/20 rounded-lg">
                    <h4 className="text-sm font-medium text-green-700 dark:text-green-300">Total de Entradas</h4>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">{formatCurrency(totalEntradas)}</p>
                </div>
                <div className="p-4 bg-red-100 dark:bg-red-900/20 rounded-lg">
                    <h4 className="text-sm font-medium text-red-700 dark:text-red-300">Total de Saídas</h4>
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">{formatCurrency(totalSaidas)}</p>
                </div>
            </div>
            <div className="mt-4 flex-1 overflow-y-auto border rounded-md">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead className="w-[150px]">Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="w-[100px]">Tipo</TableHead>
                    <TableHead className="w-[120px] text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lancamentos.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
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
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default DetalhesLancamentosDialog;