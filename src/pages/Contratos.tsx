import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlusCircle, FileSignature, Loader2, Eye, Edit, Trash2, Search, Filter, Lock, Unlock } from 'lucide-react';
import { useSessao } from '@/hooks/use-sessao';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { ContratoGerado } from '@/types/contratos';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import ContratoAcoesDialog from '@/components/ContratoAcoesDialog';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { useDebounce } from '@/hooks/use-debounce';

const Contratos = () => {
  const { role, perfil, usuario, carregando: carregandoSessao } = useSessao();
  const navigate = useNavigate();
  const location = useLocation(); // Adicionando useLocation
  const [contratos, setContratos] = useState<ContratoGerado[]>([]);
  const [carregandoContratos, setCarregandoContratos] = useState(true);
  const [contratoSelecionado, setContratoSelecionado] = useState<ContratoGerado | null>(null);
  const [acoesDialogOpen, setAcoesDialogOpen] = useState(false);
  
  // Filtro de Busca
  const [filtroTexto, setFiltroTexto] = useState('');
  const filtroTextoDebounced = useDebounce(filtroTexto, 500);

  const canCreateContract = role === 'Admin' || role === 'Cliente';
  
  const isAdmin = role === 'Admin';
  const isCliente = role === 'Cliente';
  
  // ID do proprietário (Admin ou Cliente)
  const getEmpresaId = () => {
    if (isAdmin) return usuario?.id || null;
    if (isCliente) return (perfil as ClienteProfile)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id;
    return null;
  };
  
  const empresaId = getEmpresaId();
  
  const [activeContratoTab, setActiveContratoTab] = useState(isAdmin ? 'meus_contratos' : 'pendentes');

  const buscarContratos = useCallback(async () => {
    if (!empresaId && !isAdmin) {
        setContratos([]);
        setCarregandoContratos(false);
        return;
    }
    
    setCarregandoContratos(true);
    
    let query = supabase
      .from('contratos_gerados')
      .select('*, clientes(nome)')
      .order('criado_em', { ascending: false });
      
    // Se for Cliente/Usuário, filtra apenas pelos seus contratos
    if (!isAdmin && empresaId) {
        query = query.eq('empresa_id', empresaId);
    }
    // Se for Admin, a RLS já garante que ele veja todos os contratos (seus e dos clientes)

    const { data, error } = await query;

    if (error) {
      showError('Erro ao carregar contratos: ' + error.message);
      setContratos([]);
    } else {
      setContratos(data as any[]);
    }
    setCarregandoContratos(false);
  }, [empresaId, isAdmin]);

  useEffect(() => {
    // Adicionando location.key como dependência para forçar a re-execução
    if (!carregandoSessao && (isAdmin || empresaId)) {
        buscarContratos();
    }
  }, [carregandoSessao, isAdmin, empresaId, buscarContratos, location.key]); // Adicionado location.key
  
  const handleOpenAcoes = (contrato: ContratoGerado) => {
      setContratoSelecionado(contrato);
      setAcoesDialogOpen(true);
  };
  
  const handleEditContract = (contrato: ContratoGerado) => {
      // Redireciona para a página de preenchimento, passando o ID do modelo e o ID do contrato para edição
      navigate(`/contratos/preencher/${contrato.modelo_id}?contratoId=${contrato.id}`);
  };
  
  const handleDeleteContract = async (contrato: ContratoGerado) => {
    if (!window.confirm('Tem certeza que deseja excluir este contrato? Isso também excluirá as contas a receber geradas. Esta ação é irreversível.')) return;

    setCarregandoContratos(true);
    
    try {
        // 1. Determinar as tabelas de CR
        const isContractOwnerAdmin = isAdmin && contrato.empresa_id === empresaId;
        const tabelaContasReceber = isContractOwnerAdmin ? 'admin_contas_receber' : 'contas_receber';
        
        // 2. Buscar e deletar a Conta a Receber Sintética associada
        const { data: contaReceber, error: fetchError } = await supabase
            .from(tabelaContasReceber)
            .select('id')
            .eq('contrato_gerado_id', contrato.id)
            .limit(1)
            .single();
            
        if (fetchError && fetchError.code !== 'PGRST116') {
            throw new Error('Erro ao buscar conta a receber associada: ' + fetchError.message);
        }
        
        if (contaReceber) {
            // Deletar a conta sintética (deve cascatear para as parcelas)
            const { error: deleteCR } = await supabase
                .from(tabelaContasReceber)
                .delete()
                .eq('id', contaReceber.id);
            if (deleteCR) throw deleteCR;
        }
        
        // 3. Deletar o Contrato Gerado
        const { error: deleteContrato } = await supabase
            .from('contratos_gerados')
            .delete()
            .eq('id', contrato.id);
            
        if (deleteContrato) throw deleteContrato;

        showSuccess('Contrato e contas a receber associadas excluídos com sucesso.');
        buscarContratos(); // Re-fetch the list
    } catch (error: any) {
        console.error('Erro ao deletar contrato:', error);
        showError('Falha ao excluir contrato: ' + error.message);
    } finally {
        setCarregandoContratos(false);
    }
  };
  
  const handleBlockContract = async (contrato: ContratoGerado) => {
    if (!window.confirm(`Tem certeza que deseja BLOQUEAR o contrato ${contrato.id}? Esta ação irá marcar o contrato como 'bloqueado' e cancelar todas as parcelas pendentes associadas.`)) return;

    setCarregandoContratos(true);
    
    try {
        // 1. Bloquear parcelas pendentes (RPC cancel_contract_installments agora define o status do contrato como 'bloqueado')
        const { error: rpcError } = await supabase.rpc('cancel_contract_installments', {
            p_contrato_id: contrato.id,
            p_motivo: 'Contrato Bloqueado',
        });
        
        if (rpcError) throw rpcError;
        
        showSuccess('Contrato bloqueado e parcelas canceladas com sucesso.');
        buscarContratos();
    } catch (error: any) {
        console.error('Erro ao bloquear contrato:', error);
        showError('Falha ao bloquear contrato: ' + error.message);
    } finally {
        setCarregandoContratos(false);
    }
  };
  
  const handleReactivateContract = async (contrato: ContratoGerado) => {
    if (!window.confirm(`Tem certeza que deseja DESBLOQUEAR o contrato ${contrato.id}? Isso irá reativar o status do contrato e reabrir as parcelas que foram canceladas devido ao bloqueio.`)) return;

    setCarregandoContratos(true);
    
    try {
        // 1. Reativar parcelas pendentes
        const { error: rpcError } = await supabase.rpc('reactivate_contract_installments', {
            p_contrato_id: contrato.id,
        });
        
        if (rpcError) throw rpcError;
        
        showSuccess('Contrato desbloqueado e parcelas reativadas com sucesso.');
        buscarContratos();
    } catch (error: any) {
        console.error('Erro ao desbloquear contrato:', error);
        showError('Falha ao desbloquear contrato: ' + error.message);
    } finally {
        setCarregandoContratos(false);
    }
  };
  
  const getStatusBadge = (status: ContratoGerado['status']) => {
      switch (status) {
          case 'pendente_assinatura': return <Badge variant="warning">Pendente Assinatura</Badge>;
          case 'ativo': return <Badge variant="default">Ativo</Badge>;
          case 'cancelado': return <Badge variant="destructive">Cancelado</Badge>;
          case 'bloqueado': return <Badge variant="destructive">Bloqueado</Badge>;
          case 'concluido': return <Badge variant="success">Concluído</Badge>;
          case 'rascunho': return <Badge variant="secondary">Rascunho</Badge>;
          default: return <Badge variant="secondary">{status}</Badge>;
      }
  };
  
  // --- Lógica de Filtragem e Agrupamento ---
  const contratosFiltrados = useMemo(() => {
      const termoBusca = filtroTextoDebounced.toLowerCase();
      
      const filteredBySearch = contratos.filter(c => {
          const clienteNome = (c as any).clientes?.nome || '';
          return c.conteudo_renderizado?.toLowerCase().includes(termoBusca) ||
                 clienteNome.toLowerCase().includes(termoBusca) ||
                 c.id.toLowerCase().includes(termoBusca);
      });
      
      const meusContratos = filteredBySearch.filter(c => c.empresa_id === empresaId);
      const contratosClientes = filteredBySearch.filter(c => c.empresa_id !== empresaId);
      
      const pendentes = meusContratos.filter(c => c.status === 'pendente_assinatura' || c.status === 'rascunho');
      const ativos = meusContratos.filter(c => c.status === 'ativo' || c.status === 'concluido');
      const inativos = meusContratos.filter(c => c.status === 'cancelado' || c.status === 'bloqueado'); // Inclui 'bloqueado'
      
      return { meusContratos, contratosClientes, pendentes, ativos, inativos };
  }, [contratos, empresaId, filtroTextoDebounced]);
  
  const contratosParaExibir = useMemo(() => {
      if (isAdmin) {
          switch (activeContratoTab) {
              case 'meus_contratos': return contratosFiltrados.meusContratos;
              case 'contratos_clientes': return contratosFiltrados.contratosClientes;
              case 'pendentes': return contratosFiltrados.pendentes;
              case 'ativos': return contratosFiltrados.ativos;
              case 'inativos': return contratosFiltrados.inativos;
              default: return [];
          }
      } else {
          // Cliente/Usuário
          switch (activeContratoTab) {
              case 'pendentes': return contratosFiltrados.pendentes;
              case 'ativos': return contratosFiltrados.ativos;
              case 'inativos': return contratosFiltrados.inativos;
              default: return [];
          }
      }
  }, [activeContratoTab, isAdmin, contratosFiltrados]);


  if (carregandoSessao || carregandoContratos) {
    return <LayoutPrincipal><div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></LayoutPrincipal>;
  }

  // Helper para renderizar a tabela
  const renderContratosTable = (list: ContratoGerado[], isSupervisao: boolean) => (
    <div className="overflow-x-auto">
        <Table>
            <TableHeader><TableRow>
                {isSupervisao && <TableHead>Empresa</TableHead>}
                <TableHead>Cliente</TableHead><TableHead>Valor</TableHead><TableHead>Data Início</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead>
            </TableRow></TableHeader>
            <TableBody>
                {list.length === 0 ? (
                    <TableRow><TableCell colSpan={isSupervisao ? 6 : 5} className="text-center py-4 text-muted-foreground">Nenhum contrato encontrado.</TableCell></TableRow>
                ) : (
                    list.map(c => {
                        const canEdit = c.status === 'rascunho' || c.status === 'pendente_assinatura';
                        const isMyContract = c.empresa_id === empresaId;
                        const isCanceledOrBlocked = c.status === 'cancelado' || c.status === 'bloqueado';
                        
                        return (
                            <TableRow key={c.id}>
                                {isSupervisao && <TableCell className="text-sm text-muted-foreground">{(c as any).clientes?.nome || 'N/A'}</TableCell>}
                                <TableCell className="font-medium">{(c as any).clientes?.nome || 'N/A'}</TableCell>
                                <TableCell>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c.valor_total)}</TableCell>
                                <TableCell>{format(parseISO(c.data_inicio), 'dd/MM/yyyy')}</TableCell>
                                <TableCell>{getStatusBadge(c.status)}</TableCell>
                                <TableCell className="text-right">
                                    <div className="flex justify-end space-x-2">
                                        {canEdit && isMyContract && (
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                onClick={() => handleEditContract(c)}
                                                title="Editar Contrato"
                                            >
                                                <Edit className="w-4 h-4" />
                                            </Button>
                                        )}
                                        
                                        {/* Botão de Bloqueio/Desbloqueio */}
                                        {isMyContract && (
                                            isCanceledOrBlocked ? (
                                                <Button 
                                                    variant="default" 
                                                    size="icon" 
                                                    onClick={() => handleReactivateContract(c)}
                                                    title="Desbloquear Contrato (Reativa Parcelas)"
                                                >
                                                    <Unlock className="w-4 h-4" />
                                                </Button>
                                            ) : (
                                                <Button 
                                                    variant="destructive" 
                                                    size="icon" 
                                                    onClick={() => handleBlockContract(c)}
                                                    title="Bloquear Contrato (Cancela Parcelas)"
                                                >
                                                    <Lock className="w-4 h-4" />
                                                </Button>
                                            )
                                        )}
                                        
                                        {/* Botão de Excluir (Aparece se for rascunho ou cancelado/bloqueado) */}
                                        {(canEdit || isCanceledOrBlocked) && isMyContract && (
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                onClick={() => handleDeleteContract(c)}
                                                title="Excluir Contrato"
                                            >
                                                <Trash2 className="w-4 h-4 text-red-500" />
                                            </Button>
                                        )}
                                        
                                        <Button variant="outline" size="sm" onClick={() => handleOpenAcoes(c)}>
                                            <Eye className="w-4 h-4 mr-2" /> Ver Ações
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        );
                    })
                )}
            </TableBody>
        </Table>
    </div>
  );

  return (
    <LayoutPrincipal>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl md:text-3xl font-bold flex items-center">
          <FileSignature className="w-6 h-6 mr-2" /> Gerenciamento de Contratos
        </h1>
        <div className="flex space-x-2 w-full sm:w-auto">
            <Link to="/contratos/novo">
                <Button className="w-full sm:w-auto" disabled={!canCreateContract || (isAdmin && activeContratoTab === 'contratos_clientes')}>
                    <PlusCircle className="w-4 h-4 mr-2" />
                    Novo Contrato
                </Button>
            </Link>
        </div>
      </div>
      
      <Card className="mb-6">
        <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center"><Filter className="w-4 h-4 mr-2" /> Filtros</CardTitle>
        </CardHeader>
        <CardContent>
            <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Buscar por cliente, conteúdo ou ID do contrato..."
                    value={filtroTexto}
                    onChange={(e) => setFiltroTexto(e.target.value)}
                    className="pl-10"
                />
            </div>
        </CardContent>
      </Card>

      <Tabs value={activeContratoTab} onValueChange={setActiveContratoTab} className="w-full">
        <TabsList className={cn("grid w-full", isAdmin ? "grid-cols-5" : "grid-cols-3")}>
          {isAdmin && <TabsTrigger value="meus_contratos">Meus Contratos ({contratosFiltrados.meusContratos.length})</TabsTrigger>}
          {isAdmin && <TabsTrigger value="contratos_clientes">Clientes ({contratosFiltrados.contratosClientes.length})</TabsTrigger>}
          <TabsTrigger value="pendentes">Pendentes ({contratosFiltrados.pendentes.length})</TabsTrigger>
          <TabsTrigger value="ativos">Ativos ({contratosFiltrados.ativos.length})</TabsTrigger>
          <TabsTrigger value="inativos">Inativos ({contratosFiltrados.inativos.length})</TabsTrigger>
        </TabsList>
        
        {/* ABA DE CONTRATOS DE CLIENTES (APENAS ADMIN) */}
        {isAdmin && activeContratoTab === 'contratos_clientes' && (
            <div className="p-4 bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-500 rounded-md mt-4">
                <p className="text-sm text-yellow-700 dark:text-yellow-300 font-semibold">
                    Modo Supervisão: Visualizando contratos de todas as empresas clientes.
                </p>
            </div>
        )}
        
        {/* ABA MEUS CONTRATOS (APENAS ADMIN) */}
        {isAdmin && activeContratoTab === 'meus_contratos' && (
            <TabsContent value="meus_contratos" className="mt-4">
                <Card>
                    <CardHeader><CardTitle className="text-xl">Meus Contratos (Admin)</CardTitle></CardHeader>
                    <CardContent>
                        {renderContratosTable(contratosParaExibir, false)}
                    </CardContent>
                </Card>
            </TabsContent>
        )}
        
        {/* ABA CONTRATOS DE CLIENTES (APENAS ADMIN) */}
        {isAdmin && activeContratoTab === 'contratos_clientes' && (
            <TabsContent value="contratos_clientes" className="mt-4">
                <Card>
                    <CardHeader><CardTitle className="text-xl">Contratos dos Clientes (Supervisão)</CardTitle></CardHeader>
                    <CardContent>
                        {renderContratosTable(contratosParaExibir, true)}
                    </CardContent>
                </Card>
            </TabsContent>
        )}
        
        {/* ABA DE CONTRATOS PENDENTES */}
        <TabsContent value="pendentes" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-xl">Contratos Pendentes de Assinatura/Rascunho</CardTitle></CardHeader>
            <CardContent>
              {renderContratosTable(contratosParaExibir, isAdmin && activeContratoTab === 'contratos_clientes')}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* ABA DE CONTRATOS ATIVOS */}
        <TabsContent value="ativos" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-xl">Contratos Ativos e Concluídos</CardTitle></CardHeader>
            <CardContent>
              {renderContratosTable(contratosParaExibir, isAdmin && activeContratoTab === 'contratos_clientes')}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* ABA DE CONTRATOS INATIVOS/CANCELADOS */}
        <TabsContent value="inativos" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-xl">Contratos Inativos ou Bloqueados</CardTitle></CardHeader>
            <CardContent>
              {renderContratosTable(contratosParaExibir, isAdmin && activeContratoTab === 'contratos_clientes')}
            </CardContent>
          </Card>
        </TabsContent>
        
      </Tabs>
      
      <ContratoAcoesDialog
        contrato={contratoSelecionado}
        open={acoesDialogOpen}
        onOpenChange={setAcoesDialogOpen}
      />
    </LayoutPrincipal>
  );
};

export default Contratos;