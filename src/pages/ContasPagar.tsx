import { useState, useEffect, useCallback, useMemo } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, PlusCircle, Edit, Trash2, Eye, ListChecks, BadgeDollarSign } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { parseISO, isPast, isToday, format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ContaPagar, AdminContaPagar, ContaPagarComProgresso, ExtendedParcelaPagar, AdminPagamento } from '@/types/contas-pagar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import FormContasPagar from '@/components/FormContasPagar';
import DetalhesParcelasCPDialog from '@/components/DetalhesParcelasCPDialog';
import RegistrarPagamentoCPDialog from '@/components/RegistrarPagamentoCPDialog';
import { DateRange } from 'react-day-picker';
import { DateRangePicker } from '@/components/DateRangePicker';

type ContaStatus = 'pendente' | 'pago' | 'atrasado' | 'cancelado';
type BadgeVariant = 'success' | 'warning' | 'secondary' | 'destructive' | 'default' | 'info';
type FiltroOrigem = 'todos' | 'contrato' | 'assinatura_recorrente' | 'manual';

const getBadgeVariant = (status: ContaStatus, dataVencimento: string): BadgeVariant => {
  const vencimento = parseISO(dataVencimento + 'T00:00:00');

  if (status === 'pago') return 'success';
  if (status === 'cancelado') return 'destructive';
  
  if (isPast(vencimento) && !isToday(vencimento)) return 'destructive';
  if (isToday(vencimento)) return 'warning';

  return 'secondary';
};

const ContasPagar = () => {
  const { usuario, perfil, role, carregando: carregandoSessao } = useSessao();
  
  const [contas, setContas] = useState<ContaPagarComProgresso[]>([]); // Contas Sintéticas (Admin ou Cliente)
  const [parcelas, setParcelas] = useState<ExtendedParcelaPagar[]>([]); // Parcelas Analíticas (Admin)
  const [pagamentos, setPagamentos] = useState<AdminPagamento[]>([]); // Histórico de Pagamentos (Admin)
  
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [contaSelecionada, setContaSelecionada] = useState<AdminContaPagar | ContaPagar | null>(null);
  const [parcelasDialogOpen, setParcelasDialogOpen] = useState(false);
  const [pagamentoDialogOpen, setPagamentoDialogOpen] = useState(false);
  const [parcelaParaPagamento, setParcelaParaPagamento] = useState<any>(null);
  
  // Filtros
  const [activeTab, setActiveTab] = useState('parcela_sintetica');
  const [activeSupervisaoTab, setActiveSupervisaoTab] = useState('meus_lancamentos');
  const [filtroPeriodo, setFiltroPeriodo] = useState<DateRange | undefined>(undefined);
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'quitado' | 'nao_quitado'>('todos');
  const [filtroOrigem, setFiltroOrigem] = useState<FiltroOrigem>('todos');

  const isAdmin = role === 'Admin';

  const getOwnerId = () => {
    if (isAdmin) return usuario?.id || null;
    if (role === 'Cliente') return (perfil as ClienteProfile)?.id || null;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id || null;
    return null;
  };
  
  const ownerId = getOwnerId();

  const buscarDados = useCallback(async () => {
    if (!ownerId) {
        setCarregandoDados(false);
        return;
    }
    
    setCarregandoDados(true);
    
    const isMyLaunch = isAdmin && activeSupervisaoTab === 'meus_lancamentos';
    const tabelaContasPagar = isMyLaunch ? 'admin_contas_pagar' : 'contas_pagar';
    const tabelaParcelasPagar = isMyLaunch ? 'admin_parcelas_pagar' : 'parcelas_contas_pagar';
    const ownerKey = isMyLaunch ? 'admin_id' : 'empresa_id';
    
    // 1. Buscar Contas Sintéticas (Admin ou Cliente)
    let contasQuery = supabase
        .from(tabelaContasPagar)
        .select('*');
        
    if (isMyLaunch) {
        contasQuery = contasQuery.eq(ownerKey, ownerId);
    } else if (!isAdmin) {
        contasQuery = contasQuery.eq(ownerKey, ownerId);
    } else {
        // Admin em modo supervisão (busca todos os lançamentos de clientes)
        contasQuery = contasQuery.not('empresa_id', 'is', null);
    }
    
    const [contasRes, parcelasRes, pagamentosRes] = await Promise.all([
      contasQuery.order('data_vencimento', { ascending: true }),
      
      // 2. Buscar Parcelas Analíticas (Apenas Admin)
      isMyLaunch ? supabase
        .from(tabelaParcelasPagar)
        .select(`
          *,
          admin_contas_pagar ( descricao, origem )
        `)
        .eq(ownerKey, ownerId)
        .order('data_vencimento', { ascending: true })
        : Promise.resolve({ data: [], error: null }),
        
      // 3. Buscar Histórico de Pagamentos (Apenas Admin)
      isMyLaunch ? supabase
        .from('admin_pagamentos')
        .select(`
          *,
          saldo_contas ( nome ),
          admin_parcelas_pagar (
            numero_parcela,
            admin_contas_pagar ( descricao, origem )
          )
        `)
        .eq('admin_id', ownerId)
        .order('data_pagamento', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (contasRes.error) showError('Erro ao carregar contas: ' + contasRes.error.message);
    else {
        let fetchedContas = contasRes.data as ContaPagarComProgresso[];
        let fetchedParcelas = parcelasRes.data as unknown as ExtendedParcelaPagar[];
        
        // --- Lógica para calcular progresso de pagamento (Apenas Admin) ---
        if (isMyLaunch) {
            const parcelasPorConta = fetchedParcelas.reduce((acc, p) => {
                acc[p.conta_pagar_id] = acc[p.conta_pagar_id] || [];
                acc[p.conta_pagar_id].push(p);
                return acc;
            }, {} as Record<string, ExtendedParcelaPagar[]>);
            
            fetchedContas = fetchedContas.map(conta => {
                const parcelas = parcelasPorConta[conta.id] || [];
                const pagas = parcelas.filter(p => p.status === 'paga').length;
                return {
                    ...conta,
                    parcelas_pagas: pagas,
                    parcelas_total: parcelas.length,
                };
            });
            setParcelas(fetchedParcelas);
        }
        
        setContas(fetchedContas);
    }
    
    if (isMyLaunch && pagamentosRes.data) {
        setPagamentos(pagamentosRes.data as AdminPagamento[]);
    } else {
        setPagamentos([]);
    }

    setCarregandoDados(false);
  }, [ownerId, isAdmin, activeSupervisaoTab]);

  useEffect(() => {
    if (!carregandoSessao && usuario) {
      buscarDados();
    }
  }, [carregandoSessao, usuario, buscarDados]);

  const handleSaveComplete = () => {
    setDialogAberto(false);
    setContaSelecionada(null);
    buscarDados();
  };
  
  const handlePagamentoCompleto = () => {
    setPagamentoDialogOpen(false);
    buscarDados();
  };

  const handleEdit = (_conta: ContaPagar | AdminContaPagar) => {
    showError('Funcionalidade de edição de Contas a Pagar ainda não implementada.');
    // TODO: Implementar Dialog/Form para Contas a Pagar
  };

  const handleDelete = async (contaId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta conta a pagar e todas as suas parcelas?')) return;
    
    setCarregandoDados(true);
    const tabelaContasPagar = isAdmin && activeSupervisaoTab === 'meus_lancamentos' ? 'admin_contas_pagar' : 'contas_pagar';
    
    const { error } = await supabase.from(tabelaContasPagar).delete().eq('id', contaId);
    
    if (error) showError('Erro ao excluir conta: ' + error.message);
    else {
      showSuccess('Conta excluída com sucesso.');
      buscarDados();
    }
  };
  
  const handleOpenParcelas = (conta: AdminContaPagar) => {
    setContaSelecionada(conta);
    setParcelasDialogOpen(true);
  };
  
  const handleOpenPagamento = (parcela: AdminParcelaPagar, fornecedor: string) => {
    const mappedParcela = {
        ...parcela,
        fornecedor: fornecedor,
    };
    
    setParcelaParaPagamento(mappedParcela);
    setPagamentoDialogOpen(true);
  };

  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const formatDate = (dateString: string) => new Date(dateString + 'T00:00:00').toLocaleDateString('pt-BR');
  const formatTimestamp = (dateString: string) => {
    try {
        const date = parseISO(dateString);
        return format(date, 'dd/MM/yyyy HH:mm:ss');
    } catch (e) {
        return 'Invalid Date';
    }
  };
  
  // --- Filtros de Dados ---
  const filterData = (data: any[], dateKey: string) => {
    if (!filtroPeriodo?.from) return data;
    
    const start = filtroPeriodo.from;
    const end = filtroPeriodo.to || new Date();
    
    return data.filter(item => {
        const dateString = item[dateKey];
        let date: Date;
        
        if (dateString.includes('T')) {
            date = parseISO(dateString);
        } else {
            date = parseISO(dateString + 'T00:00:00');
        }
        
        const itemDateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const startDateOnly = new Date(start.getFullYear(), start.getMonth(), start.getDate());
        const endDateOnly = new Date(end.getFullYear(), end.getMonth(), end.getDate());

        return itemDateOnly >= startDateOnly && itemDateOnly <= endDateOnly;
    });
  };
  
  const filterByStatus = (data: ContaPagarComProgresso[] | ExtendedParcelaPagar[], isSynthetic: boolean) => {
    let filteredByStatus = data;
    
    if (filtroStatus !== 'todos') {
        filteredByStatus = data.filter(item => {
            let isPaid: boolean;
            
            if (isSynthetic) {
                const conta = item as ContaPagarComProgresso;
                const total = conta.parcelas_total ?? 0;
                const pagas = conta.parcelas_pagas ?? 0;
                isPaid = total > 0 && pagas === total;
            } else {
                const parcela = item as ExtendedParcelaPagar;
                isPaid = parcela.status === 'paga';
            }

            return filtroStatus === 'quitado' ? isPaid : !isPaid;
        }) as any;
    }
    
    if (filtroOrigem !== 'todos') {
        filteredByStatus = filteredByStatus.filter(item => {
            const origem = isSynthetic 
                ? (item as ContaPagarComProgresso).origem 
                : (item as ExtendedParcelaPagar).admin_contas_pagar?.origem;
            return origem === filtroOrigem;
        }) as any;
    }

    return filteredByStatus;
  };
  
  const contasFiltradas = useMemo(() => {
    const dateFiltered = filterData(contas, 'data_vencimento') as ContaPagarComProgresso[];
    // Apenas Admin tem progresso, então a lógica de status só se aplica se for Admin/Meus Lançamentos
    const isSyntheticAdmin = isAdmin && activeSupervisaoTab === 'meus_lancamentos';
    return isSyntheticAdmin ? filterByStatus(dateFiltered, true) as ContaPagarComProgresso[] : dateFiltered;
  }, [contas, filtroPeriodo, filtroStatus, filtroOrigem, isAdmin, activeSupervisaoTab]);

  const parcelasFiltradas = useMemo(() => {
    if (!isAdmin || activeSupervisaoTab !== 'meus_lancamentos') return [];
    const dateFiltered = filterData(parcelas, 'data_vencimento') as ExtendedParcelaPagar[];
    return filterByStatus(dateFiltered, false) as ExtendedParcelaPagar[];
  }, [parcelas, filtroPeriodo, filtroStatus, filtroOrigem, isAdmin, activeSupervisaoTab]);
  
  const pagamentosFiltrados = useMemo(() => {
    if (!isAdmin || activeSupervisaoTab !== 'meus_lancamentos') return [];
    let filtered = filterData(pagamentos, 'data_pagamento');
    
    if (filtroOrigem !== 'todos') {
        filtered = filtered.filter(r => {
            const origem = r.admin_parcelas_pagar?.admin_contas_pagar?.origem;
            return origem === filtroOrigem;
        });
    }
    return filtered;
  }, [pagamentos, filtroPeriodo, filtroOrigem, isAdmin, activeSupervisaoTab]);
  
  // Resumo (Apenas Admin/Meus Lançamentos)
  const { totalSintetico, totalParcelas, totalPago, totalNaoPago } = useMemo(() => {
    if (!isAdmin || activeSupervisaoTab !== 'meus_lancamentos') return { totalSintetico: 0, totalParcelas: 0, totalPago: 0, totalNaoPago: 0 };
    
    const totalSintetico = contasFiltradas.reduce((sum, conta) => sum + conta.valor_total, 0);
    const totalParcelas = parcelasFiltradas.reduce((sum, p) => sum + p.valor_parcela, 0);
    const totalPago = parcelasFiltradas.reduce((sum, p) => sum + (p.valor_pago || 0), 0);
    const totalNaoPago = totalParcelas - totalPago;
    
    return { totalSintetico, totalParcelas, totalPago, totalNaoPago };
  }, [contasFiltradas, parcelasFiltradas, isAdmin, activeSupervisaoTab]);


  if (carregandoSessao || carregandoDados) {
    return <LayoutPrincipal><div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></LayoutPrincipal>;
  }
  
  const isMyLaunch = isAdmin && activeSupervisaoTab === 'meus_lancamentos';
  const isSupervisao = isAdmin && activeSupervisaoTab === 'supervisao';
  const canEditOrDelete = !isSupervisao;

  return (
    <LayoutPrincipal>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl md:text-3xl font-bold">Contas a Pagar</h1>
        <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
          <DialogTrigger asChild>
            <Button onClick={() => setContaSelecionada(null)} className="w-full sm:w-auto" disabled={isSupervisao}>
              <PlusCircle className="w-4 h-4 mr-2" />
              Novo Lançamento
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{contaSelecionada ? 'Editar Lançamento' : 'Novo Lançamento'}</DialogTitle>
            </DialogHeader>
            <FormContasPagar 
              contaInicial={contaSelecionada as AdminContaPagar}
              onSaveComplete={handleSaveComplete}
            />
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={activeSupervisaoTab} onValueChange={setActiveSupervisaoTab} className="w-full">
        <TabsList className={cn("grid w-full", isAdmin ? "grid-cols-2" : "grid-cols-1")}>
          <TabsTrigger value="meus_lancamentos">Meus Lançamentos</TabsTrigger>
          {isAdmin && <TabsTrigger value="supervisao">Supervisão</TabsTrigger>}
        </TabsList>
        
        {/* ABA DE SUPERVISÃO (APENAS ADMIN) */}
        {isSupervisao && (
            <div className="p-4 bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-500 rounded-md mt-4">
                <p className="text-sm text-yellow-700 dark:text-yellow-300 font-semibold">
                    Modo Supervisão: Visualizando lançamentos de todas as empresas clientes.
                </p>
            </div>
        )}
        
        <TabsContent value={activeSupervisaoTab} className="mt-4">
            
            {/* FILTROS E RESUMO (Apenas para Meus Lançamentos) */}
            {isMyLaunch && (
                <>
                    <Card className="mb-6">
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
                            </div>
                        </CardHeader>
                    </Card>
                    
                    {/* RESUMO FINANCEIRO */}
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
                        <Card className="border-l-4 border-primary">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium flex items-center"><DollarSign className="w-4 h-4 mr-2" /> Total Sintético</CardTitle></CardHeader>
                            <CardContent><div className="text-2xl font-bold">{formatCurrency(totalSintetico)}</div></CardContent>
                        </Card>
                        <Card className="border-l-4 border-blue-500">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Valor Total (Parcelas)</CardTitle></CardHeader>
                            <CardContent><div className="text-xl font-bold">{formatCurrency(totalParcelas)}</div></CardContent>
                        </Card>
                        <Card className="border-l-4 border-green-500">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Valor Pago</CardTitle></CardHeader>
                            <CardContent><div className="text-xl font-bold text-green-600">{formatCurrency(totalPago)}</div></CardContent>
                        </Card>
                        <Card className="border-l-4 border-red-500">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Valor Não Pago</CardTitle></CardHeader>
                            <CardContent><div className="text-xl font-bold text-red-600">{formatCurrency(totalNaoPago)}</div></CardContent>
                        </Card>
                    </div>
                </>
            )}
            
            {/* TABELAS DE DADOS */}
            <Tabs value={isMyLaunch ? activeTab : 'parcela_sintetica'} onValueChange={setActiveTab} className="w-full">
                <TabsList className={cn("grid w-full", isMyLaunch ? "grid-cols-3" : "grid-cols-1")}>
                    <TabsTrigger value="parcela_sintetica">Lançamentos ({contasFiltradas.length})</TabsTrigger>
                    {isMyLaunch && <TabsTrigger value="parcelas">Parcelas ({parcelasFiltradas.length})</TabsTrigger>}
                    {isMyLaunch && <TabsTrigger value="pagamentos">Pagamentos ({pagamentosFiltrados.length})</TabsTrigger>}
                </TabsList>
                
                {/* TAB 1: SINTÉTICO (Admin/Cliente/Supervisão) */}
                <TabsContent value="parcela_sintetica" className="mt-4">
                    <Card>
                        <CardHeader><CardTitle>Lançamentos Sintéticos</CardTitle></CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[120px]">Ações</TableHead>
                                            {isSupervisao && <TableHead>Empresa ID</TableHead>}
                                            <TableHead>Fornecedor</TableHead>
                                            <TableHead>Descrição</TableHead>
                                            <TableHead>Vencimento</TableHead>
                                            <TableHead>Valor Total</TableHead>
                                            {isMyLaunch && <TableHead>Progresso</TableHead>}
                                            <TableHead className="hidden sm:table-cell">Status</TableHead>
                                            {isMyLaunch && <TableHead className="hidden sm:table-cell">Origem</TableHead>}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {contasFiltradas.length === 0 ? (
                                            <TableRow><TableCell colSpan={isSupervisao ? 9 : 7} className="text-center h-24">Nenhuma conta a pagar encontrada.</TableCell></TableRow>
                                        ) : (
                                            contasFiltradas.map((conta) => {
                                                const statusVariant = getBadgeVariant(conta.status, conta.data_vencimento);
                                                const isContaAdmin = 'admin_id' in conta;
                                                
                                                const total = conta.parcelas_total ?? 0;
                                                const pagas = conta.parcelas_pagas ?? 0;
                                                const progresso = total ? `${pagas}/${total}` : 'N/A';
                                                const origemDisplay = isContaAdmin ? (conta.origem === 'assinatura_recorrente' ? 'Assinatura' : (conta.origem === 'contrato' ? 'Contrato' : 'Manual')) : 'N/A';

                                                return (
                                                    <TableRow key={conta.id}>
                                                        <TableCell className="text-left min-w-[120px]">
                                                            <div className="flex space-x-1">
                                                                {isMyLaunch && <Button variant="ghost" size="icon" onClick={() => handleOpenParcelas(conta as AdminContaPagar)} title="Ver Parcelas"><ListChecks className="h-4 w-4" /></Button>}
                                                                {canEditOrDelete && (
                                                                    <>
                                                                        <Button variant="ghost" size="icon" onClick={() => handleEdit(conta)} title="Editar Lançamento"><Edit className="h-4 w-4" /></Button>
                                                                        <Button variant="ghost" size="icon" onClick={() => handleDelete(conta.id)} title="Excluir Lançamento"><Trash2 className="w-4 h-4 text-red-500" /></Button>
                                                                    </>
                                                                )}
                                                                {isSupervisao && <Button variant="ghost" size="icon" disabled title="Apenas visualização"><Eye className="h-4 w-4 text-muted-foreground" /></Button>}
                                                            </div>
                                                        </TableCell>
                                                        {isSupervisao && <TableCell className="text-sm text-muted-foreground">{(conta as ContaPagar).empresa_id || 'Admin'}</TableCell>}
                                                        <TableCell className="font-medium">{conta.fornecedor}</TableCell>
                                                        <TableCell>{conta.descricao}</TableCell>
                                                        <TableCell>{formatDate(conta.data_vencimento)}</TableCell>
                                                        <TableCell className="font-semibold">{formatCurrency(conta.valor_total)}</TableCell>
                                                        {isMyLaunch && <TableCell className="text-sm text-muted-foreground">{progresso}</TableCell>}
                                                        <TableCell className="hidden sm:table-cell">
                                                            <Badge variant={statusVariant}>{conta.status}</Badge>
                                                        </TableCell>
                                                        {isMyLaunch && <TableCell className="hidden sm:table-cell">
                                                            <Badge variant="secondary">{origemDisplay}</Badge>
                                                        </TableCell>}
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
                
                {/* TAB 2: PARCELAS (ANALÍTICO - APENAS ADMIN) */}
                {isMyLaunch && (
                    <TabsContent value="parcelas" className="mt-4">
                        <Card>
                            <CardHeader><CardTitle>Parcelas Pendentes e Pagas ({parcelasFiltradas.length})</CardTitle></CardHeader>
                            <CardContent>
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-[120px]">Ações</TableHead>
                                                <TableHead>Fornecedor</TableHead>
                                                <TableHead>Descrição</TableHead>
                                                <TableHead>Nº</TableHead>
                                                <TableHead>Vencimento</TableHead>
                                                <TableHead>Valor</TableHead>
                                                <TableHead>Vlr Pago</TableHead>
                                                <TableHead>Data Pagamento</TableHead>
                                                <TableHead>Status</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {parcelasFiltradas.length === 0 ? (
                                                <TableRow><TableCell colSpan={9} className="text-center h-24">Nenhuma parcela encontrada no período.</TableCell></TableRow>
                                            ) : (
                                                parcelasFiltradas.map((p) => {
                                                    const statusVariant = getBadgeVariant(p.status, p.data_vencimento);
                                                    const isPaga = p.status === 'paga';
                                                    const descricao = p.admin_contas_pagar?.descricao || 'N/A';
                                                    const fornecedor = contas.find(c => c.id === p.conta_pagar_id)?.fornecedor || 'N/A';

                                                    return (
                                                        <TableRow key={p.id} className={cn(isPaga && 'bg-green-500/10')}>
                                                            <TableCell className="text-left min-w-[120px]">
                                                                <Button 
                                                                    variant="outline" 
                                                                    size="sm" 
                                                                    onClick={() => handleOpenPagamento(p, fornecedor)} 
                                                                    disabled={isPaga}
                                                                >
                                                                    <BadgeDollarSign className="w-4 h-4 mr-2" /> Pagar
                                                                </Button>
                                                            </TableCell>
                                                            <TableCell className="font-medium">{fornecedor}</TableCell>
                                                            <TableCell className="text-sm text-muted-foreground">{descricao}</TableCell>
                                                            <TableCell className="text-center">{p.numero_parcela}</TableCell>
                                                            <TableCell>{formatDate(p.data_vencimento)}</TableCell>
                                                            <TableCell>{formatCurrency(p.valor_parcela)}</TableCell>
                                                            <TableCell className={cn(isPaga && 'font-semibold text-green-600')}>{formatCurrency(p.valor_pago || 0)}</TableCell>
                                                            <TableCell>{p.data_pagamento ? formatDate(p.data_pagamento) : '-'}</TableCell>
                                                            <TableCell>
                                                                <Badge variant={statusVariant}>{p.status}</Badge>
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
                
                {/* TAB 3: PAGAMENTOS (HISTÓRICO - APENAS ADMIN) */}
                {isMyLaunch && (
                    <TabsContent value="pagamentos" className="mt-4">
                        <Card>
                            <CardHeader><CardTitle>Histórico de Pagamentos ({pagamentosFiltrados.length})</CardTitle></CardHeader>
                            <CardContent>
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Data Pagamento</TableHead>
                                                <TableHead>Fornecedor</TableHead>
                                                <TableHead>Descrição</TableHead>
                                                <TableHead>Valor Pago</TableHead>
                                                <TableHead>Forma Pagamento</TableHead>
                                                <TableHead>Conta/Caixa</TableHead>
                                                <TableHead>Origem</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {pagamentosFiltrados.length === 0 ? (
                                                <TableRow><TableCell colSpan={7} className="text-center h-24">Nenhum pagamento encontrado no período.</TableCell></TableRow>
                                            ) : (
                                                pagamentosFiltrados.map((r) => {
                                                    const dataPagamentoDisplay = formatTimestamp(r.data_pagamento);
                                                    const parcela = parcelas.find(p => p.id === r.parcela_id);
                                                    const contaPagar = contas.find(c => c.id === parcela?.conta_pagar_id);
                                                    
                                                    const fornecedor = contaPagar?.fornecedor || 'N/A';
                                                    const descricao = r.admin_parcelas_pagar?.admin_contas_pagar?.descricao || 'N/A';
                                                    const origem = r.admin_parcelas_pagar?.admin_contas_pagar?.origem || 'manual';
                                                    const contaOrigem = r.saldo_contas?.nome || 'N/A';

                                                    return (
                                                        <TableRow key={r.id}>
                                                            <TableCell>{dataPagamentoDisplay}</TableCell>
                                                            <TableCell className="font-medium">{fornecedor}</TableCell>
                                                            <TableCell className="text-sm text-muted-foreground">{descricao}</TableCell>
                                                            <TableCell className="font-semibold text-red-600">{formatCurrency(r.valor_pago)}</TableCell>
                                                            <TableCell>{r.forma_pagamento}</TableCell>
                                                            <TableCell>{contaOrigem}</TableCell>
                                                            <TableCell><Badge variant="secondary">{origem}</Badge></TableCell>
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
            </Tabs>
        </TabsContent>
      </Tabs>
      
      {/* Modais */}
      {isMyLaunch && contaSelecionada && (
          <DetalhesParcelasCPDialog
            conta={contaSelecionada as AdminContaPagar}
            open={parcelasDialogOpen}
            onOpenChange={setParcelasDialogOpen}
            onDataChange={buscarDados}
          />
      )}
      
      {isMyLaunch && parcelaParaPagamento && (
          <RegistrarPagamentoCPDialog
            parcela={parcelaParaPagamento}
            open={pagamentoDialogOpen}
            onOpenChange={setPagamentoDialogOpen}
            onSaveComplete={handlePagamentoCompleto}
          />
      )}
    </LayoutPrincipal>
  );
};

export default ContasPagar;