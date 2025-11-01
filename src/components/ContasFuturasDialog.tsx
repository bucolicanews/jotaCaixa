import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, DollarSign } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Badge } from './ui/badge';
import { Card, CardContent } from './ui/card';

interface ContaSintetica {
    id: string;
    descricao: string;
    valor_total: number;
    data_vencimento: string;
    status: string;
    cliente_id: string; // Adicionando cliente_id
}

interface ContasFuturasDialogProps {
  clienteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ContasFuturasDialog: React.FC<ContasFuturasDialogProps> = ({ clienteId, open, onOpenChange }) => {
  const [contaSintetica, setContaSintetica] = useState<ContaSintetica | null>(null);
  const [loading, setLoading] = useState(true);

  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const formatDate = (dateString: string) => format(parseISO(dateString + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR });

  const fetchContaSintetica = useCallback(async () => {
    if (!clienteId) return;
    setLoading(true);

    // 1. Buscar a conta sintética de recorrência do cliente (admin_contas_receber)
    const { data: contaRecorrencia, error: contaError } = await supabase
        .from('admin_contas_receber')
        .select('id, descricao, valor_total, data_vencimento, status, cliente_id')
        .eq('cliente_id', clienteId)
        .eq('origem', 'assinatura_recorrente')
        .limit(1)
        .single();
        
    if (contaError && contaError.code !== 'PGRST116') { // PGRST116 = No rows found
        showError('Erro ao buscar conta de recorrência: ' + contaError.message);
        setContaSintetica(null);
        setLoading(false);
        return;
    }
    
    setContaSintetica(contaRecorrencia as ContaSintetica || null);
    setLoading(false);
  }, [clienteId]);

  useEffect(() => {
    if (open) {
      fetchContaSintetica();
    }
  }, [open, fetchContaSintetica]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <DollarSign className="w-5 h-5 mr-2" /> Contas Futuras de Assinatura
          </DialogTitle>
          <DialogDescription>
            ID do Cliente Logado (cliente_id): <span className="font-mono text-primary">{clienteId}</span>
          </DialogDescription>
        </DialogHeader>
        
        {loading ? (
          <div className="flex justify-center items-center h-40"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <div className="mt-4 space-y-4">
            
            {/* Detalhes da Conta Sintética */}
            {contaSintetica ? (
                <Card className="border-blue-500/50 bg-blue-50 dark:bg-blue-900/20">
                    <CardContent className="p-4 text-sm space-y-1">
                        <div className="flex justify-between">
                            <span className="font-semibold">ID da Conta Sintética:</span>
                            <span className="font-mono text-xs">{contaSintetica.id}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="font-semibold">Descrição:</span>
                            <span>{contaSintetica.descricao}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="font-semibold">Valor Total Recorrente:</span>
                            <span>{formatCurrency(contaSintetica.valor_total)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="font-semibold">Próximo Vencimento Sintético:</span>
                            <span>{formatDate(contaSintetica.data_vencimento)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="font-semibold">Status Sintético:</span>
                            <Badge variant="secondary">{contaSintetica.status}</Badge>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <p className="text-center text-muted-foreground">Nenhuma conta de recorrência ativa encontrada para o cliente {clienteId}.</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ContasFuturasDialog;