import { useState, useEffect, useCallback, useMemo } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, PlusCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { ContaReceber, ExtendedParcelaDetalhada, ContaReceberComProgresso, AdminRecebimento } from '@/types/contas-receber';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import FormContasReceber from '@/components/formularios/FormContasReceber';
import DetalhesParcelasDialog from '@/components/DetalhesParcelasDialog';
import { DateRange } from 'react-day-picker';
import { isToday, isPast, parseISO, format } from 'date-fns';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import RegistrarPagamentoDialog from '@/components/contas-receber/RegistrarPagamentoDialog';
import ContasReceberAcoes from '@/components/contas-receber/ContasReceberAcoes';
import ContasReceberResumo from '@/components/contas-receber/ContasReceberResumo';
import TabelaSintetica from '@/components/contas-receber/TabelaSintetica';
import TabelaParcelas from '@/components/contas-receber/TabelaParcelas';
import TabelaRecebimentos from '@/components/contas-receber/TabelaRecebimentos';
import { useDebounce } from '@/hooks/use-debounce';
import { formatarData } from '@/utils/formatters';
import SetupBlocker from '@/components/SetupBlocker';
import { useSessao } from '@/hooks/use-sessao';
import { useOwner } from '@/hooks/use-owner'; // NOVO IMPORT

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

type FiltroOrigem = 'todos' | 'contrato' | 'assinatura_recorrente' | 'manual';

interface ParcelaParaPagamento {
  id: string;
  conta_receber_id: string;
  empresa_id: string;
  valor_parcela: number;
  valor_pago: number;
  cliente_id: string | null;
}


const ContasReceber = () => {
  const { usuario, carregando: carregandoSessao, setupStatus } = useSessao();
  const { ownerId, ownerType } = useOwner();
  const isAdmin = ownerType === 'Admin' || ownerType === 'AdminUsuario';
  
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
  const [filtroTexto, setFiltroTexto] = useState('');
  const filtroTextoDebounced = useDebounce(filtroTexto, 500);

  const proprietarioId = ownerId;
  const isSupervisao = ownerType === 'Admin' || ownerType === 'AdminUsuario';
  const isClienteContext = ownerType === 'Cliente' || ownerType === 'ClienteUsuario';
  
  const shouldBlockSetup = isClienteContext && setupStatus && !setupStatus.isComplete;

  const buscarDados = useCallback(async () => {
    if (!proprietarioId || shouldBlockSetup) {
      setCarregandoDados(false);
      return;
    }
    
    setCarregandoDados(true);
    
    const tabelaContasReceber = isSupervisao ? 'admin_contas_receber' : 'contas_receber';
    const tabelaParcelasReceber = isSupervisao ? 'admin_parcelas_receber' : 'parcelas_contas_receber';
    const tabelaRecebimentos = isSupervisao ? 'admin_recebimentos' : 'recebimentos'; // Assumindo que cliente tenha
    const tabelaClientes = isSupervisao ? 'tbl_clientes' : 'clientes';
    const ownerKey = isSupervisao ? 'admin_id' : 'proprietario_id';
    
    let contasQuery = supabase
        .from(tabelaContasReceber)
        .select(`*`)
        .eq(ownerKey, proprietarioId)
        .order('data_vencimento', { ascending: true });
        
    if (filtroPeriodo?.from) {
        contasQuery = contasQuery.gte('data_vencimento', format(filtroPeriodo.from, 'yyyy-MM-dd'));
    }
    if (filtroPeriodo?.to) {
        contasQuery = contasQuery.lte('data_vencimento', format(filtroPeriodo.to, 'yyyy-MM-dd'));
    }
    
    const [contasRes, parcelasRes, recebimentosRes] = await Promise.all([
      contasQuery,
      supabase
        .from(tabelaParcelasReceber)
        .select(`*, contas_receber: ${tabelaContasReceber} (id, descricao, cliente_id, origem)`)
        .eq(ownerKey, proprietarioId)
        .order('data_vencimento', { ascending: true }),
      supabase
        .from(tabelaRecebimentos)
        .select(`*, saldo_contas ( nome ), ${tabelaParcelasReceber} ( numero_parcela, ${tabelaContasReceber} ( id, descricao, origem, cliente_id ) )`)
        .eq(ownerKey, proprietarioId)
        .order('data_recebimento', { ascending: false }),
    ]);

    if (contasRes.error) {
        showError('Erro ao carregar contas: ' + contasRes.error.message);
        setCarregandoDados(false);
        return;
    }
    if (parcelasRes.error) {
        showError('Erro ao carregar parcelas: ' + parcelasRes.error.message);
        setCarregandoDados(false);
        return;
    }
     if (recebimentosRes.error) {
        showError('Erro ao carregar recebimentos: ' + recebimentosRes.error.message);
     }
    
    let fetchedContas = contasRes.data as ContaReceberComProgresso[];
    let fetchedParcelas = parcelasRes.data as unknown as ExtendedParcelaDetalhada[];
        
    const clienteIds = [...new Set([
        ...fetchedContas.map(c => c.cliente_id).filter(Boolean),
        ...fetchedParcelas.map(p => p.contas_receber?.cliente_id).filter(Boolean)
    ])];
        
    let clienteMap: Record<string, string> = {};
    if (clienteIds.length > 0) {
        const { data: clientesData } = await supabase.from(tabelaClientes).select('id, nome').in('id', clienteIds);
        if (clientesData) {
            clienteMap = clientesData.reduce((acc, c) => { acc[c.id] = c.nome; return acc; }, {} as Record<string, string>);
            fetchedContas = fetchedContas.map(conta => ({ ...conta, clientes: conta.cliente_id && clienteMap[conta.cliente_id] ? { nome: clienteMap[conta.cliente_id] } as any : conta.clientes }));
            fetchedParcelas = fetchedParcelas.map(parcela => ({ ...parcela, contas_receber: parcela.contas_receber ? { ...parcela.contas_receber, clientes: parcela.contas_receber.cliente_id && clienteMap[parcela.contas_receber.cliente_id] ? { nome: clienteMap[parcela.contas_receber.cliente_id] } : null } : null }));
        }
    }
        
    const parcelasPorConta = fetchedParcelas.reduce((acc, p) => {
        acc[p.conta_receber_id] = acc[p.conta_receber_id] || [];
        acc[p.conta_receber_id].push(p);
        return acc;
    }, {} as Record<string, ExtendedParcelaDetalhada[]>);
        
    fetchedContas = fetchedContas.map(conta => {
        const parcelas = parcelasPorConta[conta.id] || [];
        const pagas = parcelas.filter(p => p.status === 'paga').length;
        return { ...conta, parcelas_pagas: pagas, parcelas_total: parcelas.length };
    });
        
    if (filtroTextoDebounced) {
        const termo = filtroTextoDebounced.toLowerCase();
        fetchedContas = fetchedContas.filter(c => c.id.toLowerCase().includes(termo) || c.clientes?.nome?.toLowerCase().includes(termo) || c.descricao.toLowerCase().includes(termo));
    }
        
    setContas(fetchedContas);
    setParcelas(fetchedParcelas);
    setRecebimentos((recebimentosRes.data as AdminRecebimento[]) || []);
    setClienteNomeMap(clienteMap);
    setCarregandoDados(false);
  }, [proprietarioId, ownerType, isSupervisao, filtroPeriodo, filtroTextoDebounced, shouldBlockSetup]);

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

  const handleEdit = (conta: ContaReceberComProgresso) => {
    const baseConta: ContaReceber = {
        ...conta,
        empresa_id: proprietarioId!,
    };
    setContaSelecionada(baseConta);
    setDialogAberto(true);
  };

  const handleDelete = async (contaId: string) => {
    if (!proprietarioId) return;
    setCarregandoDados(true);
    const tabelaContasReceber = isSupervisao ? 'admin_contas_receber' : 'contas_receber';
    const tabelaParcelasReceber = isSupervisao ? 'admin_parcelas_receber' : 'parcelas_contas_receber';
    
    try {
      const { count: parcelasCount, error: countError } = await supabase
          .from(tabelaParcelasReceber)
          .select('*', { count: 'exact', head: true })
          .eq('conta_receber_id', contaId);
          
      if (countError) throw countError;
      
      if (parcelasCount && parcelasCount > 0) {
        showError(`Não é possível excluir. Existem ${parcelasCount} parcela(s) vinculada(s) a esta conta. Exclua as parcelas individualmente primeiro.`);
        setCarregandoDados(false);
        return;
      }
      
      const contaToDelete = contas.find(c => c.id === contaId);
      const descricaoBusca = contaToDelete?.descricao || '';
      
      if (descricaoBusca) {
          const { error: deleteLancamentosError } = await supabase
              .from('lancamentos')
              .delete()
              .ilike('descricao', `%${descricaoBusca}%`)
              .eq('proprietario_id', proprietarioId);
              
          if (deleteLancamentosError) console.warn('Aviso: Falha ao deletar lançamentos associados:', deleteLancamentosError);
      }
      
      const { error } = await supabase.from(tabelaContasReceber).delete().eq('id', contaId);
      if (error) throw error;
      
      showSuccess('Conta excluída com sucesso.');
      buscarDados();
    } catch (error: any) {
      showError('Falha ao excluir conta: ' + error.message);
      setCarregandoDados(false);
    }
  };
  
  const handleOpenParcelas = (conta: ContaReceberComProgresso) => {
    const baseConta: ContaReceber = {
        ...conta,
        empresa_id: proprietarioId!,
    };
    setContaSelecionada(baseConta);
    setParcelasDialogOpen(true);
  };
  
  const handleOpenPagamento = (parcela: any) => {
    const contaReceber = parcela.contas_receber;
    const clienteId: string | null = contaReceber?.cliente_id || null; 
        
    const mappedParcela: ParcelaParaPagamento = {
        id: parcela.id,
        conta_receber_id: parcela.conta_receber_id,
        empresa_id: proprietarioId!,
        valor_parcela: parcela.valor_parcela,
        valor_pago: parcela.valor_pago,
        cliente_id: clienteId,
    };
    
    setParcelaParaPagamento(mappedParcela);
    setPagamentoDialogOpen(true);
  };

  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const formatDate = (dateString: string) => formatarData(dateString);
  
  // Função para formatar timestamp completo (ISO string)
  const formatTimestamp = (dateString: string) => {
    try {
        const date = parseISO(dateString);
        return format(date, 'dd/MM/yyyy HH:mm:ss');
    } catch (e) {
        return 'Invalid Date';
    }
  };
  
  // --- Filtros de Dados (Mantidos) ---
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
  }, [contas, filtroPeriodo, filtroStatus, filtroOrigem, filtroTextoDebounced]);

  const parcelasFiltradas = useMemo(() => {
    const dateFiltered = filterData(parcelas, 'data_vencimento') as ExtendedParcelaDetalhada[];
    
    // Filtro de texto para parcelas (busca por ID da conta sintética, descrição ou cliente)
    let filteredByText = dateFiltered;
    if (filtroTextoDebounced) {
        const termo = filtroTextoDebounced.toLowerCase();
        filteredByText = filteredByText.filter(p => {
            const contaId = p.contas_receber?.id || '';
            const descricao = p.contas_receber?.descricao || '';
            const clienteNome = p.contas_receber?.clientes?.nome || '';
            
            return p.id.toLowerCase().includes(termo) ||
                   contaId.toLowerCase().includes(termo) ||
                   descricao.toLowerCase().includes(termo) ||
                   clienteNome.toLowerCase().includes(termo);
        });
    }
    
    return filterByStatus(filteredByText, false) as ExtendedParcelaDetalhada[];
  }, [parcelas, filtroPeriodo, filtroStatus, filtroOrigem, filtroTextoDebounced]);
  
  const recebimentosFiltrados = useMemo(() => {
    let filtered = filterData(recebimentos, 'data_recebimento');
    
    // Filtro de texto para recebimentos (busca por ID da conta sintética, descrição ou cliente)
    if (filtroTextoDebounced) {
        const termo = filtroTextoDebounced.toLowerCase();
        filtered = filtered.filter(r => {
            const contaId = r.admin_parcelas_receber?.admin_contas_receber?.id || '';
            const descricao = r.admin_parcelas_receber?.admin_contas_receber?.descricao || '';
            const clienteNome = clienteNomeMap[r.cliente_id] || '';
            
            return r.id.toLowerCase().includes(termo) ||
                   contaId.toLowerCase().includes(termo) ||
                   descricao.toLowerCase().includes(termo) ||
                   clienteNome.toLowerCase().includes(termo);
        });
    }
    
    if (filtroOrigem !== 'todos') {
        filtered = filtered.filter(r => {
            const origem = r.admin_parcelas_receber?.admin_contas_receber?.origem;
            return origem === filtroOrigem;
        });
    }
    
    return filtered;
  }, [recebimentos, filtroPeriodo, filtroOrigem, filtroTextoDebounced, clienteNomeMap]);

  if (carregandoSessao || carregandoDados) {
    return <LayoutPrincipal><div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></LayoutPrincipal>;
  }

  if (shouldBlockSetup) {
    return (
      <LayoutPrincipal>
        <SetupBlocker missingSteps={setupStatus?.missingSteps ?? []} />
      </LayoutPrincipal>
    );
  }

  return (
    <LayoutPrincipal>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-3xl font-bold">Contas a Receber</h1>
        <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
          <DialogTrigger asChild>
            <Button onClick={() => setContaSelecionada(null)} className="w-full sm:w-auto">
              <PlusCircle className="w-4 h-4 mr-2" />
              Novo Lançamento
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl max-h-[95vh] overflow-y-auto">
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
        filtroTexto={filtroTexto} // NOVO PROP
        setFiltroTexto={setFiltroTexto} // NOVO PROP
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
          <TabelaSintetica
            contasFiltradas={contasFiltradas}
            handleOpenParcelas={handleOpenParcelas}
            handleEdit={handleEdit}
            handleDelete={handleDelete}
            formatCurrency={formatCurrency}
            formatDate={formatDate}
          />
        </TabsContent>
        
        {/* ABA 2: PARCELAS (ANALÍTICO) */}
        <TabsContent value="parcelas" className="mt-4">
          <TabelaParcelas
            parcelasFiltradas={parcelasFiltradas}
            handleOpenPagamento={handleOpenPagamento}
            formatCurrency={formatCurrency}
            formatDate={formatDate}
            getBadgeVariant={getBadgeVariant}
          />
        </TabsContent>
        
        {/* ABA 3: RECEBIMENTOS (HISTÓRICO) */}
        <TabsContent value="recebimentos" className="mt-4">
          <TabelaRecebimentos
            recebimentosFiltrados={recebimentosFiltrados}
            clienteNomeMap={clienteNomeMap}
            formatCurrency={formatCurrency}
            formatTimestamp={formatTimestamp}
          />
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