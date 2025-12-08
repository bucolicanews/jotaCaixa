import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, CalendarCheck, DollarSign, Plus, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Badge } from './ui/badge';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Label } from './ui/label';
import { PlanoContas } from '@/types/plano-contas';
import { Historico } from '@/types/historico';
import { useContabilConfig } from '@/hooks/use-contabil-config';

interface ParcelaFutura {
  id: string;
  data_vencimento: string;
  valor_parcela: number;
  numero_parcela: number;
  status: 'aberta' | 'parcial' | 'paga' | 'reprogramada' | 'cancelada';
  ciente_cliente?: boolean;
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
  parcelasLancadas: ParcelaFutura[];
  nomeAdmin?: string;
}

interface ContasFuturasDialogProps {
  clienteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLancamentoComplete?: () => void;
}

const ContasFuturasDialog: React.FC<ContasFuturasDialogProps> = ({ clienteId, open, onOpenChange, onLancamentoComplete }) => {
  const { configMap } = useContabilConfig();
  const [contasComParcelas, setContasComParcelas] = useState<ContaComParcelas[]>([]);
  const [loading, setLoading] = useState(true);
  const [lancando, setLancando] = useState<string | null>(null);
  
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [itemSelecionado, setItemSelecionado] = useState<ContaComParcelas | null>(null);
  const [contasAnaliticas, setContasAnaliticas] = useState<PlanoContas[]>([]);
  const [historicos, setHistoricos] = useState<Historico[]>([]);
  const [loadingContas, setLoadingContas] = useState(false);
  
  const [contaDebitoId, setContaDebitoId] = useState<string>('');
  const [contaCreditoId, setContaCreditoId] = useState<string>('');
  const [historicoId, setHistoricoId] = useState<string>('');
  
  const contasDespesa = useMemo(() => {
    return contasAnaliticas.filter(c => c.is_conta_resultado && c.Conta.startsWith('5.'));
  }, [contasAnaliticas]);

  const contasPassivo = useMemo(() => {
    return contasAnaliticas.filter(c => c.is_conta_patrimonial && c.Conta.startsWith('2.'));
  }, [contasAnaliticas]);

  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const formatDate = (dateString: string) => format(parseISO(dateString + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR });

  const fetchContasFuturas = useCallback(async () => {
    if (!clienteId) return;
    setLoading(true);

    try {
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

      const adminIds = [...new Set(contas.map(c => c.admin_id).filter(Boolean))];
      let adminsMap: Record<string, string> = {};
      
      if (adminIds.length > 0) {
        const { data: admins } = await supabase
          .from('tbl_admins')
          .select('id, nome')
          .in('id', adminIds);
        
        if (admins) {
          adminsMap = admins.reduce((acc, admin) => {
            acc[admin.id] = admin.nome;
            return acc;
          }, {} as Record<string, string>);
        }
      }

      const contasComParcelasPromises = contas.map(async (conta) => {
        const { data: todasParcelas, error: parcelasError } = await supabase
          .from('admin_parcelas_receber')
          .select('id, data_vencimento, valor_parcela, numero_parcela, status, ciente_cliente')
          .eq('conta_receber_id', conta.id)
          .order('data_vencimento', { ascending: true });

        const parcelas = (todasParcelas || []).filter(p => 
          ['aberta', 'parcial', 'reprogramada'].includes(p.status) && !p.ciente_cliente
        ) as ParcelaFutura[];
        
        const parcelasLancadas = (todasParcelas || []).filter(p => 
          p.ciente_cliente === true
        ) as ParcelaFutura[];

        return {
          conta: conta as ContaSintetica,
          parcelas,
          parcelasLancadas,
          nomeAdmin: conta.admin_id ? adminsMap[conta.admin_id] : undefined,
        };
      });

      const resultado = await Promise.all(contasComParcelasPromises);
      
      const contasFiltradas = resultado.filter(item => 
        item.parcelas.length > 0 || item.parcelasLancadas.length > 0
      );
      
      setContasComParcelas(contasFiltradas);
    } catch (error: any) {
      showError('Erro ao carregar contas futuras: ' + error.message);
      setContasComParcelas([]);
    }
    setLoading(false);
  }, [clienteId]);

  const fetchContasEHistoricos = useCallback(async () => {
    if (!clienteId) return;
    setLoadingContas(true);
    
    try {
      const { data: contasData, error: contasError } = await supabase
        .from('plano_contas')
        .select('id, Conta, Descricao, Analitica, is_conta_resultado, is_conta_patrimonial')
        .eq('proprietario_id', clienteId)
        .eq('Analitica', 'Sim')
        .order('Conta');
        
      if (contasError) throw contasError;
      setContasAnaliticas(contasData as PlanoContas[]);
      
      const { data: hData, error: hError } = await supabase
        .from('historicos')
        .select('id, descricao, codigo')
        .eq('proprietario_id', clienteId)
        .order('descricao');
        
      if (hError) throw hError;
      setHistoricos(hData as Historico[]);

    } catch (error: any) {
      showError('Falha ao carregar contas contábeis: ' + error.message);
    } finally {
      setLoadingContas(false);
    }
  }, [clienteId]);

  useEffect(() => {
    if (open) {
      fetchContasFuturas();
      fetchContasEHistoricos();
    }
  }, [open, fetchContasFuturas, fetchContasEHistoricos]);

  const abrirDialogConfirmacao = (item: ContaComParcelas) => {
    setItemSelecionado(item);
    setContaDebitoId('');
    setContaCreditoId('');
    setHistoricoId('');
    setConfirmDialogOpen(true);
  };

  const handleLancarContaAoPagar = async () => {
    if (!itemSelecionado) return;
    
    if (!contaDebitoId || !contaCreditoId) {
      showError('Selecione as contas contábeis de Débito e Crédito.');
      return;
    }
    
    if (contaDebitoId === contaCreditoId) {
      showError('As contas de Débito e Crédito devem ser diferentes.');
      return;
    }
    
    const item = itemSelecionado;
    const contaSintetica = item.conta;
    setLancando(contaSintetica.id);

    try {
      if (!contaSintetica.admin_id) {
        showError('Dados da conta incompletos.');
        setLancando(null);
        return;
      }

      const parcelasParaLancar = item.parcelas;
      if (parcelasParaLancar.length === 0) {
        showError('Não há parcelas pendentes para lançar.');
        setLancando(null);
        return;
      }

      const valorTotalParcelas = parcelasParaLancar.reduce((sum, p) => sum + p.valor_parcela, 0);
      const primeiraDataVencimento = parcelasParaLancar[0]?.data_vencimento;
      const fornecedor = item.nomeAdmin || 'Administração';

      const { data: novaContaPagar, error: createError } = await supabase
        .from('contas_pagar')
        .insert({
          empresa_id: clienteId,
          descricao: contaSintetica.descricao,
          fornecedor: fornecedor,
          valor_total: valorTotalParcelas,
          data_vencimento: primeiraDataVencimento,
          status: 'aberto',
          origem: 'contas_futuras',
        })
        .select('id')
        .single();

      if (createError) {
        showError('Erro ao criar conta a pagar: ' + createError.message);
        setLancando(null);
        return;
      }


      // *** INSERIR AQUI A ATUALIZAÇÃO DA CONTA A PAGAR ***
      const { error: updateContaError } = await supabase
        .from('contas_pagar')
        .update({
          historico_id: historicoId || null,
          // Conta Patrimonial (Passivo) - Crédito
          id_conta_patrimonial: contaCreditoId, 
          // Conta de Resultado (Despesa) - Débito
          id_conta_resultado: contaDebitoId, 
        })
        .eq('id', novaContaPagar.id);

      if (updateContaError) {
        showError('Erro ao mapear contas contábeis na conta a pagar: ' + updateContaError.message);
        // Considere deletar a conta a pagar recém-criada e suas parcelas aqui em um cenário real.
        setLancando(null);
        return;
      }
      // ****************************************************





      const novasParcelas = parcelasParaLancar.map((parcela) => ({
        conta_pagar_id: novaContaPagar.id,
        empresa_id: clienteId,
        numero_parcela: parcela.numero_parcela,
        valor_parcela: parcela.valor_parcela,
        data_vencimento: parcela.data_vencimento,
        status: 'aberta',
      }));

      const { error: insertParcelasError } = await supabase
        .from('parcelas_contas_pagar')
        .insert(novasParcelas);

      if (insertParcelasError) {
        showError('Erro ao criar parcelas: ' + insertParcelasError.message);
        await supabase.from('contas_pagar').delete().eq('id', novaContaPagar.id);
        setLancando(null);
        return;
      }

      const parcelaIds = parcelasParaLancar.map(p => p.id);
      
      for (const parcelaId of parcelaIds) {
        const { error: updateError } = await supabase
          .from('admin_parcelas_receber')
          .update({ ciente_cliente: true })
          .eq('id', parcelaId);

        if (updateError) {
          showError('Erro ao marcar parcela como lançada: ' + updateError.message);
        }
      }

      const idDespesa = crypto.randomUUID();
      const idPatrimonial = crypto.randomUUID();
      const dataPagamentoISO = primeiraDataVencimento + 'T12:00:00Z';
      
      const lancamentosPayload = [
        {
          id: idDespesa,
          proprietario_id: clienteId,
          data_movimentacao: dataPagamentoISO,
          descricao: `Lançamento de Contas a Pagar: ${contaSintetica.descricao}`,
          valor: valorTotalParcelas,
          tipo: 'Entrada' as const,
          conta_bancaria_id: null,
          conta_contabil_id: contaDebitoId,
          historico_id: historicoId || null,
          origem: 'contas_futuras',
          documento: null,
          conciliado: false,
          conta_resultado_id: idPatrimonial,
        },
        {
          id: idPatrimonial,
          proprietario_id: clienteId,
          data_movimentacao: dataPagamentoISO,
          descricao: `Estorno Patrimonial: ${contaSintetica.descricao}`,
          valor: valorTotalParcelas,
          tipo: 'Saida' as const,
          conta_bancaria_id: null,
          conta_contabil_id: contaCreditoId,
          historico_id: historicoId || null,
          origem: 'contas_futuras',
          documento: null,
          conciliado: false,
          conta_resultado_id: idDespesa,
        }
      ];

      const { error: lancamentoError } = await supabase
        .from('lancamentos')
        .insert(lancamentosPayload);
      
      if (lancamentoError) {
        showError('Erro ao criar lançamentos contábeis: ' + lancamentoError.message);
        setLancando(null);
        return;
      }

      showSuccess(`Conta "${contaSintetica.descricao}" lançada em Contas a Pagar com sucesso!`);
      setLancando(null);
      setConfirmDialogOpen(false);
      setItemSelecionado(null);
      onLancamentoComplete?.();
      onOpenChange(false);
    } catch (error: any) {
      showError('Erro ao lançar conta: ' + error.message);
      setLancando(null);
    }
  };

  const temParcelasPendentes = contasComParcelas.some(item => item.parcelas.length > 0);
  const podeConfirmar = contaDebitoId && contaCreditoId && contaDebitoId !== contaCreditoId;

  return (
    <>
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
              {contasComParcelas.map((item) => {
                const todasLancadas = item.parcelas.length === 0 && item.parcelasLancadas.length > 0;
                const temPendentes = item.parcelas.length > 0;
                
                return (
                  <Card 
                    key={item.conta.id} 
                    className={`border ${todasLancadas ? 'border-green-300 bg-green-50/50 dark:bg-green-900/10' : 'border-gray-300'}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex justify-between items-center mb-4 pb-4 border-b">
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg flex items-center gap-2">
                            {item.conta.descricao}
                            {todasLancadas && (
                              <Badge variant="success" className="ml-2">
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                Lançado
                              </Badge>
                            )}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {item.conta.origem === 'assinatura_recorrente' && 'Assinatura Recorrente'}
                            {item.conta.origem === 'manual' && 'Manual'}
                            {item.conta.origem !== 'assinatura_recorrente' && item.conta.origem !== 'manual' && item.conta.origem && item.conta.origem}
                            {item.nomeAdmin && ` - ${item.nomeAdmin}`}
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-primary">
                            {formatCurrency(item.conta.valor_total || [...item.parcelas, ...item.parcelasLancadas].reduce((sum, p) => sum + p.valor_parcela, 0))}
                          </div>
                          <Badge variant={todasLancadas ? 'success' : item.conta.status === 'aberto' ? 'info' : 'warning'}>
                            {todasLancadas ? 'lançado' : item.conta.status}
                          </Badge>
                        </div>
                      </div>

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
                            {item.parcelasLancadas.map((parcela) => (
                              <TableRow key={parcela.id} className="bg-green-50/50 dark:bg-green-900/10">
                                <TableCell className="font-medium text-muted-foreground">#{parcela.numero_parcela}</TableCell>
                                <TableCell className="text-muted-foreground">
                                  <CalendarCheck className="w-4 h-4 mr-2 inline-block" />
                                  {formatDate(parcela.data_vencimento)}
                                </TableCell>
                                <TableCell className="text-right font-semibold text-muted-foreground">
                                  {formatCurrency(parcela.valor_parcela)}
                                </TableCell>
                                <TableCell className="text-center">
                                  <Badge variant="success">
                                    <CheckCircle2 className="w-3 h-3 mr-1" />
                                    lançada
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>

                      <div className="flex justify-end">
                        {temPendentes ? (
                          <Button 
                            variant="default" 
                            size="sm" 
                            disabled={lancando === item.conta.id}
                            onClick={() => abrirDialogConfirmacao(item)}
                          >
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
                        ) : (
                          <Button variant="outline" size="sm" disabled className="text-green-600">
                            <CheckCircle2 className="w-4 h-4 mr-2" />
                            Já Lançado em Contas a Pagar
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Confirmar Lançamento Contábil</DialogTitle>
            <DialogDescription>
              Selecione as contas contábeis para registrar o lançamento de "{itemSelecionado?.conta.descricao}".
            </DialogDescription>
          </DialogHeader>

          {loadingContas ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div className="bg-muted/50 p-3 rounded-md space-y-1">
                <p className="text-sm"><strong>Descrição:</strong> {itemSelecionado?.conta.descricao}</p>
                <p className="text-sm"><strong>Fornecedor:</strong> {itemSelecionado?.nomeAdmin || 'Administração'}</p>
                <p className="text-sm"><strong>Parcelas:</strong> {itemSelecionado?.parcelas.length}</p>
                <p className="text-sm"><strong>Valor Total:</strong> {formatCurrency(itemSelecionado?.parcelas.reduce((sum, p) => sum + p.valor_parcela, 0) || 0)}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="conta-debito" className="text-red-600 font-medium">
                  Conta Contábil - Débito (D) * <span className="text-xs text-muted-foreground font-normal">(Despesas)</span>
                </Label>
                <Select value={contaDebitoId} onValueChange={setContaDebitoId}>
                  <SelectTrigger id="conta-debito" className="border-red-200">
                    <SelectValue placeholder="Selecione a conta de Despesa" />
                  </SelectTrigger>
                  <SelectContent>
                    {contasDespesa.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.Conta} - {c.Descricao}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="conta-credito" className="text-green-600 font-medium">
                  Conta Contábil - Crédito (C) * <span className="text-xs text-muted-foreground font-normal">(Passivo)</span>
                </Label>
                <Select value={contaCreditoId} onValueChange={setContaCreditoId}>
                  <SelectTrigger id="conta-credito" className="border-green-200">
                    <SelectValue placeholder="Selecione a conta de Passivo" />
                  </SelectTrigger>
                  <SelectContent>
                    {contasPassivo.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.Conta} - {c.Descricao}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="historico">Histórico (opcional)</Label>
                <Select value={historicoId} onValueChange={setHistoricoId}>
                  <SelectTrigger id="historico">
                    <SelectValue placeholder="Selecione um histórico" />
                  </SelectTrigger>
                  <SelectContent>
                    {historicos.map(h => (
                      <SelectItem key={h.id} value={h.id}>
                        {h.codigo ? `[${h.codigo}] ` : ''}{h.descricao}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialogOpen(false)} disabled={!!lancando}>
              Cancelar
            </Button>
            <Button 
              onClick={handleLancarContaAoPagar} 
              disabled={!podeConfirmar || !!lancando}
            >
              {lancando ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Lançando...
                </>
              ) : (
                'Confirmar Lançamento'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ContasFuturasDialog;
