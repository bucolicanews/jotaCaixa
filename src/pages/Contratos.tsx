import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlusCircle, FileSignature, Loader2, Tag, FileTextIcon, Eye } from 'lucide-react';
import { useSessao } from '@/hooks/use-sessao';
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { ContratoGerado } from '@/types/contratos';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import ContratoAcoesDialog from '@/components/ContratoAcoesDialog';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

const Contratos = () => {
  const { role, perfil, usuario, carregando: carregandoSessao } = useSessao();
  const [contratos, setContratos] = useState<ContratoGerado[]>([]);
  const [carregandoContratos, setCarregandoContratos] = useState(true);
  const [contratoSelecionado, setContratoSelecionado] = useState<ContratoGerado | null>(null);
  const [acoesDialogOpen, setAcoesDialogOpen] = useState(false);

  const canManageModels = role === 'Admin' || role === 'Cliente';
  const canCreateContract = role === 'Admin' || role === 'Cliente';
  
  const isAdmin = role === 'Admin';
  const isCliente = role === 'Cliente';
  
  const getOwnerId = () => {
    if (isAdmin) return usuario?.id || null; // Admin usa seu próprio ID
    if (isCliente) return (perfil as ClienteProfile)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id;
    return null;
  };
  
  const empresaId = getOwnerId();
  
  const [activeContratoTab, setActiveContratoTab] = useState(isAdmin ? 'meus_contratos' : 'pendentes');

  const buscarMeusContratos = useCallback(async () => {
    setCarregandoContratos(true);
    
    let query = supabase
      .from('contratos_gerados')
      .select('*, clientes(nome)')
      .order('criado_em', { ascending: false });
      
    if (empresaId) {
        // Admin/Cliente/Usuário: Busca onde empresa_id é o ID do proprietário
        query = query.eq('empresa_id', empresaId);
    } else {
        setContratos([]);
        setCarregandoContratos(false);
        return;
    }

    const { data, error } = await query;

    if (error) {
      showError('Erro ao carregar contratos: ' + error.message);
      setContratos([]);
    } else {
      setContratos(data as any[]);
    }
    setCarregandoContratos(false);
  }, [empresaId]);
  
  const buscarSupervisao = useCallback(async () => {
    if (!isAdmin || !empresaId) return;
    setCarregandoContratos(true);
    
    // Supervisão: Busca todos os contratos onde empresa_id NÃO é o ID do Admin
    const { data, error } = await supabase
      .from('contratos_gerados')
      .select('*, clientes(nome)')
      .not('empresa_id', 'eq', empresaId)
      .order('criado_em', { ascending: false });

    if (error) {
      showError('Erro ao carregar contratos de supervisão: ' + error.message);
      setContratos([]);
    } else {
      setContratos(data as any[]);
    }
    setCarregandoContratos(false);
  }, [isAdmin, empresaId]);

  const buscarDados = useCallback(() => {
    if (!carregandoSessao && (isAdmin || empresaId)) {
        if (isAdmin && activeContratoTab === 'supervisao') {
            buscarSupervisao();
        } else {
            buscarMeusContratos();
        }
    }
  }, [carregandoSessao, isAdmin, empresaId, activeContratoTab, buscarMeusContratos, buscarSupervisao]);

  useEffect(() => {
    buscarDados();
  }, [buscarDados]);
  
  const handleOpenAcoes = (contrato: ContratoGerado) => {
      setContratoSelecionado(contrato);
      setAcoesDialogOpen(true);
  };
  
  const getStatusBadge = (status: ContratoGerado['status']) => {
      switch (status) {
          case 'pendente_assinatura': return <Badge variant="warning">Pendente Assinatura</Badge>;
          case 'ativo': return <Badge variant="default">Ativo</Badge>;
          case 'cancelado': return <Badge variant="destructive">Cancelado</Badge>;
          case 'concluido': return <Badge variant="success">Concluído</Badge>;
          case 'rascunho': return <Badge variant="secondary">Rascunho</Badge>;
          default: return <Badge variant="secondary">{status}</Badge>;
      }
  };

  const contratosPendentes = contratos.filter(c => c.status === 'pendente_assinatura');
  const contratosAtivos = contratos.filter(c => c.status === 'ativo' || c.status === 'concluido');

  if (carregandoSessao || carregandoContratos) {
    return <LayoutPrincipal><div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></LayoutPrincipal>;
  }

  return (
    <LayoutPrincipal>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl md:text-3xl font-bold flex items-center">
          <FileSignature className="w-6 h-6 mr-2" /> Gerenciamento de Contratos
        </h1>
        <div className="flex space-x-2 w-full sm:w-auto">
            <Link to="/contratos/novo">
                <Button className="w-full sm:w-auto" disabled={!canCreateContract || (isAdmin && activeContratoTab === 'supervisao')}>
                    <PlusCircle className="w-4 h-4 mr-2" />
                    Novo Contrato
                </Button>
            </Link>
        </div>
      </div>

      <Tabs value={activeContratoTab} onValueChange={setActiveContratoTab} className="w-full">
        <TabsList className={cn("grid w-full", isAdmin ? "grid-cols-4" : "grid-cols-3")}>
          {isAdmin && <TabsTrigger value="meus_contratos">Meus Contratos</TabsTrigger>}
          {isAdmin && <TabsTrigger value="supervisao">Supervisão</TabsTrigger>}
          <TabsTrigger value="pendentes">Pendentes ({contratosPendentes.length})</TabsTrigger>
          <TabsTrigger value="gerados">Ativos ({contratosAtivos.length})</TabsTrigger>
          {canManageModels && <TabsTrigger value="modelos">Modelos/Tags</TabsTrigger>}
        </TabsList>
        
        {/* ABA DE SUPERVISÃO (APENAS ADMIN) */}
        {isAdmin && activeContratoTab === 'supervisao' && (
            <div className="p-4 bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-500 rounded-md mt-4">
                <p className="text-sm text-yellow-700 dark:text-yellow-300 font-semibold">
                    Modo Supervisão: Visualizando contratos de todas as empresas clientes.
                </p>
            </div>
        )}
        
        {/* ABA DE CONTRATOS PENDENTES */}
        <TabsContent value="pendentes" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-xl">Contratos Pendentes de Assinatura</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    {isAdmin && activeContratoTab === 'supervisao' && <TableHead>Empresa</TableHead>}
                    <TableHead>Cliente</TableHead><TableHead>Valor</TableHead><TableHead>Data Criação</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {contratosPendentes.length === 0 ? (
                      <TableRow><TableCell colSpan={isAdmin && activeContratoTab === 'supervisao' ? 6 : 5} className="text-center py-4 text-muted-foreground">Nenhum contrato pendente de assinatura.</TableCell></TableRow>
                    ) : (
                      contratosPendentes.map(c => (
                        <TableRow key={c.id}>
                          {isAdmin && activeContratoTab === 'supervisao' && <TableCell className="text-sm text-muted-foreground">{(c as any).empresa_id || 'Admin'}</TableCell>}
                          <TableCell className="font-medium">{(c as any).clientes?.nome || 'N/A'}</TableCell>
                          <TableCell>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c.valor_total)}</TableCell>
                          <TableCell>{format(parseISO(c.criado_em), 'dd/MM/yyyy')}</TableCell>
                          <TableCell>{getStatusBadge(c.status)}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => handleOpenAcoes(c)}>
                                <Eye className="w-4 h-4 mr-2" /> Ver Ações
                            </Button>
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
        
        {/* ABA DE CONTRATOS ATIVOS */}
        <TabsContent value="gerados" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-xl">Contratos Ativos e Concluídos</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    {isAdmin && activeContratoTab === 'supervisao' && <TableHead>Empresa</TableHead>}
                    <TableHead>Cliente</TableHead><TableHead>Valor</TableHead><TableHead>Data Início</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {contratosAtivos.length === 0 ? (
                      <TableRow><TableCell colSpan={isAdmin && activeContratoTab === 'supervisao' ? 6 : 5} className="text-center py-4 text-muted-foreground">Nenhum contrato ativo ou concluído.</TableCell></TableRow>
                    ) : (
                      contratosAtivos.map(c => (
                        <TableRow key={c.id}>
                          {isAdmin && activeContratoTab === 'supervisao' && <TableCell className="text-sm text-muted-foreground">{(c as any).empresa_id || 'Admin'}</TableCell>}
                          <TableCell className="font-medium">{(c as any).clientes?.nome || 'N/A'}</TableCell>
                          <TableCell>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c.valor_total)}</TableCell>
                          <TableCell>{format(parseISO(c.data_inicio), 'dd/MM/yyyy')}</TableCell>
                          <TableCell>{getStatusBadge(c.status)}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => handleOpenAcoes(c)}>
                                <Eye className="w-4 h-4 mr-2" /> Ver Detalhes
                            </Button>
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
        
        {/* ABA DE MODELOS E TAGS */}
        {canManageModels && (
            <TabsContent value="modelos" className="mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Link to="/contratos/tags">
                        <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-lg font-medium">Gerenciar Tags</CardTitle>
                                <Tag className="h-5 w-5 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-muted-foreground">Crie e edite tags dinâmicas para seus contratos.</p>
                            </CardContent>
                        </Card>
                    </Link>
                    <Link to="/contratos/modelos">
                        <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-lg font-medium">Gerenciar Modelos</CardTitle>
                                <FileTextIcon className="h-5 w-5 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-muted-foreground">Crie e edite templates de contrato.</p>
                            </CardContent>
                        </Card>
                    </Link>
                </div>
            </TabsContent>
        )}
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