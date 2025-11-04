import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Plus, Edit, Trash2, Eye, Filter, Printer, DollarSign } from 'lucide-react';
import { formatCurrency, formatarData } from '@/utils/formatters';
import { useSessao } from '@/hooks/use-sessao';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { getBadgeVariant } from '@/utils/badge-variants';
import { Badge } from '@/components/ui/badge';
import { DateRangePicker } from '@/components/DateRangePicker';
import { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { ContaPagar, ContaPagarComProgresso, AdminParcelaPagar, ExtendedParcelaPagar } from '@/types/contas-pagar';
import FormContasPagarDialog from '@/components/FormContasPagarDialog';
import DetalhesParcelasCPDialog from '@/components/DetalhesParcelasCPDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import RegistrarPagamentoCPDialog from '@/components/RegistrarPagamentoCPDialog';

// Definindo o tipo ContaStatus para incluir os status de parcela para uso no getBadgeVariant
type ContaStatus = 'pendente' | 'pago' | 'atrasado' | 'cancelada' | 'aberta' | 'parcial' | 'reprogramada';

const ContasPagar: React.FC = () => {
  const { usuario, role } = useSessao();
  const isSupervisao = role === 'Admin';
  // Corrigindo acesso a empresa_id, assumindo que useSessao retorna um tipo que inclui empresa_id ou usando cast (Erro 29)
  const proprietarioId = isSupervisao ? usuario?.id : (usuario as any)?.empresa_id;

  const [contas, setContas] = useState<(ContaPagar | ContaPagarComProgresso)[]>([]);
  const [parcelas, setParcelas] = useState<ExtendedParcelaPagar[]>([]); // Usando ExtendedParcelaPagar
  const [pagamentos, setPagamentos] = useState<any[]>([]); // TODO: Criar tipo AdminPagamento
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('sintetico');
  
  // Filtros
  const [filtroPeriodo, setFiltroPeriodo] = useState<DateRange | undefined>({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    to: new Date(),
  });
  const [filtroOrigem, setFiltroOrigem] = useState('todos');
  const [filtroStatus, setFiltroStatus] = useState('nao_quitado');

  // Diálogos
  const [formDialog, setFormDialog] = useState<{ open: boolean, conta: ContaPagarComProgresso | null }>({ open: false, conta: null });
  const [detalhesDialog, setDetalhesDialog] = useState<{ open: boolean, conta: ContaPagarComProgresso | null }>({ open: false, conta: null });
  const [pagamentoDialog, setPagamentoDialog] = useState<{ open: boolean, parcela: (AdminParcelaPagar & { fornecedor: string }) | null }>({ open: false, parcela: null });

  const fetchContas = useCallback(async () => {
    if (!proprietarioId) return;
    setLoading(true);
    
    let query = supabase.from(isSupervisao ? 'admin_contas_pagar' : 'contas_pagar').select('*');
    
    if (!isSupervisao) {
        query = query.eq('empresa_id', proprietarioId);
    } else {
        query = query.eq('admin_id', proprietarioId);
    }
    
    // Aplica filtros de período
    if (filtroPeriodo?.from) {
        query = query.gte('data_vencimento', format(filtroPeriodo.from, 'yyyy-MM-dd'));
    }
    if (filtroPeriodo?.to) {
        query = query.lte('data_vencimento', format(filtroPeriodo.to, 'yyyy-MM-dd'));
    }
    
    // Aplica filtros de origem (apenas para Admin)
    if (isSupervisao && filtroOrigem !== 'todos') {
        query = query.eq('origem', filtroOrigem);
    }
    
    // Aplica filtros de status (simplificado para o sintético)
    if (filtroStatus === 'quitado') {
        query = query.eq('status', 'pago');
    } else if (filtroStatus === 'nao_quitado') {
        query = query.neq('status', 'pago');
    }

    const { data, error } = await query.order('data_vencimento', { ascending: true });

    if (error) {
      showError('Erro ao carregar contas a pagar: ' + error.message);
      setContas([]);
    } else {
      // Se for supervisão, precisamos calcular o progresso de parcelas
      if (isSupervisao) {
        const contasComProgresso = await Promise.all((data as ContaPagarComProgresso[]).map(async (conta) => {
            const { count, error: countError } = await supabase
                .from('admin_parcelas_pagar')
                .select('*', { count: 'exact', head: true })
                .eq('conta_pagar_id', conta.id);
            
            const { count: pagasCount, error: pagasError } = await supabase
                .from('admin_parcelas_pagar')
                .select('*', { count: 'exact', head: true })
                .eq('conta_pagar_id', conta.id)
                .eq('status', 'paga');
                
            if (countError || pagasError) {
                console.error('Erro ao contar parcelas:', countError || pagasError);
                return { ...conta, parcelas_total: 0, parcelas_pagas: 0 };
            }
            
            return { ...conta, parcelas_total: count || 0, parcelas_pagas: pagasCount || 0 };
        }));
        setContas(contasComProgresso);
      } else {
        setContas(data as ContaPagar[]);
      }
    }
    setLoading(false);
  }, [proprietarioId, isSupervisao, filtroPeriodo, filtroOrigem, filtroStatus]);
  
  const fetchParcelas = useCallback(async () => {
    if (!proprietarioId || !isSupervisao) return;
    setLoading(true);
    
    let query = supabase.from('admin_parcelas_pagar').select(`
        *,
        admin_contas_pagar ( fornecedor, origem, descricao )
    `).eq('admin_id', proprietarioId);
    
    // Aplica filtros de período
    if (filtroPeriodo?.from) {
        query = query.gte('data_vencimento', format(filtroPeriodo.from, 'yyyy-MM-dd'));
    }
    if (filtroPeriodo?.to) {
        query = query.lte('data_vencimento', format(filtroPeriodo.to, 'yyyy-MM-dd'));
    }
    
    // Aplica filtros de status
    if (filtroStatus === 'quitado') {
        query = query.eq('status', 'paga');
    } else if (filtroStatus === 'nao_quitado') {
        query = query.neq('status', 'paga');
    }

    const { data, error } = await query.order('data_vencimento', { ascending: true });

    if (error) {
      showError('Erro ao carregar parcelas: ' + error.message);
      setParcelas([]);
    } else {
      setParcelas(data as ExtendedParcelaPagar[]); // Usando ExtendedParcelaPagar
    }
    setLoading(false);
  }, [proprietarioId, isSupervisao, filtroPeriodo, filtroStatus]);
  
  const fetchPagamentos = useCallback(async () => {
    if (!proprietarioId || !isSupervisao) return;
    setLoading(true);
    
    let query = supabase.from('admin_pagamentos').select(`
        *,
        saldo_contas ( nome ),
        admin_parcelas_pagar (
            numero_parcela,
            admin_contas_pagar ( descricao, origem, fornecedor )
        )
    `).eq('admin_id', proprietarioId);
    
    // Aplica filtros de período
    if (filtroPeriodo?.from) {
        query = query.gte('data_pagamento', format(filtroPeriodo.from, 'yyyy-MM-dd'));
    }
    if (filtroPeriodo?.to) {
        query = query.lte('data_pagamento', format(filtroPeriodo.to, 'yyyy-MM-dd'));
    }

    const { data, error } = await query.order('data_pagamento', { ascending: false });

    if (error) {
      showError('Erro ao carregar pagamentos: ' + error.message);
      setPagamentos([]);
    } else {
      setPagamentos(data as any[]);
    }
    setLoading(false);
  }, [proprietarioId, isSupervisao, filtroPeriodo]);

  useEffect(() => {
    if (activeTab === 'sintetico') {
      fetchContas();
    } else if (activeTab === 'parcelas') {
      fetchParcelas();
    } else if (activeTab === 'pagamentos') {
      fetchPagamentos();
    }
  }, [activeTab, fetchContas, fetchParcelas, fetchPagamentos]);

  const handleOpenForm = (conta: ContaPagarComProgresso | null = null) => {
    setFormDialog({ open: true, conta });
  };
  
  const handleOpenDetalhes = (conta: ContaPagarComProgresso) => {
    setDetalhesDialog({ open: true, conta });
  };
  
  const handleOpenPagamento = (parcela: AdminParcelaPagar, fornecedor: string) => {
    const mappedParcela = {
        ...parcela,
        fornecedor: fornecedor,
    };
    setPagamentoDialog({ open: true, parcela: mappedParcela });
  };

  const handleDelete = async (id: string) => {
    if (!proprietarioId) return;
    
    const tabela = isSupervisao ? 'admin_contas_pagar' : 'contas_pagar';
    
    try {
      const { error } = await supabase.from(tabela).delete().eq('id', id);
      
      if (error) throw error;
      
      showSuccess('Conta a pagar excluída com sucesso.');
      fetchContas();
    } catch (error: any) {
      showError('Falha ao excluir conta: ' + error.message);
    }
  };
  
  const totalSintetico = useMemo(() => {
    return contas.reduce((sum, conta) => sum + (isSupervisao ? (conta as ContaPagarComProgresso).valor_total : (conta as ContaPagar).valor), 0);
  }, [contas, isSupervisao]);
  
  const totalParcelas = useMemo(() => {
    return parcelas.reduce((sum, parcela) => sum + parcela.valor_parcela, 0);
  }, [parcelas]);
  
  const totalPagamentos = useMemo(() => {
    return pagamentos.reduce((sum, pagamento) => sum + pagamento.valor_pago, 0);
  }, [pagamentos]);

  const formatarOrigem = (origem: string) => {
    switch (origem) {
        case 'contrato': return 'Contrato';
        case 'assinatura_recorrente': return 'Assinatura';
        case 'manual': return 'Manual';
        default: return origem;
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Contas a Pagar {isSupervisao && '(Admin)'}</h1>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="sintetico">Sintético</TabsTrigger>
          {isSupervisao && <TabsTrigger value="parcelas">Parcelas</TabsTrigger>}
          {isSupervisao && <TabsTrigger value="pagamentos">Pagamentos</TabsTrigger>}
        </TabsList>

        <TabsContent value="sintetico" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between space-y-4 md:space-y-0 pb-2">
                            <CardTitle className="text-lg flex items-center"><Filter className="w-4 h-4 mr-2" /> Filtros e Ações</CardTitle>
                            <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
                                <Select value={filtroOrigem} onValueChange={setFiltroOrigem}>
                                    <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Filtrar Origem" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="todos">Todas as Origens</SelectItem>
                                        <SelectItem value="contrato">Contrato</SelectItem>
                                        <SelectItem value="assinatura_recorrente">Assinatura</SelectItem>
                                        <SelectItem value="manual">Manual</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                                    <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Filtrar Status" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="todos">Todos os Status</SelectItem>
                                        <SelectItem value="quitado">Quitado</SelectItem>
                                        <SelectItem value="nao_quitado">Não Quitado</SelectItem>
                                    </SelectContent>
                                </Select>
                                <DateRangePicker date={filtroPeriodo} setDate={setFiltroPeriodo} />
                                <Button variant="outline" className="w-full sm:w-auto"><Printer className="w-4 h-4 mr-2" /> Imprimir</Button>
                                <Button onClick={() => handleOpenForm()} className="w-full sm:w-auto"><Plus className="w-4 h-4 mr-2" /> Novo Lançamento</Button>
                            </div>
                        </CardHeader>
          </Card>
          
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="border-l-4 border-primary">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium flex items-center"><DollarSign className="w-4 h-4 mr-2" /> Total Sintético</CardTitle></CardHeader>
                            <CardContent><div className="text-2xl font-bold">{formatCurrency(totalSintetico)}</div></CardContent>
                        </Card>
            {/* Outros cards de resumo aqui */}
          </div>

          <Card>
            <CardHeader><CardTitle>Lançamentos Sintéticos</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vencimento</TableHead>
                      {isSupervisao && <TableHead>ID {isSupervisao ? 'Admin' : 'Empresa'}</TableHead>}
                      <TableHead>Fornecedor</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="text-right">Valor Total</TableHead>
                      {isSupervisao && <TableHead>Progresso</TableHead>}
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow><TableCell colSpan={isSupervisao ? 8 : 6} className="text-center">Carregando...</TableCell></TableRow>
                    ) : contas.length === 0 ? (
                      <TableRow><TableCell colSpan={isSupervisao ? 8 : 6} className="text-center">Nenhuma conta a pagar encontrada no período.</TableCell></TableRow>
                    ) : (
                      contas.map((conta) => (
                        <TableRow key={conta.id}>
                          <TableCell>{formatarData(conta.data_vencimento)}</TableCell>
                          {isSupervisao && <TableCell className="text-sm text-muted-foreground">{(conta as unknown as ContaPagarComProgresso).admin_id || 'Admin'}</TableCell>}
                          <TableCell className="font-medium">{conta.fornecedor}</TableCell>
                          <TableCell>{isSupervisao ? (conta as ContaPagarComProgresso).descricao : (conta as ContaPagar).documento || 'N/A'}</TableCell>
                          <TableCell className="text-right font-semibold">{formatCurrency(isSupervisao ? (conta as ContaPagarComProgresso).valor_total : (conta as ContaPagar).valor)}</TableCell>
                          {isSupervisao && (
                            <TableCell>
                              {`${(conta as ContaPagarComProgresso).parcelas_pagas || 0} / ${(conta as ContaPagarComProgresso).parcelas_total || 0}`}
                            </TableCell>
                          )}
                          <TableCell>
                            <Badge variant={getBadgeVariant(conta.status as ContaStatus, conta.data_vencimento)}>
                              {conta.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right space-x-2">
                            {isSupervisao && (
                                <Button variant="outline" size="sm" onClick={() => handleOpenDetalhes(conta as ContaPagarComProgresso)}>
                                    <Eye className="w-4 h-4" />
                                </Button>
                            )}
                            <Button variant="outline" size="sm" onClick={() => handleOpenForm(conta as ContaPagarComProgresso)}>
                              <Edit className="w-4 h-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="destructive" size="sm"><Trash2 className="w-4 h-4" /></Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
                                  <AlertDialogDescription>Esta ação não pode ser desfeita. Isso excluirá permanentemente o lançamento.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDelete(conta.id)}>Excluir</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {isSupervisao && (
            <TabsContent value="parcelas" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Card className="border-l-4 border-secondary">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Total Parcelas</CardTitle></CardHeader>
                        <CardContent><div className="text-2xl font-bold">{formatCurrency(totalParcelas)}</div></CardContent>
                    </Card>
                    {/* Outros cards de resumo de parcelas */}
                </div>
                
                <Card>
                    <CardHeader><CardTitle>Parcelas a Pagar</CardTitle></CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Vencimento</TableHead>
                                        <TableHead>Fornecedor</TableHead>
                                        <TableHead>Descrição</TableHead>
                                        <TableHead className="text-right">Valor Parcela</TableHead>
                                        <TableHead className="text-right">Valor Pago</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Origem</TableHead>
                                        <TableHead className="text-right">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading ? (
                                        <TableRow><TableCell colSpan={8} className="text-center">Carregando...</TableCell></TableRow>
                                    ) : parcelas.length === 0 ? (
                                        <TableRow><TableCell colSpan={8} className="text-center">Nenhuma parcela encontrada no período.</TableCell></TableRow>
                                    ) : (
                                        parcelas.map((p) => {
                                            const statusVariant = getBadgeVariant(p.status as ContaStatus, p.data_vencimento);
                                            const isPaga = p.status === 'paga';
                                            // Acesso corrigido usando ExtendedParcelaPagar (Erro 30)
                                            const fornecedor = p.admin_contas_pagar?.fornecedor || 'N/A';
                                            
                                            return (
                                                <TableRow key={p.id}>
                                                    <TableCell>{formatarData(p.data_vencimento)}</TableCell>
                                                    <TableCell>{fornecedor}</TableCell>
                                                    <TableCell>{p.admin_contas_pagar?.descricao || 'N/A'}</TableCell> {/* Erro 31 corrigido */}
                                                    <TableCell className="text-right">{formatCurrency(p.valor_parcela)}</TableCell>
                                                    <TableCell className="text-right">{formatCurrency(p.valor_pago || 0)}</TableCell>
                                                    <TableCell><Badge variant={statusVariant}>{p.status}</Badge></TableCell>
                                                    <TableCell>{formatarOrigem(p.admin_contas_pagar?.origem || 'manual')}</TableCell> {/* Erro 32 corrigido */}
                                                    <TableCell className="text-right">
                                                        {!isPaga && (
                                                            <Button size="sm" onClick={() => handleOpenPagamento(p, fornecedor)}>
                                                                <DollarSign className="w-4 h-4 mr-2" /> Pagar
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
                    </CardContent>
                </Card>
            </TabsContent>
        )}
        
        {isSupervisao && (
            <TabsContent value="pagamentos" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Card className="border-l-4 border-success">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Total Pago</CardTitle></CardHeader>
                        <CardContent><div className="text-2xl font-bold">{formatCurrency(totalPagamentos)}</div></CardContent>
                    </Card>
                    {/* Outros cards de resumo de pagamentos */}
                </div>
                
                <Card>
                    <CardHeader><CardTitle>Histórico de Pagamentos</CardTitle></CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Data Pagamento</TableHead>
                                        <TableHead>Valor Pago</TableHead>
                                        <TableHead>Conta Origem</TableHead>
                                        <TableHead>Descrição Parcela</TableHead>
                                        <TableHead>Nº Parcela</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading ? (
                                        <TableRow><TableCell colSpan={5} className="text-center">Carregando...</TableCell></TableRow>
                                    ) : pagamentos.length === 0 ? (
                                        <TableRow><TableCell colSpan={5} className="text-center">Nenhum pagamento encontrado no período.</TableCell></TableRow>
                                    ) : (
                                        pagamentos.map((p) => (
                                            <TableRow key={p.id}>
                                                <TableCell>{formatarData(p.data_pagamento)}</TableCell>
                                                <TableCell className="font-semibold text-destructive">{formatCurrency(p.valor_pago)}</TableCell>
                                                <TableCell>{p.saldo_contas?.nome || 'N/A'}</TableCell>
                                                <TableCell>{p.admin_parcelas_pagar?.admin_contas_pagar?.descricao || 'N/A'}</TableCell>
                                                <TableCell>{p.admin_parcelas_pagar?.numero_parcela || 'N/A'}</TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </TabsContent>
        )}
      </Tabs>

      <FormContasPagarDialog 
        open={formDialog.open} 
        onOpenChange={(open: boolean) => setFormDialog({ open, conta: null })} // Erro 33 corrigido
        contaInicial={formDialog.conta}
        onSaveComplete={() => { setFormDialog({ open: false, conta: null }); fetchContas(); }}
      />
      
      {detalhesDialog.conta && (
        <DetalhesParcelasCPDialog
            open={detalhesDialog.open}
            onOpenChange={(open: boolean) => setDetalhesDialog({ open, conta: null })} // Erro 34 corrigido
            conta={detalhesDialog.conta}
            onDataChange={() => { fetchContas(); fetchParcelas(); }}
        />
      )}
      
      {pagamentoDialog.parcela && (
        <RegistrarPagamentoCPDialog
            open={pagamentoDialog.open}
            onOpenChange={(open: boolean) => setPagamentoDialog({ open, parcela: null })}
            parcela={pagamentoDialog.parcela}
            onSaveComplete={() => { fetchParcelas(); fetchPagamentos(); }}
        />
      )}
    </div>
  );
};

export default ContasPagar;