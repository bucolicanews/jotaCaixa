import { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, PlusCircle, Edit, Trash2, ListChecks, Eye } from 'lucide-react';
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

const ContasReceber = () => {
  const { usuario, perfil, role, carregando: carregandoSessao } = useSessao();
  const [contas, setContas] = useState<ContaReceber[]>([]);
  const [parcelas, setParcelas] = useState<ParcelaDetalhada[]>([]);
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [contaSelecionada, setContaSelecionada] = useState<ContaReceber | null>(null);
  const [dialogFormAberto, setDialogFormAberto] = useState(false);
  const [dialogParcelasAberto, setDialogParcelasAberto] = useState(false);
  const [clienteNomeMap, setClienteNomeMap] = useState<Record<string, string>>({}); // Novo mapa de nomes
  
  // Filtros
  const [filtroGeral, setFiltroGeral] = useState('');
  const [filtroPeriodo, setFiltroPeriodo] = useState<DateRange | undefined>(undefined);
  const [filtroStatus, setFiltroStatus] = useState<string>('todos'); // 'todos', 'aberta', 'paga', 'pendente'
  
  const isAdmin = role === 'Admin';
  const [activeTab, setActiveTab] = useState(isAdmin ? 'meus_lancamentos' : 'lancamentos');

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

  const buscarMeusLancamentos = async () => {
    setCarregandoDados(true);
    
    let contasQuery;
    let parcelasQuery;
    
    if (isAdmin) {
        // ADMIN: Busca nas tabelas admin_*
        // Sintético: Busca todas as colunas, incluindo cliente_id, mas sem join aninhado
        contasQuery = supabase.from('admin_contas_receber').select('*').eq('admin_id', empresaId).order('data_vencimento', { ascending: true });
        // Analítico: Busca a descrição e o cliente_id da conta sintética
        parcelasQuery = supabase.from('admin_parcelas_receber').select('*, admin_contas_receber(descricao, cliente_id)').eq('admin_id', empresaId).order('data_vencimento', { ascending: true });
    } else if (empresaId) {
        // Cliente/Usuário: Busca nas tabelas normais
        contasQuery = supabase.from('contas_receber').select('*, clientes(*)').eq('empresa_id', empresaId).order('data_vencimento', { ascending: true });
        parcelasQuery = supabase.from('parcelas_contas_receber').select('*, contas_receber(descricao, clientes(nome))').eq('empresa_id', empresaId).order('data_vencimento', { ascending: true });
    } else {
        // Sem ID de empresa (usuário não vinculado)
        setContas([]);
        setParcelas([]);
        setCarregandoDados(false);
        return;
    }

    const [contasRes, parcelasRes] = await Promise.all([contasQuery, parcelasQuery]);

    if (contasRes.error) showError('Erro ao carregar contas: ' + contasRes.error.message);
    else setContas(contasRes.data as any[]);

    if (parcelasRes.error) showError('Erro ao carregar parcelas: ' + parcelasRes.error.message);
    else setParcelas(parcelasRes.data as any[]);
    
    setCarregandoDados(false);
  };
  
  const buscarSupervisao = async () => {
    if (!isAdmin) return;
    setCarregandoDados(true);
    
    // Supervisão: Busca todos os lançamentos onde empresa_id NÃO é o ID do Admin
    const [contasRes, parcelasRes] = await Promise.all([
      supabase.from('contas_receber').select('*, clientes(*)').not('empresa_id', 'eq', empresaId).order('data_vencimento', { ascending: true }),
      supabase.from('parcelas_contas_receber').select('*, contas_receber(descricao, clientes(nome))').not('empresa_id', 'eq', empresaId).order('data_vencimento', { ascending: true })
    ]);

    if (contasRes.error) showError('Erro ao carregar contas de supervisão: ' + contasRes.error.message);
    else setContas(contasRes.data as any[]);

    if (parcelasRes.error) showError('Erro ao carregar parcelas de supervisão: ' + parcelasRes.error.message);
    else setParcelas(parcelasRes.data as any[]);
    
    setCarregandoDados(false);
  };

  const buscarDados = useCallback(() => {
    if (!carregandoSessao && usuario) {
        if (isAdmin) {
            fetchClienteNames(); // Busca nomes de clientes para o mapa
            if (activeTab === 'supervisao') {
                buscarSupervisao();
            } else {
                buscarMeusLancamentos();
            }
        } else {
            buscarMeusLancamentos();
        }
    }
  }, [carregandoSessao, usuario, isAdmin, activeTab, empresaId, fetchClienteNames]);

  useEffect(() => {
    buscarDados();
  }, [buscarDados]);

  const handleSaveComplete = () => {
    setDialogFormAberto(false);
    setContaSelecionada(null);
    buscarDados();
  };

  const handleDelete = async (contaId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este conta e todas as suas parcelas? A ação não pode ser desfeita.')) return;
    
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
    
    if (isAdmin && activeTab === 'meus_lancamentos') {
        // Admin: Usa o mapa para buscar o nome do cliente
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
    
    if (isAdmin && activeTab === 'meus_lancamentos') {
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

  if (carregandoSessao || carregandoDados) {
    return <LayoutPrincipal><div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></LayoutPrincipal>;
  }

  return (
    <LayoutPrincipal>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl md:text-3xl font-bold">Contas a Receber</h1>
        <Dialog open={dialogFormAberto} onOpenChange={setDialogFormAberto}>
          <DialogTrigger asChild>
            <Button onClick={() => setContaSelecionada(null)} className="w-full sm:w-auto" disabled={isAdmin && activeTab === 'supervisao'}>
              <PlusCircle className="w-4 h-4 mr-2" />
              Nova Conta
            </Button>
          </DialogTrigger>
          <DialogContent><DialogHeader><DialogTitle>{contaSelecionada ? 'Editar Conta' : 'Nova Conta a Receber'}</DialogTitle></DialogHeader><FormContasReceber contaInicial={contaSelecionada} onSaveComplete={handleSaveComplete} /></DialogContent>
        </Dialog>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className={cn("grid w-full", isAdmin ? "grid-cols-4" : "grid-cols-2")}>
          {isAdmin && <TabsTrigger value="meus_lancamentos">Meus Lançamentos</TabsTrigger>}
          {isAdmin && <TabsTrigger value="supervisao">Supervisão</TabsTrigger>}
          <TabsTrigger value="lancamentos">Lançamentos (Sintético)</TabsTrigger>
          <TabsTrigger value="parcelas">Todas as Parcelas (Analítico)</TabsTrigger>
        </TabsList>
        
        {/* ABA DE SUPERVISÃO (APENAS ADMIN) */}
        {isAdmin && activeTab === 'supervisao' && (
            <div className="p-4 bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-500 rounded-md mt-4">
                <p className="text-sm text-yellow-700 dark:text-yellow-300 font-semibold">
                    Modo Supervisão: Visualizando lançamentos de todas as empresas clientes.
                </p>
            </div>
        )}
        
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
                    {isAdmin && activeTab === 'supervisao' && <TableHead>Empresa</TableHead>}
                    <TableHead>Cliente</TableHead><TableHead>Descrição</TableHead><TableHead className="text-center">Nº Parcela</TableHead><TableHead>Vencimento</TableHead><TableHead>Valor da Parcela</TableHead><TableHead>Valor Pago</TableHead><TableHead>Status</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {parcelasFiltradas.length > 0 ? (
                      parcelasFiltradas.map((p) => {
                        // Determina o nome do cliente e a descrição com base na aba ativa (Admin vs Cliente)
                        const isMyLaunch = isAdmin && activeTab === 'meus_lancamentos';
                        
                        const contaReceber = isMyLaunch 
                            ? (p as any).admin_contas_receber 
                            : (p as any).contas_receber;
                            
                        const clienteId = isMyLaunch ? contaReceber?.cliente_id : contaReceber?.clientes?.id;
                        const clienteNome = isMyLaunch ? clienteNomeMap[clienteId] || 'N/A' : contaReceber?.clientes?.nome || 'N/A';
                        const descricao = contaReceber?.descricao || 'N/A';
                            
                        const empresaIdDisplay = isAdmin && activeTab === 'supervisao' 
                            ? (p as any).contas_receber?.empresa_id || 'N/A'
                            : (p as any).admin_contas_receber?.admin_id || 'N/A';

                        return (
                          <TableRow key={p.id}>
                            {isAdmin && activeTab === 'supervisao' && <TableCell className="text-sm text-muted-foreground">{empresaIdDisplay}</TableCell>}
                            <TableCell>{clienteNome}</TableCell>
                            <TableCell>{descricao}</TableCell>
                            <TableCell className="text-center">{p.numero_parcela}</TableCell>
                            <TableCell>{formatDate(p.data_vencimento)}</TableCell>
                            <TableCell>{formatCurrency(p.valor_parcela)}</TableCell>
                            <TableCell className="font-medium">{formatCurrency(p.valor_pago || 0)}</TableCell>
                            <TableCell><Badge variant={getBadgeVariant(p.status, p.data_vencimento)}>{p.status}</Badge></TableCell>
                          </TableRow>
                        );
                      })
                    ) : (
                      <TableRow>
                        <TableCell colSpan={isAdmin && activeTab === 'supervisao' ? 8 : 7} className="text-center h-24">
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
        <TabsContent value="lancamentos">
          <Card>
            <CardHeader><CardTitle>Resumo dos Lançamentos</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-left">Ações</TableHead> 
                      {isAdmin && activeTab === 'supervisao' && <TableHead>Empresa</TableHead>}
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

                      // Se estiver em modo supervisão, o Admin não pode editar/deletar
                      const canEditOrDelete = !isAdmin || activeTab === 'meus_lancamentos';
                      
                      // Lógica de exibição do nome do cliente
                      let clienteNomeDisplay = 'N/A';
                      if (isAdmin && activeTab === 'meus_lancamentos') {
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
                              {!canEditOrDelete && (
                                <Button variant="ghost" size="icon" disabled title="Apenas visualização"><Eye className="h-4 w-4 text-muted-foreground" /></Button>
                              )}
                            </div>
                          </TableCell>
                          
                          {isAdmin && activeTab === 'supervisao' && <TableCell className="text-sm text-muted-foreground">{(conta as any).empresa_id || 'N/A'}</TableCell>}
                          
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
        
        {/* Abas vazias para Admin, para manter a estrutura de 4 abas */}
        {isAdmin && <TabsContent value="meus_lancamentos" className="hidden"></TabsContent>}
        {isAdmin && <TabsContent value="supervisao" className="hidden"></TabsContent>}
      </Tabs>

      <DetalhesParcelasDialog
        conta={contaSelecionada}
        open={dialogParcelasAberto}
        onOpenChange={setDialogParcelasAberto}
        onDataChange={buscarDados}
      />
    </LayoutPrincipal>
  );
};

export default ContasReceber;