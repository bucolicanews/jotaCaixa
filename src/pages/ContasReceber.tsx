import { useState, useEffect, useCallback, useMemo } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, PlusCircle, Edit, Trash2, ListChecks, BadgeDollarSign } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { ContaReceber, ParcelaDetalhada } from '@/types/contas-receber';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import FormContasReceber from '@/components/FormContasReceber';
import DetalhesParcelasDialog from '@/components/DetalhesParcelasDialog';
import { Badge } from '@/components/ui/badge';
import { DateRange } from 'react-day-picker';
import { isToday, isPast, parseISO, format } from 'date-fns';
import { cn } from '@/lib/utils';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import RegistrarPagamentoDialog from '@/components/RegistrarPagamentoDialog';
import ContasReceberAcoes from '@/components/contas-receber/ContasReceberAcoes';
import ContasReceberResumo from '@/components/contas-receber/ContasReceberResumo';

type ParcelaStatus = 'aberta' | 'parcial' | 'paga' | 'reprogramada' | 'cancelada' | 'bloqueada';
type BadgeVariant = 'success' | 'warning' | 'secondary' | 'destructive' | 'default' | 'info';

const getBadgeVariant = (status: ParcelaStatus, dataVencimento: string): BadgeVariant => {
  const vencimento = parseISO(dataVencimento + 'T00:00:00');

  if (status === 'paga') return 'success';
  if (status === 'cancelada' || status === 'bloqueada') return 'destructive';
  
  if (isPast(vencimento) && !isToday(vencimento)) return 'destructive';
  if (isToday(vencimento)) return 'warning';

  return 'secondary';
};

// Type for the nested account data fetched within a parcel
interface NestedContaReceber {
    descricao: string;
    cliente_id: string | null;
    origem: ContaReceber['origem'];
    clientes: { nome: string } | null;
}

// NOVO: Tipo para a parcela detalhada com data_pagamento
interface ExtendedParcelaDetalhada extends ParcelaDetalhada {
    data_pagamento?: string | null;
    contas_receber: NestedContaReceber | null;
}

// Novo tipo para a conta sintética com progresso
interface ContaReceberComProgresso extends ContaReceber {
    parcelas_pagas?: number;
    parcelas_total?: number;
}

// Tipo para o histórico de recebimentos (Admin)
interface AdminRecebimento {
    id: string;
    data_recebimento: string;
    valor_recebido: number;
    forma_pagamento: string;
    cliente_id: string;
    conta_id: string; // NOVO CAMPO
    saldo_contas: { nome: string } | null; // NOVO CAMPO
    admin_parcelas_receber: {
        numero_parcela: number;
        admin_contas_receber: {
            descricao: string;
            origem: ContaReceber['origem'];
            cliente_id: string;
        } | null;
    } | null;
}

type FiltroOrigem = 'todos' | 'contrato' | 'assinatura_recorrente' | 'manual';


const ContasReceber = () => {
  const { usuario, perfil, role, carregando: carregandoSessao } = useSessao();
  
  const [contas, setContas] = useState<ContaReceberComProgresso[]>([]);
  const [parcelas, setParcelas] = useState<ExtendedParcelaDetalhada[]>([]);
  const [recebimentos, setRecebimentos] = useState<AdminRecebimento[]>([]);
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [contaSelecionada, setContaSelecionada] = useState<ContaReceber | null>(null);
  const [parcelasDialogOpen, setParcelasDialogOpen] = useState(false);
  const [pagamentoDialogOpen, setPagamentoDialogOpen] = useState(false);
  const [parcelaParaPagamento, setParcelaParaPagamento] = useState<any>(null);
  const [filtroPeriodo, setFiltroPeriodo] = useState<DateRange | undefined>(undefined);
  const [clienteNomeMap, setClienteNomeMap] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState('parcela_sintetica');
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
    
    const tabelaContasReceber = isAdmin ? 'admin_contas_receber' : 'contas_receber';
    const tabelaParcelasReceber = isAdmin ? 'admin_parcelas_receber' : 'parcelas_contas_receber';
    const ownerKey = isAdmin ? 'admin_id' : 'empresa_id';
    
    const [contasRes, parcelasRes, recebimentosRes] = await Promise.all([
      supabase
        .from(tabelaContasReceber)
        .select(`*, clientes(nome)`)
        .eq(ownerKey, ownerId)
        .order('data_vencimento', { ascending: true }),
      
      supabase
        .from(tabelaParcelasReceber)
        .select(`
          *,
          contas_receber: ${tabelaContasReceber} (
            descricao,
            cliente_id,
            clientes ( nome ),
            origem
          )
        `)
        .eq(ownerKey, ownerId)
        .order('data_vencimento', { ascending: true }),
        
      isAdmin ? supabase
        .from('admin_recebimentos')
        .select(`
          *,
          saldo_contas ( nome ),
          admin_parcelas_receber (
            numero_parcela,
            admin_contas_receber ( descricao, origem, cliente_id )
          )
        `)
        .eq('admin_id', ownerId)
        .not('cliente_id', 'is', null)
        .order('data_recebimento', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (contasRes.error) showError('Erro ao carregar contas: ' + contasRes.error.message);
    else {
        let fetchedContas = contasRes.data as ContaReceberComProgresso[];
        let fetchedParcelas = parcelasRes.data as unknown as ExtendedParcelaDetalhada[];
        
        // --- Lógica para calcular progresso de pagamento ---
        const parcelasPorConta = fetchedParcelas.reduce((acc, p) => {
            acc[p.conta_receber_id] = acc[p.conta_receber_id] || [];
            acc[p.conta_receber_id].push(p);
            return acc;
        }, {} as Record<string, ExtendedParcelaDetalhada[]>);
        
        fetchedContas = fetchedContas.map(conta => {
            const parcelas = parcelasPorConta[conta.id] || [];
            const pagas = parcelas.filter(p => p.status === 'paga').length;
            return {
                ...conta,
                parcelas_pagas: pagas,
                parcelas_total: parcelas.length,
            };
        });
        
        setContas(fetchedContas);
        setParcelas(fetchedParcelas);
    }
    
    if (isAdmin && recebimentosRes.data) {
        setRecebimentos(recebimentosRes.data as AdminRecebimento[]);
        
        // Atualiza o mapa de nomes de clientes para recebimentos
        const clienteIds = recebimentosRes.data.map(r => r.cliente_id);
        
        // 1. Buscar nomes dos clientes (tbl_clientes)
        const { data: clientesData } = await supabase
            .from('tbl_clientes')
            .select('id, nome')
            .in('id', clienteIds);
            
        if (clientesData) {
            const map = clientesData.reduce((acc, c) => {
                acc[c.id] = c.nome;
                return acc;
            }, {} as Record<string, string>);
            setClienteNomeMap(map);
        }
    }

    setCarregandoDados(false);
  }, [ownerId, isAdmin]);

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

  const handleEdit = (_conta: ContaReceber) => {
    showError('Funcionalidade de edição de Contas a Receber ainda não implementada.');
    // TODO: Implementar Dialog/Form para Contas a Receber
  };

  const handleDelete = async (contaId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta conta a receber e todas as suas parcelas?')) return;
    
    setCarregandoDados(true);
    const tabelaContasReceber = isAdmin ? 'admin_contas_receber' : 'contas_receber';
    
    // A exclusão da conta sintética deve cascatear para as parcelas (RLS deve permitir)
    const { error } = await supabase.from(tabelaContasReceber).delete().eq('id', contaId);
    
    if (error) showError('Erro ao excluir conta: ' + error.message);
    else {
      showSuccess('Conta excluída com sucesso.');
      buscarDados();
    }
  };
  
  const handleOpenParcelas = (conta: ContaReceber) => {
    setContaSelecionada(conta);
    setParcelasDialogOpen(true);
  };
  
  const handleOpenPagamento = (parcela: any) => {
    const isMyLaunch = isAdmin;
    
    const contaReceber = isMyLaunch 
        ? (parcela as ExtendedParcelaDetalhada).contas_receber
        : (parcela as ExtendedParcelaDetalhada).contas_receber;
        
    let clienteId: string | null = (contaReceber?.cliente_id as string | null) || null; 
        
    const mappedParcela = {
        id: parcela.id,
        conta_receber_id: parcela.conta_receber_id,
        empresa_id: ownerId,
        valor_parcela: parcela.valor_parcela,
        valor_pago: parcela.valor_pago,
        cliente_id: clienteId,
    };
    
    setParcelaParaPagamento(mappedParcela);
    setPagamentoDialogOpen(true);
  };

  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const formatDate = (dateString: string) => new Date(dateString + 'T00:00:00').toLocaleDateString('pt-BR');
  
  // Função para formatar timestamp completo (ISO string)
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
  
  const filterByStatus = (data: ContaReceberComProgresso[] | ExtendedParcelaDetalhada[], isSynthetic: boolean) => {
    let filteredByStatus = data;
    
    if (filtroStatus !== 'todos') {
        filteredByStatus = data.filter(item => {
            let isPaid: boolean;
            
            if (isSynthetic) {
                const conta = item as ContaReceberComProgresso;
                const total = conta.parcelas_total ?? 0;
                const pagas = conta.parcelas_pagas ?? 0;
                isPaid = total > 0 && pagas === total;
            } else {
                const parcela = item as ExtendedParcelaDetalhada;
                isPaid = parcela.status === 'paga';
            }

            return filtroStatus === 'quitado' ? isPaid : !isPaid;
        }) as any;
    }
    
    if (isSynthetic && filtroOrigem !== 'todos') {
        filteredByStatus = filteredByStatus.filter(item => {
            const conta = item as ContaReceberComProgresso;
            return conta.origem === filtroOrigem;
        }) as any;
    }
    
    if (!isSynthetic && filtroOrigem !== 'todos') {
        filteredByStatus = filteredByStatus.filter(item => {
            const parcela = item as ExtendedParcelaDetalhada;
            const origem = parcela.contas_receber?.origem;
            return origem === filtroOrigem;
        }) as any;
    }

    return filteredByStatus;
  };
  
  const contasFiltradas = useMemo(() => {
    const dateFiltered = filterData(contas, 'data_vencimento') as ContaReceberComProgresso[];
    return filterByStatus(dateFiltered, true) as ContaReceberComProgresso[];
  }, [contas, filtroPeriodo, filtroStatus, filtroOrigem]);

  const parcelasFiltradas = useMemo(() => {
    const dateFiltered = filterData(parcelas, 'data_vencimento') as ExtendedParcelaDetalhada[];
    return filterByStatus(dateFiltered, false) as ExtendedParcelaDetalhada[];
  }, [parcelas, filtroPeriodo, filtroStatus, filtroOrigem]);
  
  const recebimentosFiltrados = useMemo(() => {
    let filtered = filterData(recebimentos, 'data_recebimento');
    
    if (filtroOrigem !== 'todos') {
        filtered = filtered.filter(r => {
            const origem = r.admin_parcelas_receber?.admin_contas_receber?.origem;
            return origem === filtroOrigem;
        });
    }
    
    return filtered;
  }, [recebimentos, filtroPeriodo, filtroOrigem]);

  if (carregandoSessao || carregandoDados) {
    return <LayoutPrincipal><div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></LayoutPrincipal>;
  }

  return (
    <LayoutPrincipal>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl md:text-3xl font-bold">Contas a Receber</h1>
        <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
          <DialogTrigger asChild>
            <Button onClick={() => setContaSelecionada(null)} className="w-full sm:w-auto">
              <PlusCircle className="w-4 h-4 mr-2" />
              Novo Lançamento
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{contaSelecionada ? 'Editar Lançamento' : 'Novo Lançamento'}</DialogTitle>
            </DialogHeader>
            <FormContasReceber 
              contaInicial={contaSelecionada}
              onSaveComplete={handleSaveComplete}
            />
          </DialogContent>
        </Dialog>
      </div>
      
      <ContasReceberAcoes
        activeTab={activeTab}
        filtroPeriodo={filtroPeriodo}
        setFiltroPeriodo={setFiltroPeriodo}
        contasFiltradas={contasFiltradas}
        parcelasFiltradas={parcelasFiltradas}
        recebimentosFiltrados={recebimentosFiltrados}
        clienteNomeMap={clienteNomeMap}
        isAdmin={isAdmin}
        filtroStatus={filtroStatus}
        setFiltroStatus={setFiltroStatus}
        filtroOrigem={filtroOrigem}
        setFiltroOrigem={setFiltroOrigem}
      />
      
      <ContasReceberResumo
        activeTab={activeTab}
        contasFiltradas={contasFiltradas}
        parcelasFiltradas={parcelasFiltradas}
        recebimentosFiltrados={recebimentosFiltrados}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full mt-4">
        <TabsList className="flex flex-wrap justify-start w-full h-auto p-1">
          <TabsTrigger value="parcela_sintetica" className="flex-1 sm:flex-auto">Resumo (Sintético)</TabsTrigger>
          <TabsTrigger value="parcelas" className="flex-1 sm:flex-auto">Parcelas (Analítico)</TabsTrigger>
          <TabsTrigger value="recebimentos" className="flex-1 sm:flex-auto">Recebimentos (Histórico)</TabsTrigger>
        </TabsList>
        
        {/* ABA 1: RESUMO (SINTÉTICO) */}
        <TabsContent value="parcela_sintetica" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Lançamentos Sintéticos ({contasFiltradas.length})</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[120px]">Ações</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Valor Total</TableHead>
                      <TableHead>Progresso</TableHead>
                      <TableHead className="hidden sm:table-cell">Status</TableHead>
                      <TableHead className="hidden sm:table-cell">Origem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contasFiltradas.length === 0 ? (
                        <TableRow><TableCell colSpan={8} className="text-center h-24">Nenhuma conta a receber encontrada no período.</TableCell></TableRow>
                    ) : (
                        contasFiltradas.map((conta) => {
                            
                            const total = conta.parcelas_total ?? 0;
                            const pagas = conta.parcelas_pagas ?? 0;
                            const isQuitada = total > 0 && pagas === total;
                            let displayStatus: string;
                            let statusVariant: BadgeVariant;

                            if (isQuitada) {
                                displayStatus = 'quitada';
                                statusVariant = 'success';
                            } else {
                                const vencimento = parseISO(conta.data_vencimento + 'T00:00:00');
                                if (isPast(vencimento) && !isToday(vencimento)) {
                                    statusVariant = 'destructive';
                                    displayStatus = 'atrasada';
                                } else if (isToday(vencimento)) {
                                    statusVariant = 'warning';
                                    displayStatus = 'vence hoje';
                                } else {
                                    statusVariant = 'secondary';
                                    displayStatus = 'aberta';
                                }
                            }
                            
                            const progresso = total ? `${pagas}/${total}` : 'N/A';
                            
                            const origemDisplay = conta.origem === 'assinatura_recorrente' ? 'Assinatura' : (conta.origem === 'contrato' ? 'Contrato' : 'Manual');

                            return (
                                <TableRow key={conta.id}>
                                    <TableCell className="text-left min-w-[120px]">
                                        <div className="flex space-x-1">
                                            <Button variant="ghost" size="icon" onClick={() => handleOpenParcelas(conta)} title="Ver Parcelas"><ListChecks className="h-4 w-4" /></Button>
                                            <Button variant="ghost" size="icon" onClick={() => handleEdit(conta)} title="Editar Lançamento"><Edit className="h-4 w-4" /></Button>
                                            <Button variant="ghost" size="icon" onClick={() => handleDelete(conta.id)} title="Excluir Lançamento"><Trash2 className="w-4 h-4 text-red-500" /></Button>
                                        </div>
                                    </TableCell>
                                    <TableCell className="font-medium">{conta.clientes?.nome || 'N/A'}</TableCell>
                                    <TableCell>{conta.descricao}</TableCell>
                                    <TableCell>{formatDate(conta.data_vencimento)}</TableCell>
                                    <TableCell className="font-semibold">{formatCurrency(conta.valor_total)}</TableCell>
                                    <TableCell className="text-sm text-muted-foreground">{progresso}</TableCell>
                                    <TableCell className="hidden sm:table-cell">
                                        <Badge variant={statusVariant}>{displayStatus}</Badge>
                                    </TableCell>
                                    <TableCell className="hidden sm:table-cell">
                                        <Badge variant="secondary">{origemDisplay}</Badge>
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
        
        {/* ABA 2: PARCELAS (ANALÍTICO) */}
        <TabsContent value="parcelas" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Parcelas Pendentes e Recebidas ({parcelasFiltradas.length})</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[120px]">Ações</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Nº</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Vlr Pago</TableHead>
                      <TableHead>Data Recebimento</TableHead>
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
                            const clienteNome = p.contas_receber?.clientes?.nome || 'N/A';
                            const descricao = p.contas_receber?.descricao || 'N/A';

                            return (
                                <TableRow key={p.id} className={cn(isPaga && 'bg-green-500/10')}>
                                    <TableCell className="text-left min-w-[120px]">
                                        <Button 
                                            variant="outline" 
                                            size="sm" 
                                            onClick={() => handleOpenPagamento(p)} 
                                            disabled={isPaga || p.status === 'bloqueada'}
                                        >
                                            <BadgeDollarSign className="w-4 h-4 mr-2" /> Receber
                                        </Button>
                                    </TableCell>
                                    <TableCell className="font-medium">{clienteNome}</TableCell>
                                    <TableCell className="text-sm text-muted-foreground">{descricao}</TableCell>
                                    <TableCell className="text-center">{p.numero_parcela}</TableCell>
                                    <TableCell>{formatDate(p.data_vencimento)}</TableCell>
                                    <TableCell>{formatCurrency(p.valor_parcela)}</TableCell>
                                    <TableCell className={cn(isPaga && 'font-semibold text-green-600')}>{formatCurrency(p.valor_pago || 0)}</TableCell>
                                    <TableCell>{p.data_pagamento ? formatDate(p.data_pagamento) : '-'}</TableCell>
                                    <TableCell>
                                        <Badge variant={statusVariant}>{p.status === 'paga' ? 'recebida' : p.status}</Badge>
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
        
        {/* ABA 3: RECEBIMENTOS (HISTÓRICO) */}
        <TabsContent value="recebimentos" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Histórico de Recebimentos ({recebimentosFiltrados.length})</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data Recebimento</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Valor Recebido</TableHead>
                      <TableHead>Forma Pagamento</TableHead>
                      <TableHead>Conta/Caixa</TableHead>
                      <TableHead>Origem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recebimentosFiltrados.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="text-center h-24">Nenhum recebimento encontrado no período.</TableCell></TableRow>
                    ) : (
                        recebimentosFiltrados.map((r) => {
                            const dataRecebimentoDisplay = formatTimestamp(r.data_recebimento);
                            const clienteNome = clienteNomeMap[r.cliente_id] || 'N/A';
                            const descricao = r.admin_parcelas_receber?.admin_contas_receber?.descricao || 'N/A';
                            const origem = r.admin_parcelas_receber?.admin_contas_receber?.origem || 'manual';
                            const contaDestino = r.saldo_contas?.nome || 'N/A';

                            return (
                                <TableRow key={r.id}>
                                    <TableCell>{dataRecebimentoDisplay}</TableCell>
                                    <TableCell className="font-medium">{clienteNome}</TableCell>
                                    <TableCell className="text-sm text-muted-foreground">{descricao}</TableCell>
                                    <TableCell className="font-semibold text-green-600">{formatCurrency(r.valor_recebido)}</TableCell>
                                    <TableCell>{r.forma_pagamento}</TableCell>
                                    <TableCell>{contaDestino}</TableCell>
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
      </Tabs>
      
      <DetalhesParcelasDialog
        conta={contaSelecionada}
        open={parcelasDialogOpen}
        onOpenChange={setParcelasDialogOpen}
        onDataChange={buscarDados}
      />
      
      <RegistrarPagamentoDialog
        parcela={parcelaParaPagamento}
        open={pagamentoDialogOpen}
        onOpenChange={setPagamentoDialogOpen}
        onSaveComplete={handlePagamentoCompleto}
      />
    </LayoutPrincipal>
  );
};

export default ContasReceber;