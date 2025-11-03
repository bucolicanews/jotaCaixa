import { useState, useEffect, useCallback } from 'react';
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
import { Input } from '@/components/ui/input';
import { DateRange } from 'react-day-picker';
import { DateRangePicker } from '@/components/DateRangePicker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { isToday, isPast, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { useSearchParams } from 'react-router-dom'; // Importando useSearchParams
import RegistrarPagamentoDialog from '@/components/RegistrarPagamentoDialog'; // Importando o dialog de pagamento

type ParcelaStatus = 'aberta' | 'parcial' | 'paga' | 'reprogramada' | 'cancelada';
type BadgeVariant = 'success' | 'warning' | 'secondary' | 'destructive' | 'default' | 'info';

const getBadgeVariant = (status: ParcelaStatus, dataVencimento: string): BadgeVariant => {
  const vencimento = parseISO(dataVencimento + 'T00:00:00');

  if (status === 'paga') {
    return 'success'; // Verde para pago
  }
  
  if (status === 'cancelada') {
    return 'destructive';
  }

  // Lógica para status não pagos (aberta, parcial, reprogramada)
  
  // 1. Vencido (Vermelho)
  if (isPast(vencimento) && !isToday(vencimento)) {
    return 'destructive';
  }
  
  // 2. Vencendo Hoje, Parcial ou Reprogramada (Laranja/Amarelo)
  if (isToday(vencimento) || status === 'parcial' || status === 'reprogramada') {
    return 'warning';
  }

  // 3. Status Aberta (Azul/Info)
  if (status === 'aberta') {
    return 'info';
  }

  return 'secondary'; // Fallback
};

// Tipo para o histórico de recebimentos (Admin)
interface AdminRecebimento {
    id: string;
    data_recebimento: string;
    valor_recebido: number;
    forma_pagamento: string;
    cliente_id: string;
    admin_parcelas_receber: {
        numero_parcela: number;
        admin_contas_receber: {
            descricao: string;
        } | null;
    } | null;
}

const ContasReceber = () => {
  const { usuario, perfil, role, carregando: carregandoSessao } = useSessao();
  const [searchParams] = useSearchParams(); // Hook para ler a URL
  
  const [contas, setContas] = useState<ContaReceber[]>([]);
  const [parcelas, setParcelas] = useState<ParcelaDetalhada[]>([]);
  const [recebimentos, setRecebimentos] = useState<AdminRecebimento[]>([]); // Novo estado para recebimentos
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [contaSelecionada, setContaSelecionada] = useState<ContaReceber | null>(null);
  const [dialogFormAberto, setDialogFormAberto] = useState(false);
  const [dialogParcelasAberto, setDialogParcelasAberto] = useState(false);
  const [clienteNomeMap, setClienteNomeMap] = useState<Record<string, string>>({});
  
  // Estados para o modal de pagamento
  const [pagamentoDialogOpen, setPagamentoDialogOpen] = useState(false);
  const [parcelaParaPagamento, setParcelaParaPagamento] = useState<any | null>(null); // Usamos 'any' temporariamente para incluir campos necessários

  // Filtros
  const [filtroGeral, setFiltroGeral] = useState('');
  const [filtroPeriodo, setFiltroPeriodo] = useState<DateRange | undefined>(undefined);
  
  // Inicializa filtroStatus e activeTab com base na URL
  const initialStatus = searchParams.get('status') || 'todos';
  const initialTab = initialStatus === 'pendente' ? 'parcelas' : 'parcela_sintetica';
  
  const [filtroStatus, setFiltroStatus] = useState<string>(initialStatus); 
  const isAdmin = role === 'Admin';
  
  // Abas atualizadas: Padrão para 'parcela_sintetica'
  const [activeTab, setActiveTab] = useState(initialTab);

  // Efeito para forçar a aba correta se o filtro 'status' for passado na URL
  useEffect(() => {
      if (initialStatus === 'pendente') {
          setActiveTab('parcelas');
      }
  }, [initialStatus]);


  const getOwnerId = () => {
    if (role === 'Admin') return usuario?.id || null; // Admin usa seu próprio ID
    if (role === 'Cliente') return (perfil as ClienteProfile)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id;
    return null;
  };
  
  const empresaId = getOwnerId();
  
  const fetchClienteNames = useCallback(async () => {
    if (!isAdmin) return;
    
    // Busca todos os clientes de CR e Empresas do Sistema para mapear IDs para Nomes
    const [crRes, sistemaRes] = await Promise.all([
        supabase.from('clientes').select('id, nome'),
        supabase.from('tbl_clientes').select('id, nome'),
    ]);
    
    const map: Record<string, string> = {};
    
    if (crRes.data) {
        crRes.data.forEach(c => map[c.id] = c.nome);
    }
    if (sistemaRes.data) {
        // Adiciona nomes de empresas do sistema, mas não sobrescreve se já existir em 'clientes'
        sistemaRes.data.forEach(c => {
            if (!map[c.id]) {
                map[c.id] = c.nome;
            }
        });
    }
    
    setClienteNomeMap(map);
  }, [isAdmin]);

  const buscarDados = useCallback(async () => {
    if (!carregandoSessao && usuario) {
        if (isAdmin) {
            await fetchClienteNames(); // Garante que os nomes dos clientes estejam carregados
        }
    }
    
    if (!empresaId && !isAdmin) {
        setContas([]);
        setParcelas([]);
        setRecebimentos([]);
        setCarregandoDados(false);
        return;
    }
    
    setCarregandoDados(true);
    
    let contasQuery;
    let parcelasQuery;
    let recebimentosQuery;
    
    if (isAdmin) {
        // ADMIN: Busca nas tabelas admin_*
        
        // 1. Busca de Contas Sintéticas (admin_contas_receber) - SEM FILTRO DE ORIGEM
        contasQuery = supabase.from('admin_contas_receber').select('*').eq('admin_id', empresaId).order('data_vencimento', { ascending: true });
        
        // 2. Busca de Parcelas (admin_parcelas_receber) - Usado na aba 'Todas as Parcelas'
        parcelasQuery = supabase.from('admin_parcelas_receber').select('*, admin_contas_receber(descricao, cliente_id, admin_id, origem)').eq('admin_id', empresaId).order('data_vencimento', { ascending: true });
        
        // 3. Busca de Recebimentos (admin_recebimentos) - Usado na nova aba
        recebimentosQuery = supabase.from('admin_recebimentos').select(`
            id,
            data_recebimento,
            valor_recebido,
            forma_pagamento,
            cliente_id,
            admin_parcelas_receber (
                numero_parcela,
                admin_contas_receber ( descricao )
            )
        `).eq('admin_id', empresaId).order('data_recebimento', { ascending: false });
        
    } else if (empresaId) {
        // Cliente/Usuário: Busca nas tabelas normais
        contasQuery = supabase.from('contas_receber').select('*, clientes(*)').eq('empresa_id', empresaId).order('data_vencimento', { ascending: true });
        parcelasQuery = supabase.from('parcelas_contas_receber').select('*, contas_receber(descricao, clientes(nome), empresa_id)').eq('empresa_id', empresaId).order('data_vencimento', { ascending: true });
    } else {
        setContas([]);
        setParcelas([]);
        setRecebimentos([]);
        setCarregandoDados(false);
        return;
    }

    const [contasRes, parcelasRes, recebimentosRes] = await Promise.all([
        contasQuery, 
        parcelasQuery, 
        isAdmin ? recebimentosQuery : Promise.resolve({ data: [], error: null }) // Só busca recebimentos se for Admin
    ]);

    if (contasRes.error) showError('Erro ao carregar contas: ' + contasRes.error.message);
    else setContas(contasRes.data as any[]);

    if (parcelasRes.error) showError('Erro ao carregar parcelas: ' + parcelasRes.error.message);
    else {
        let fetchedParcelas = parcelasRes.data as any[];
        setParcelas(fetchedParcelas);
    }
    
    if (isAdmin && recebimentosRes) {
        if (recebimentosRes.error) {
            showError('Erro ao carregar recebimentos: ' + recebimentosRes.error.message);
            setRecebimentos([]);
        } else {
            setRecebimentos(recebimentosRes.data as AdminRecebimento[]);
        }
    }
    
    setCarregandoDados(false);
  }, [carregandoSessao, usuario, isAdmin, empresaId, fetchClienteNames]);

  useEffect(() => {
    buscarDados();
  }, [buscarDados]);

  const handleSaveComplete = () => {
    setDialogFormAberto(false);
    setContaSelecionada(null);
    buscarDados();
  };
  
  const handlePagamentoCompleto = () => {
    setPagamentoDialogOpen(false);
    setParcelaParaPagamento(null);
    buscarDados(); // Re-busca todos os dados após o pagamento
  };

  const handleDelete = async (contaId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este conta e todas as suas parcelas? A ação não pode ser desfeita.')) return;
    
    // A tabela de destino depende se é Admin e qual aba está ativa
    const tabelaContasReceber = isAdmin ? 'admin_contas_receber' : 'contas_receber';
    
    const { error } = await supabase.from(tabelaContasReceber).delete().eq('id', contaId);
    if (error) showError('Erro ao excluir conta: ' + error.message);
    else {
      showSuccess('Conta excluída com sucesso.');
      buscarDados();
    }
  };

  const handleOpenParcelas = (conta: ContaReceber) => {
    setContaSelecionada(conta);
    setDialogParcelasAberto(true);
  };
  
  const handleOpenPagamento = (parcela: any) => {
    // Mapeia os campos necessários para o RegistrarPagamentoDialog
    const isMyLaunch = isAdmin; // Se for Admin, sempre usa admin_*
    
    const contaReceberData = isMyLaunch 
        ? parcela.admin_contas_receber 
        : parcela.contas_receber;
        
    const mappedParcela = {
        id: parcela.id,
        conta_receber_id: parcela.conta_receber_id,
        empresa_id: isMyLaunch ? contaReceberData.admin_id : contaReceberData.empresa_id,
        valor_parcela: parcela.valor_parcela,
        valor_pago: parcela.valor_pago,
    };
    
    setParcelaParaPagamento(mappedParcela);
    setPagamentoDialogOpen(true);
  };

  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const formatDate = (dateString: string) => new Date(dateString + 'T00:00:00').toLocaleDateString('pt-BR');

  const parcelasFiltradas = parcelas.filter(p => {
    const termoBusca = filtroGeral.toLowerCase();
    const dataVencimento = new Date(p.data_vencimento + 'T00:00:00');

    // 1. Filtro de Período (Data de Vencimento)
    if (filtroPeriodo?.from) {
      const from = filtroPeriodo.from;
      const to = filtroPeriodo.to || from;
      
      // Ajusta 'to' para incluir o final do dia
      const adjustedTo = new Date(to);
      adjustedTo.setHours(23, 59, 59, 999);

      if (dataVencimento < from || dataVencimento > adjustedTo) {
        return false;
      }
    }

    // 2. Filtro de Status
    if (filtroStatus !== 'todos') {
      const status = p.status;
      if (filtroStatus === 'pendente' && (status === 'paga' || status === 'cancelada')) {
        return false;
      }
      if (filtroStatus === 'paga' && status !== 'paga') {
        return false;
      }
      if (filtroStatus === 'aberta' && status !== 'aberta' && status !== 'parcial' && status !== 'reprogramada') {
        return false;
      }
    }

    // 3. Filtro Geral (Texto)
    // Lógica de acesso ao nome do cliente e descrição
    let clienteNome = 'N/A';
    let descricao = 'N/A';
    
    const isMyLaunch = isAdmin;
    
    if (isMyLaunch) {
        // Admin: Usa o mapa para buscar o nome do cliente e a descrição do join
        const contaReceber = (p as any).admin_contas_receber;
        descricao = contaReceber?.descricao || 'N/A';
        clienteNome = clienteNomeMap[contaReceber?.cliente_id] || 'N/A';
    } else {
        // Cliente/Supervisão: Acessa o nome do cliente e descrição
        const contaReceber = (p as any).contas_receber;
        clienteNome = contaReceber?.clientes?.nome || 'N/A';
        descricao = contaReceber?.descricao || 'N/A';
    }

    return (
      clienteNome.toLowerCase().includes(termoBusca) ||
      descricao.toLowerCase().includes(termoBusca) ||
      String(p.numero_parcela).includes(termoBusca) ||
      formatDate(p.data_vencimento).includes(termoBusca) ||
      formatCurrency(p.valor_parcela).includes(termoBusca) ||
      formatCurrency(p.valor_pago || 0).includes(termoBusca) ||
      p.status.toLowerCase().includes(termoBusca)
    );
  });
  
  const contasFiltradas = contas.filter(c => {
    const termoBusca = filtroGeral.toLowerCase();
    
    // Lógica de acesso ao nome do cliente e descrição
    let clienteNome = 'N/A';
    let descricao = c.descricao;
    
    if (isAdmin) {
        // Admin: Usa o mapa para buscar o nome do cliente
        clienteNome = clienteNomeMap[c.cliente_id] || 'N/A';
    } else {
        // Cliente/Supervisão: Acessa o nome do cliente diretamente
        clienteNome = c.clientes?.nome || 'N/A';
    }
    
    return (
      clienteNome.toLowerCase().includes(termoBusca) ||
      descricao.toLowerCase().includes(termoBusca) ||
      formatCurrency(c.valor_total).includes(termoBusca) ||
      c.status.toLowerCase().includes(termoBusca)
    );
  });
  
  const recebimentosFiltrados = recebimentos.filter(r => {
    const termoBusca = filtroGeral.toLowerCase();
    
    const clienteNome = clienteNomeMap[r.cliente_id] || 'N/A';
    const descricao = r.admin_parcelas_receber?.admin_contas_receber?.descricao || 'N/A';
    
    return (
        clienteNome.toLowerCase().includes(termoBusca) ||
        descricao.toLowerCase().includes(termoBusca) ||
        r.forma_pagamento.toLowerCase().includes(termoBusca) ||
        formatCurrency(r.valor_recebido).includes(termoBusca)
    );
  });

  if (carregandoSessao || carregandoDados) {
    return <LayoutPrincipal><div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></LayoutPrincipal>;
  }

  return (
    <LayoutPrincipal>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl md:text-3xl font-bold">Contas a Receber</h1>
        <Dialog open={dialogFormAberto} onOpenChange={setDialogFormAberto}>
          <DialogTrigger asChild>
            <Button onClick={() => setContaSelecionada(null)} className="w-full sm:w-auto">
              <PlusCircle className="w-4 h-4 mr-2" />
              Nova Conta
            </Button>
          </DialogTrigger>
          <DialogContent><DialogHeader><DialogTitle>{contaSelecionada ? 'Editar Conta' : 'Nova Conta a Receber'}</DialogTitle></DialogHeader><FormContasReceber contaInicial={contaSelecionada} onSaveComplete={handleSaveComplete} /></DialogContent>
        </Dialog>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className={cn("grid w-full", isAdmin ? "grid-cols-3" : "grid-cols-2")}>
          <TabsTrigger value="parcela_sintetica">Parcela Sintética</TabsTrigger>
          <TabsTrigger value="parcelas">Todas as Parcelas</TabsTrigger>
          {isAdmin && <TabsTrigger value="recebimentos">Parcelas Recebidas</TabsTrigger>}
        </TabsList>
        
        {/* ABA DE PARCELAS (ANALÍTICO) */}
        <TabsContent value="parcelas">
          <Card>
            <CardHeader>
              <CardTitle>Detalhamento de Todas as Parcelas</CardTitle>
              <div className="flex flex-col md:flex-row gap-4 mt-4">
                <Input
                  placeholder="Filtrar por cliente, descrição, valor..."
                  value={filtroGeral}
                  onChange={(e) => setFiltroGeral(e.target.value)}
                  className="w-full md:max-w-xs"
                />
                <DateRangePicker
                  date={filtroPeriodo}
                  setDate={setFiltroPeriodo}
                  className="w-full md:w-auto"
                />
                <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                  <SelectTrigger className="w-full md:w-[180px]">
                    <SelectValue placeholder="Filtrar por Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os Status</SelectItem>
                    <SelectItem value="pendente">Em Aberto / Parcial</SelectItem>
                    <SelectItem value="paga">Quitadas</SelectItem>
                    <SelectItem value="aberta">Abertas / Reprogramadas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Cliente</TableHead><TableHead>Descrição</TableHead><TableHead className="text-center">Nº Parcela</TableHead><TableHead>Vencimento</TableHead><TableHead>Valor da Parcela</TableHead><TableHead>Valor Pago</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {parcelasFiltradas.length > 0 ? (
                      parcelasFiltradas.map((p) => {
                        // Determina o nome do cliente e a descrição com base na aba ativa (Admin vs Cliente)
                        const isMyLaunch = isAdmin;
                        
                        const contaReceber = isMyLaunch 
                            ? (p as any).admin_contas_receber 
                            : (p as any).contas_receber;
                            
                        const clienteId = isMyLaunch ? contaReceber?.cliente_id : contaReceber?.clientes?.id;
                        const clienteNome = isMyLaunch ? clienteNomeMap[clienteId] || 'N/A' : contaReceber?.clientes?.nome || 'N/A';
                        const descricao = contaReceber?.descricao || 'N/A';
                            
                        const isPaidOrCancelled = p.status === 'paga' || p.status === 'cancelada';

                        return (
                          <TableRow key={p.id}>
                            <TableCell>{clienteNome}</TableCell>
                            <TableCell>{descricao}</TableCell>
                            <TableCell className="text-center">{p.numero_parcela}</TableCell>
                            <TableCell>{formatDate(p.data_vencimento)}</TableCell>
                            <TableCell>{formatCurrency(p.valor_parcela)}</TableCell>
                            <TableCell className="font-medium">{formatCurrency(p.valor_pago || 0)}</TableCell>
                            <TableCell><Badge variant={getBadgeVariant(p.status, p.data_vencimento)}>{p.status}</Badge></TableCell>
                            <TableCell className="text-right">
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => handleOpenPagamento(p)} 
                                    disabled={isPaidOrCancelled}
                                >
                                    <BadgeDollarSign className="w-4 h-4" />
                                </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    ) : (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center h-24">
                          Nenhum resultado encontrado.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* ABA DE LANÇAMENTOS (SINTÉTICO) */}
        <TabsContent value="parcela_sintetica">
          <Card>
            <CardHeader><CardTitle>Resumo dos Lançamentos</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-left">Ações</TableHead> 
                      <TableHead>Cliente</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Valor Total</TableHead>
                      <TableHead className="hidden sm:table-cell">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contasFiltradas.map((conta) => {
                      const statusVariant = getBadgeVariant(conta.status as ParcelaStatus, conta.data_vencimento);
                      
                      const statusColorClass = {
                        success: 'text-green-500',
                        warning: 'text-yellow-500',
                        destructive: 'text-red-500',
                        info: 'text-blue-500',
                        secondary: 'text-muted-foreground',
                        default: 'text-primary',
                      }[statusVariant];

                      // Ações de edição/deleção são permitidas em todas as contas sintéticas agora
                      const canEditOrDelete = true;
                      
                      // Lógica de exibição do nome do cliente
                      let clienteNomeDisplay = 'N/A';
                      if (isAdmin) {
                          // Admin: Usa o mapa para buscar o nome do cliente
                          clienteNomeDisplay = clienteNomeMap[conta.cliente_id] || 'N/A';
                      } else {
                          // Cliente/Supervisão: Acessa o nome do cliente diretamente
                          clienteNomeDisplay = conta.clientes?.nome || 'N/A';
                      }


                      return (
                        <TableRow key={conta.id}>
                          <TableCell className="text-left min-w-[120px]">
                            <div className="flex flex-col space-y-1 sm:flex-row sm:space-x-1 sm:space-y-0">
                              <Button variant="ghost" size="icon" onClick={() => handleOpenParcelas(conta)} title="Ver Parcelas"><ListChecks className="h-4 w-4" /></Button>
                              {canEditOrDelete && (
                                <>
                                  <Button variant="ghost" size="icon" onClick={() => { setContaSelecionada(conta); setDialogFormAberto(true); }}><Edit className="h-4 w-4" /></Button>
                                  <Button variant="ghost" size="icon" onClick={() => handleDelete(conta.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                          
                          <TableCell className="font-medium">
                            {clienteNomeDisplay}
                            <span className={cn("block text-xs font-normal sm:hidden", statusColorClass)}>
                              ({conta.status})
                            </span>
                          </TableCell>
                          <TableCell>{conta.descricao}</TableCell>
                          <TableCell>{formatDate(conta.data_vencimento)}</TableCell>
                          <TableCell>{formatCurrency(conta.valor_total)}</TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <Badge variant={statusVariant}>{conta.status}</Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* ABA DE RECEBIMENTOS (APENAS ADMIN) */}
        {isAdmin && activeTab === 'recebimentos' && (
            <TabsContent value="recebimentos">
                <Card>
                    <CardHeader><CardTitle>Histórico de Parcelas Recebidas</CardTitle></CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader><TableRow>
                                    <TableHead>Data Recebimento</TableHead>
                                    <TableHead>Cliente</TableHead>
                                    <TableHead>Descrição</TableHead>
                                    <TableHead>Forma Pagamento</TableHead>
                                    <TableHead className="text-right">Valor Recebido</TableHead>
                                </TableRow></TableHeader>
                                <TableBody>
                                    {recebimentosFiltrados.length > 0 ? (
                                        recebimentosFiltrados.map((r) => {
                                            const clienteNome = clienteNomeMap[r.cliente_id] || 'N/A';
                                            const descricao = r.admin_parcelas_receber?.admin_contas_receber?.descricao || 'N/A';
                                            
                                            return (
                                                <TableRow key={r.id}>
                                                    <TableCell>{formatDate(r.data_recebimento)}</TableCell>
                                                    <TableCell>{clienteNome}</TableCell>
                                                    <TableCell>{descricao}</TableCell>
                                                    <TableCell>{r.forma_pagamento}</TableCell>
                                                    <TableCell className="text-right font-medium text-green-600">{formatCurrency(r.valor_recebido)}</TableCell>
                                                </TableRow>
                                            );
                                        })
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center h-24">
                                                Nenhum recebimento encontrado.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </TabsContent>
        )}
      </Tabs>

      <DetalhesParcelasDialog
        conta={contaSelecionada}
        open={dialogParcelasAberto}
        onOpenChange={setDialogParcelasAberto}
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