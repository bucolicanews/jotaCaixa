import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, ListChecks } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { Badge } from './ui/badge';
import { format, parseISO, isPast, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Parcela {
  id: string;
  numero_parcela: number;
  valor_parcela: number;
  valor_pago: number;
  data_vencimento: string;
  status: 'aberta' | 'parcial' | 'paga' | 'reprogramada' | 'cancelada';
}

interface DetalhesAssinaturaDialogProps {
  contaRecorrenciaId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const getBadgeVariant = (status: Parcela['status']): 'success' | 'warning' | 'secondary' | 'destructive' | 'default' | 'info' => {
  const vencimento = parseISO(status === 'paga' ? '2000-01-01' : new Date().toISOString()); // Ignora vencimento se pago/cancelado

  if (status === 'paga') return 'success';
  if (status === 'cancelada') return 'destructive';
  
  if (isPast(vencimento) && !isToday(vencimento)) return 'destructive';
  if (isToday(vencimento) || status === 'parcial' || status === 'reprogramada') return 'warning';

  return 'info';
};

const DetalhesAssinaturaDialog: React.FC<DetalhesAssinaturaDialogProps> = ({ contaRecorrenciaId, open, onOpenChange }) => {
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchParcelas = async () => {
    if (!contaRecorrenciaId) return;
    setLoading(true);
    
    // Busca todas as parcelas vinculadas à conta sintética de recorrência
    const { data, error } = await supabase
      .from('admin_parcelas_receber')
      .select('*')
      .eq('conta_receber_id', contaRecorrenciaId)
      .order('numero_parcela', { ascending: false }); // Mais recente primeiro

    if (error) {
      showError('Erro ao carregar parcelas da assinatura: ' + error.message);
      setParcelas([]);
    } else {
      setParcelas(data as Parcela[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open && contaRecorrenciaId) {
      fetchParcelas();
    }
  }, [contaRecorrenciaId, open]);

  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const formatDate = (dateString: string) => format(parseISO(dateString + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center"><ListChecks className="w-5 h-5 mr-2" /> Detalhes da Recorrência</DialogTitle>
          <DialogDescription>Histórico de parcelas geradas para sua assinatura.</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center items-center h-40"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <div className="mt-4">
            <div className="border rounded-md">
              <Table>
                <TableHeader><TableRow><TableHead className="w-[80px]">Parcela</TableHead><TableHead>Vencimento</TableHead><TableHead>Valor</TableHead><TableHead>Pago</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {parcelas.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.numero_parcela}</TableCell>
                      <TableCell>{formatDate(p.data_vencimento)}</TableCell>
                      <TableCell>{formatCurrency(p.valor_parcela)}</TableCell>
                      <TableCell className="font-medium">{formatCurrency(p.valor_pago || 0)}</TableCell>
                      <TableCell><Badge variant={getBadgeVariant(p.status)}>{p.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default DetalhesAssinaturaDialog;