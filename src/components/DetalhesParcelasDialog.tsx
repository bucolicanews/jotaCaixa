import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, BadgeDollarSign, DollarSign } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ContaReceber } from '@/types/contas-receber';
import { showError } from '@/utils/toast';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import RegistrarPagamentoDialog from '@/components/contas-receber/RegistrarPagamentoDialog';
import { useSessao } from '@/hooks/use-sessao';
import { cn } from '@/lib/utils';
import { Card, CardContent } from './ui/card';
import { Progress } from './ui/progress';

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
  const [parcelaSelecionada, setParcelaSelecionada] = useState<ParcelaParaPagamento | null>(null);

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
  }, [conta, role]);

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

  const handlePagamentoCompleto = () => {
    setPagamentoDialogOpen(false);
    fetchParcelas(); // Re-busca as parcelas deste dialog
    onDataChange(); // Avisa a página principal para re-buscar tudo
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
        <DialogContent className="w-full max-w-full sm:max-w-3xl max-h-[90vh] flex flex-col">
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
                        <TableHead className="w-[100px]">Status</TableHead>
                        <TableHead className="w-[120px] text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parcelas.map((p) => {
                        const isPaga = p.status === 'paga';
                        return (
                            <TableRow key={p.id} className={cn(isPaga && 'bg-green-500/10')}>
                                <TableCell className="font-medium">{p.numero_parcela}</TableCell>
                                <TableCell>{formatDate(p.data_vencimento)}</TableCell>
                                <TableCell>{formatCurrency(p.valor_parcela)}</TableCell>
                                <TableCell>
                                    <Badge variant={isPaga ? 'success' : 'secondary'}>
                                        {getStatusDisplay(p.status)}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                    <Button variant="outline" size="sm" onClick={() => handleOpenPagamento(p)} disabled={isPaga || p.status === 'cancelada'}>
                                        <BadgeDollarSign className="w-4 h-4 mr-2 hidden sm:inline" />Receber
                                    </Button>
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