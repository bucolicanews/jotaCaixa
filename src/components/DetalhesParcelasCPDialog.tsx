import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, BadgeDollarSign } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { useSessao } from '@/hooks/use-sessao';
import { AdminContaPagar, AdminParcelaPagar } from '@/types/contas-pagar';
import RegistrarPagamentoCPDialog from './RegistrarPagamentoCPDialog';

interface ParcelaParaPagamento extends AdminParcelaPagar {
  fornecedor: string;
}

interface DetalhesParcelasCPDialogProps {
  conta: AdminContaPagar | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDataChange: () => void;
}

const DetalhesParcelasCPDialog: React.FC<DetalhesParcelasCPDialogProps> = ({ conta, open, onOpenChange, onDataChange }) => {
  const { role } = useSessao();
  const [parcelas, setParcelas] = useState<AdminParcelaPagar[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagamentoDialogOpen, setPagamentoDialogOpen] = useState(false);
  const [parcelaSelecionada, setParcelaSelecionada] = useState<ParcelaParaPagamento | null>(null);

  const fetchParcelas = useCallback(async () => {
    if (!conta) return;
    setLoading(true);
    
    // Admin sempre usa admin_parcelas_pagar
    const tabelaParcelas = 'admin_parcelas_pagar';
    
    const { data, error } = await supabase
      .from(tabelaParcelas)
      .select('*')
      .eq('conta_pagar_id', conta.id)
      .order('numero_parcela', { ascending: true });

    if (error) {
      showError('Erro ao carregar parcelas: ' + error.message);
      setParcelas([]);
    } else {
      setParcelas(data as AdminParcelaPagar[]);
    }
    setLoading(false);
  }, [conta]);

  useEffect(() => {
    if (open) {
      fetchParcelas();
    }
  }, [conta, open, fetchParcelas]);

  const handleOpenPagamento = (parcela: AdminParcelaPagar) => {
    if (!conta) return;
    
    const mappedParcela: ParcelaParaPagamento = {
        ...parcela,
        fornecedor: conta.fornecedor, // Injetando o fornecedor
    };
    
    setParcelaSelecionada(mappedParcela);
    setPagamentoDialogOpen(true);
  };

  const handlePagamentoCompleto = () => {
    setPagamentoDialogOpen(false);
    fetchParcelas(); // Re-busca as parcelas deste dialog
    onDataChange(); // Avisa a página principal para re-buscar tudo
  };

  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const formatDate = (dateString: string) => new Date(dateString + 'T00:00:00').toLocaleDateString('pt-BR');

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do Lançamento</DialogTitle>
            <DialogDescription><strong>{conta?.descricao}</strong> para o fornecedor <strong>{conta?.fornecedor || 'N/A'}</strong></DialogDescription>
          </DialogHeader>
          {loading ? (
            <div className="flex justify-center items-center h-40"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : (
            <div className="mt-4">
              <h3 className="font-semibold mb-2">Parcelas</h3>
              <div className="border rounded-md">
                <Table>
                  <TableHeader><TableRow><TableHead className="w-[80px]">Parcela</TableHead><TableHead>Vencimento</TableHead><TableHead>Valor</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {parcelas.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.numero_parcela}</TableCell>
                        <TableCell>{formatDate(p.data_vencimento)}</TableCell>
                        <TableCell>{formatCurrency(p.valor_parcela)}</TableCell>
                        <TableCell><Badge variant={p.status === 'paga' ? 'default' : 'secondary'}>{p.status}</Badge></TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" onClick={() => handleOpenPagamento(p)} disabled={p.status === 'paga' || p.status === 'cancelada'}>
                            <BadgeDollarSign className="w-4 h-4 mr-2" />Registrar Pagamento
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <RegistrarPagamentoCPDialog
        parcela={parcelaSelecionada}
        open={pagamentoDialogOpen}
        onOpenChange={setPagamentoDialogOpen}
        onSaveComplete={handlePagamentoCompleto}
      />
    </>
  );
};

export default DetalhesParcelasCPDialog;