import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatarData } from '@/utils/formatters';
import { AdminContaPagar, AdminParcelaPagar, ExtendedParcelaPagar } from '@/types/contas-pagar';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { useSessao } from '@/hooks/use-sessao';
import { getBadgeVariant } from '@/utils/badge-variants';
import { format } from 'date-fns';
import { Badge } from './ui/badge';
import { CheckCircle, XCircle, Clock, Repeat, DollarSign } from 'lucide-react';
import RegistrarPagamentoCPDialog from './RegistrarPagamentoCPDialog';

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Detalhes das Parcelas - {conta.fornecedor}</DialogTitle>
          <DialogDescription>
            {conta.descricao} | Valor Total: {formatCurrency(conta.valor_total)}
          </DialogDescription>
        </DialogHeader>
        
        <div className="overflow-x-auto">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Nº</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead className="text-right">Pago</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {loading ? (
                        <TableRow><TableCell colSpan={6} className="text-center">Carregando...</TableCell></TableRow>
                    ) : parcelas.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="text-center">Nenhuma parcela encontrada.</TableCell></TableRow>
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
                                    <TableCell className="text-right">
                                        {!isPaga && (
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
                onOpenChange={(open) => setPagamentoDialog({ open, parcela: null })}
                parcela={pagamentoDialog.parcela}
                onSaveComplete={handlePagamentoComplete}
            />
        )}
      </DialogContent>
    </Dialog>
  );
};

export default DetalhesParcelasCPDialog;