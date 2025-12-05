import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, CalendarCheck, DollarSign, Plus, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Badge } from './ui/badge';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './ui/alert-dialog';

interface ParcelaFutura {
  id: string;
  data_vencimento: string;
  valor_parcela: number;
  numero_parcela: number;
  status: 'aberta' | 'parcial' | 'paga' | 'reprogramada' | 'cancelada';
}

interface ContaSintetica {
  id: string;
  descricao: string;
  valor_total?: number;
  data_vencimento?: string;
  status: string;
  cliente_id: string;
  origem?: string;
  admin_id?: string;
  id_conta_patrimonial?: string;
}

interface ContaComParcelas {
  conta: ContaSintetica;
  parcelas: ParcelaFutura[];
}

interface ContasFuturasDialogProps {
  clienteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ContasFuturasDialog: React.FC<ContasFuturasDialogProps> = ({ clienteId, open, onOpenChange }) => {
  const [contasComParcelas, setContasComParcelas] = useState<ContaComParcelas[]>([]);
  const [loading, setLoading] = useState(true);
  const [lancando, setLancando] = useState<string | null>(null);

  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const formatDate = (dateString: string) => format(parseISO(dateString + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR });

  const fetchContasFuturas = useCallback(async () => {
    if (!clienteId) return;
    setLoading(true);

    try {
      // 1. Buscar TODAS as contas a receber do cliente (não apenas assinatura)
      const { data: contas, error: contasError } = await supabase
        .from('admin_contas_receber')
        .select('id, descricao, valor_total, data_vencimento, status, cliente_id, origem, admin_id, id_conta_patrimonial')
        .eq('cliente_id', clienteId)
        .order('created_at', { ascending: false });

      if (contasError) {
        showError('Erro ao buscar contas futuras: ' + contasError.message);
        setContasComParcelas([]);
        setLoading(false);
        return;
      }

      if (!contas || contas.length === 0) {
        setContasComParcelas([]);
        setLoading(false);
        return;
      }

      // 2. Para cada conta, buscar suas parcelas pendentes
      const contasComParcelasPromises = contas.map(async (conta) => {
        const { data: parcelas, error: parcelasError } = await supabase
          .from('admin_parcelas_receber')
          .select('id, data_vencimento, valor_parcela, numero_parcela, status')
          .eq('conta_receber_id', conta.id)
          .in('status', ['aberta', 'parcial', 'reprogramada'])
          .order('data_vencimento', { ascending: true });

        return {
          conta: conta as ContaSintetica,
          parcelas: (parcelas || []) as ParcelaFutura[],
        };
      });

      const resultado = await Promise.all(contasComParcelasPromises);
      
      // Filtrar contas que têm parcelas pendentes
      const contasFiltradas = resultado.filter(item => item.parcelas.length > 0);
      
      setContasComParcelas(contasFiltradas);
    } catch (error: any) {
      showError('Erro ao carregar contas futuras: ' + error.message);
      setContasComParcelas([]);
    }
    setLoading(false);
  }, [clienteId]);

  useEffect(() => {
    if (open) {
      fetchContasFuturas();
    }
  }, [open, fetchContasFuturas]);

  const handleLancarContaAoPagar = async (contaSintetica: ContaSintetica) => {
    setLancando(contaSintetica.id);

    try {
      if (!contaSintetica.admin_id) {
        showError('Dados da conta incompletos.');
        setLancando(null);
        return;
      }

      // 1. Verificar se conta a pagar já existe (evitar duplicata)
      const { data: contaExistente, error: checkError } = await supabase
        .from('contas_pagar')
        .select('id')
        .eq('cliente_id', clienteId)
        .ilike('Descricao', `%${contaSintetica.descricao}%`)
        .limit(1)
        .single();

      if (contaExistente) {
        showError('Esta conta a pagar já foi lançada.');
        setLancando(null);
        return;
      }

      // 2. Criar conta a pagar no cliente com os mesmos dados
      const { data: novaContaPagar, error: createError } = await supabase
        .from('contas_pagar')
        .insert({
          cliente_id: clienteId,
          Descricao: contaSintetica.descricao,
          valor_total: contaSintetica.valor_total || 0,
          data_vencimento: contaSintetica.data_vencimento,
          status: 'aberto',
          origem: 'contas_futuras', // Rastreabilidade
          conta_origem_admin_id: contaSintetica.id, // Vínculo com a conta original do Admin
        })
        .select('id')
        .single();

      if (createError) {
        showError('Erro ao criar conta a pagar: ' + createError.message);
        setLancando(null);
        return;
      }

      // 3. Buscar todas as parcelas da conta original
      const { data: parcelasOrigem, error: parcelasError } = await supabase
        .from('admin_parcelas_receber')
        .select('*')
        .eq('conta_receber_id', contaSintetica.id);

      if (parcelasError) {
        showError('Erro ao buscar parcelas: ' + parcelasError.message);
        setLancando(null);
        return;
      }

      // 4. Criar parcelas correspondentes na conta a pagar do cliente
      if (parcelasOrigem && parcelasOrigem.length > 0) {
        const novasParcelas = parcelasOrigem.map((parcela: any) => ({
          conta_pagar_id: novaContaPagar.id,
          cliente_id: clienteId,
          numero_parcela: parcela.numero_parcela,
          valor_parcela: parcela.valor_parcela,
          data_vencimento: parcela.data_vencimento,
          status: parcela.status === 'aberta' ? 'aberta' : 'aberta', // Todas começam abertas
        }));

        const { error: insertParcelasError } = await supabase
          .from('parcelas_contas_pagar')
          .insert(novasParcelas);

        if (insertParcelasError) {
          showError('Erro ao criar parcelas: ' + insertParcelasError.message);
          setLancando(null);
          return;
        }
      }

      showSuccess(`Conta "${contaSintetica.descricao}" lançada em Contas a Pagar com sucesso!`);
      setLancando(null);
      fetchContasFuturas(); // Recarregar lista
    } catch (error: any) {
      showError('Erro ao lançar conta: ' + error.message);
      setLancando(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <DollarSign className="w-5 h-5 mr-2" /> Contas Futuras
          </DialogTitle>
          <DialogDescription>
            Contas a receber lançadas pelo Admin que ainda não foram adicionadas às suas contas a pagar.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center items-center h-40">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : contasComParcelas.length === 0 ? (
          <Card className="border-blue-500/50 bg-blue-50 dark:bg-blue-900/20">
            <CardContent className="p-6 text-center text-muted-foreground flex flex-col items-center gap-2">
              <AlertCircle className="w-6 h-6" />
              <p>Nenhuma conta a receber pendente encontrada.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="mt-4 space-y-6">
            {contasComParcelas.map((item) => (
              <Card key={item.conta.id} className="border border-gray-300">
                <CardContent className="p-4">
                  {/* Cabeçalho da Conta */}
                  <div className="flex justify-between items-center mb-4 pb-4 border-b">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">{item.conta.descricao}</h3>
                      <p className="text-sm text-muted-foreground">
                        {item.conta.origem === 'assinatura_recorrente' && '📅 Assinatura Recorrente'}
                        {item.conta.origem !== 'assinatura_recorrente' && item.conta.origem && `🏷️ ${item.conta.origem}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-primary">
                        {formatCurrency(item.conta.valor_total || item.parcelas.reduce((sum, p) => sum + p.valor_parcela, 0))}
                      </div>
                      <Badge variant={item.conta.status === 'aberto' ? 'info' : 'warning'}>
                        {item.conta.status}
                      </Badge>
                    </div>
                  </div>

                  {/* Tabela de Parcelas */}
                  <div className="mb-4 border rounded-md overflow-hidden">
                    <Table className="text-sm">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[70px]">Parcela</TableHead>
                          <TableHead>Vencimento</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                          <TableHead className="text-center">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {item.parcelas.map((parcela) => (
                          <TableRow key={parcela.id}>
                            <TableCell className="font-medium">#{parcela.numero_parcela}</TableCell>
                            <TableCell>
                              <CalendarCheck className="w-4 h-4 mr-2 inline-block" />
                              {formatDate(parcela.data_vencimento)}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {formatCurrency(parcela.valor_parcela)}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant={parcela.status === 'aberta' ? 'info' : 'warning'}>
                                {parcela.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Botão de Ação */}
                  <div className="flex justify-end">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="default" size="sm" disabled={lancando === item.conta.id}>
                          {lancando === item.conta.id ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Lançando...
                            </>
                          ) : (
                            <>
                              <Plus className="w-4 h-4 mr-2" />
                              Lançar em Contas a Pagar
                            </>
                          )}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Confirmar Lançamento</AlertDialogTitle>
                          <AlertDialogDescription>
                            Deseja lançar "{item.conta.descricao}" com {item.parcelas.length} parcela(s) em suas Contas a Pagar?
                            <br />
                            <br />
                            <strong>Total:</strong> {formatCurrency(item.conta.valor_total || item.parcelas.reduce((sum, p) => sum + p.valor_parcela, 0))}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleLancarContaAoPagar(item.conta)}>
                            Confirmar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ContasFuturasDialog;
