import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, CalendarCheck, DollarSign } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Badge } from './ui/badge';
import { Card, CardContent } from './ui/card';

interface ContaReceberDetalhe {
  descricao: string;
}

interface ParcelaFutura {
  id: string;
  data_vencimento: string;
  valor_parcela: number;
  numero_parcela: number;
  status: 'aberta' | 'parcial' | 'paga' | 'reprogramada' | 'cancelada';
  admin_contas_receber: ContaReceberDetalhe[] | null; 
}

interface ContaSintetica {
    id: string;
    descricao: string;
    valor_total: number;
    data_vencimento: string;
    status: string;
    cliente_id: string;
}

interface ContasFuturasDialogProps {
  clienteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ContasFuturasDialog: React.FC<ContasFuturasDialogProps> = ({ clienteId, open, onOpenChange }) => {
  const [parcelas, setParcelas] = useState<ParcelaFutura[]>([]);
  const [contaSintetica, setContaSintetica] = useState<ContaSintetica | null>(null);
  const [loading, setLoading] = useState(true);

  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const formatDate = (dateString: string) => format(parseISO(dateString + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR });

  const fetchParcelasFuturas = useCallback(async () => {
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
        setParcelas([]);
        setLoading(false);
        return;
    }
    
    if (!contaRecorrencia) {
        setContaSintetica(null);
        setParcelas([]);
        setLoading(false);
        return;
    }
    
    setContaSintetica(contaRecorrencia as ContaSintetica);
    
    // 2. Buscar todas as parcelas (analítico) vinculadas a essa conta sintética que não foram pagas
    const { data, error } = await supabase
      .from('admin_parcelas_receber')
      .select(`
        id,
        data_vencimento,
        valor_parcela,
        numero_parcela,
        status,
        admin_contas_receber ( descricao )
      `)
      .eq('conta_receber_id', contaRecorrencia.id)
      .in('status', ['aberta', 'parcial', 'reprogramada']) // Apenas parcelas pendentes/futuras
      .order('data_vencimento', { ascending: true });

    if (error) {
      showError('Erro ao carregar contas futuras: ' + error.message);
      setParcelas([]);
    } else {
      setParcelas(data as ParcelaFutura[]); 
    }
    setLoading(false);
  }, [clienteId]);

  useEffect(() => {
    if (open) {
      fetchParcelasFuturas();
    }
  }, [open, fetchParcelasFuturas]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[90vw] max-h-[90vh] overflow-y-auto">
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
                            <span className="font-semibold">Conta Sintética:</span>
                            <span>{contaSintetica.descricao}</span>
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
                <p className="text-center text-muted-foreground">Nenhuma conta de recorrência ativa encontrada.</p>
            )}

            {/* Lista de Parcelas */}
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">Parcela</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parcelas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-4 text-muted-foreground">
                        Nenhuma parcela futura encontrada.
                      </TableCell>
                    </TableRow>
                  ) : (
                    parcelas.map((p) => {
                        // Acessa a descrição do primeiro item do array (ou usa fallback)
                        const descricao = p.admin_contas_receber?.[0]?.descricao || 'Mensalidade Recorrente';
                        
                        return (
                          <TableRow key={p.id}>
                            <TableCell className="font-medium">{p.numero_parcela}</TableCell>
                            <TableCell>{descricao}</TableCell>
                            <TableCell><CalendarCheck className="w-4 h-4 mr-2 inline-block" />{formatDate(p.data_vencimento)}</TableCell>
                            <TableCell className="text-right font-semibold">{formatCurrency(p.valor_parcela)}</TableCell>
                            <TableCell className="text-center"><Badge variant={p.status === 'aberta' ? 'info' : 'warning'}>{p.status}</Badge></TableCell>
                          </TableRow>
                        );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ContasFuturasDialog;