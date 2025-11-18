import { useState, useEffect, useCallback, useMemo } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, PlusCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
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
  const [filtroTexto, setFiltroTexto] = useState(''); // NOVO ESTADO
  const filtroTextoDebounced = useDebounce(filtroTexto, 500); // NOVO DEBOUNCE

  const isAdmin = role === 'Admin';
  
  const getOwnerId = () => {
    if (isAdmin) return usuario?.id || null;
    if (role === 'Cliente') return (perfil as ClienteProfile)?.id || null;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id || null; // FIX: proprietario_id -> cliente_id
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
    
    // --- 1. Buscar Contas Sintéticas ---
    let contasQuery = supabase
        .from(tabelaContasReceber)
        .select(`*, clientes(nome)`)
        .eq(ownerKey, ownerId)
        .order('data_vencimento', { ascending: true });
        
    // Aplica filtros de período
    if (filtroPeriodo?.from) {
        contasQuery = contasQuery.gte('data_vencimento', format(filtroPeriodo.from, 'yyyy-MM-dd'));
    }
    if (filtroPeriodo?.to) {
        contasQuery = contasQuery.lte('data_vencimento', format(filtroPeriodo.to, 'yyyy-MM-dd'));
    }
    
    // Aplica filtro de texto (busca apenas por descrição no backend)
    if (filtroTextoDebounced) {
        const termo = `%${filtroTextoDebounced}%`;
        // CORREÇÃO: Remove a busca por ID (UUID) e clientes.nome (relação)
        contasQuery = contasQuery.ilike('descricao', termo);
    }
    
    const [contasRes, parcelasRes, recebimentosRes] = await Promise.all([
      contasQuery,
      
      // --- 2. Buscar Parcelas (Analítico) ---
      supabase
        .from(tabelaParcelasReceber)
        .select(`
          *,
          contas_receber: ${tabelaContasReceber} (
            id,
            descricao,
            cliente_id,
            clientes ( nome ),
            origem
          )
        `)
        .eq(ownerKey, ownerId)
        .order('data_vencimento', { ascending: true }),
        
      // --- 3. Buscar Recebimentos (Histórico) ---
      isAdmin ? supabase
        .from('admin_recebimentos')
        .select(`
          *,
          saldo_contas ( nome ),
          admin_parcelas_receber (
            numero_parcela,
            admin_contas_receber ( id, descricao, origem, cliente_id )
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
        
        // FILTRAGEM DE TEXTO NO FRONTEND (para clientes.nome e id)
        if (filtroTextoDebounced) {
            const termo = filtroTextoDebounced.toLowerCase();
            fetchedContas = fetchedContas.filter(c => 
                c.id.toLowerCase().includes(termo) ||
                c.clientes?.nome?.toLowerCase().includes(termo)
            );
        }
        
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
  }, [ownerId, isAdmin, filtroPeriodo, filtroTextoDebounced]);

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

  // CORREÇÃO: Implementação da função handleEdit
  const handleEdit = (conta: ContaReceberComProgresso) => {
    // Converte ContaReceberComProgresso para ContaReceber (removendo os campos opcionais)
    const baseConta: ContaReceber = {
        id: conta.id,
        empresa_id: (conta as any).empresa_id || (conta as any).admin_id,
        cliente_id: conta.cliente_id,
        origem: conta.origem,
        descricao: conta.descricao,
        valor_total: conta.valor_total,
        data_emissao: conta.data_emissao,
        data_vencimento: conta.data_vencimento,
        status: conta.status,
        tipo_receita: conta.tipo_receita,
        clientes: conta.clientes,
        created_at: conta.created_at,
        updated_at: conta.updated_at,
        historico_id: conta.historico_id,
        id_conta_patrimonial: conta.id_conta_patrimonial, // <-- FIX: Usando id_conta_patrimonial
    };
    setContaSelecionada(baseConta);
    setDialogAberto(true);
  };

  const handleDelete = async (contaId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta conta a receber e todas as suas parcelas?')) return;
    
    setCarregandoDados(true);
    const tabelaContasReceber = isAdmin ? 'admin_contas_receber' : 'contas_receber';
    
    try {
      // 1. Buscar a descrição da conta sintética antes de deletar
      const contaToDelete = contas.find(c => c.id === contaId);
      const descricaoBusca = contaToDelete?.descricao || '';
      
      // 2. Deletar todos os Lançamentos (Entrada/Saída) relacionados a esta conta sintética
      if (descricaoBusca) {
          // Deletar Lançamentos de Recebimento (que foram criados via Recebimentos)
          // Busca por: 'Lançamento Inicial CR: [descricao]', 'Receita: [descricao]', 'Estorno Patrimonial CR: [descricao]'
          const { error: deleteLancamentosError } = await supabase
              .from('lancamentos')
              .delete()
              .ilike('descricao', `%${descricaoBusca}%`)
              .eq('proprietario_id', ownerId);
              
          if (deleteLancamentosError) console.warn('Aviso: Falha ao deletar lançamentos associados:', deleteLancamentosError);
      }
      
      // 3. Deletar a conta sintética (cascades to parcels and receipts)
      const { error } = await supabase.from(tabelaContasReceber).delete().eq('id', contaId);
      
      if (error) throw error;
      
      showSuccess('Conta excluída com sucesso.');
      buscarDados();
    } catch (error: any) {
      showError('Falha ao excluir conta: ' + error.message);
      setCarregandoDados(false);
    }
  };
  
  // CORREÇÃO: Atualiza handleOpenParcelas para aceitar ContaReceberComProgresso
  const handleOpenParcelas = (conta: ContaReceberComProgresso) => {
    // Converte ContaReceberComProgresso para ContaReceber (removendo os campos opcionais)
    const baseConta: ContaReceber = {
        id: conta.id,
        empresa_id: (conta as any).empresa_id || (conta as any).admin_id,
        cliente_id: conta.cliente_id,
        origem: conta.origem,
        descricao: conta.descricao,
        valor_total: conta.valor_total,
        data_emissao: conta.data_emissao,
        data_vencimento: conta.data_vencimento,
        status: conta.status,
        tipo_receita: conta.tipo_receita,
        clientes: conta.clientes,
        created_at: conta.created_at,
        updated_at: conta.updated_at,
        id_conta_patrimonial: conta.id_conta_patrimonial, // <-- FIX: Usando id_conta_patrimonial
    };
    setContaSelecionada(baseConta);
    setParcelasDialogOpen(true);
  };
  
  const handleOpenPagamento = (parcela: any) => {
    const isMyLaunch = isAdmin;
    
    const contaReceber = isMyLaunch 
        ? (parcela as ExtendedParcelaDetalhada).contas_receber
        : (parcela as ExtendedParcelaDetalhada).contas_receber;
        
    let clienteId: string | null = (contaReceber?.cliente_id as string | null) || null; 
        
    const mappedParcela: ParcelaParaPagamento = {
        id: parcela.id,
        conta_receber_id: parcela.conta_receber_id,
        empresa_id: ownerId!,
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