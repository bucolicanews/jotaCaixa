import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, BadgeDollarSign } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ContaReceber } from '@/types/contas-receber';
import { showError } from '@/utils/toast';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import RegistrarPagamentoDialog from './RegistrarPagamentoDialog';
import { useSessao } from '@/hooks/use-sessao'; // Importando useSessao

interface Parcela {
  id: string;
  conta_receber_id: string;
  empresa_id: string;
  numero_parcela: number;
  valor_parcela: number;
  valor_pago: number;
  data_vencimento: string;
  status: 'aberta' | 'parcial' | 'paga' | 'reprogramada' | 'cancelada';
}

interface DetalhesParcelasDialogProps {
  conta: ContaReceber | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDataChange: () => void;
}

const DetalhesParcelasDialog: React.FC<DetalhesParcelasDialogProps> = ({ conta, open, onOpenChange, onDataChange }) => {
  const { role } = useSessao();
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagamentoDialogOpen, setPagamentoDialogOpen] = useState(false);
  const [parcelaSelecionada, setParcelaSelecionada] = useState<Parcela | null>(null);

  const fetchParcelas = useCallback(async () => {
    if (!conta) return;
    setLoading(true);
    
    // Determina a tabela correta com base na role
    const tabelaParcelas = role === 'Admin' ? 'admin_parcelas_receber' : 'parcelas_contas_receber';
    
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
  }, [conta, role]); // Adicionando 'role' como dependência

  useEffect(() => {
    if (open) {
      fetchParcelas();
    }
  }, [conta, open, fetchParcelas]); // Adicionando fetchParcelas como dependência

  const handleOpenPagamento = (parcela: Parcela) => {
    setParcelaSelecionada(parcela);
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
            <DialogDescription><strong>{conta?.descricao}</strong> para o cliente <strong data-dyad-id="src\components\DetalhesParcelasDialog.tsx:104:100" data-dyad-name="strong">{conta?.clientes?.nome || 'N/A'}</strong></DialogDescription>
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
      <RegistrarPagamentoDialog
        parcela={parcelaSelecionada}
        open={pagamentoDialogOpen}
        onOpenChange={setPagamentoDialogOpen}
        onSaveComplete={handlePagamentoCompleto}
      />
    </>
  );
};

export default DetalhesParcelasDialog;