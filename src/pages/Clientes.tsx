import { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Edit, Trash2, PlusCircle, Filter, Building2, CheckCircle, Users as UsersIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { Cliente } from '@/types/cliente';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import FormCliente from '@/components/FormCliente';
import { AnyProfile, UsuarioProfile, ClienteProfile } from '@/types/usuario';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import FormUsuario from '@/components/FormUsuario'; // Importando FormUsuario

// Tipo para o filtro de empresa (inclui o Admin)
interface EmpresaFiltro {
    id: string;
    nome: string;
}

// Tipo para as empresas do sistema (tbl_clientes)
interface EmpresaSistema extends ClienteProfile {
    id: string;
    nome: string;
    aprovado: boolean;
    email: string;
}

const ClientesPage = () => {
  const { usuario, perfil, role, carregando: carregandoSessao } = useSessao();
  const [clientesCR, setClientesCR] = useState<Cliente[]>([]); // Clientes de Contas a Receber
  const [empresasSistema, setEmpresasSistema] = useState<EmpresaSistema[]>([]); // Empresas do sistema (tbl_clientes)
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [perfilParaEditar, setPerfilParaEditar] = useState<AnyProfile | null>(null); // Declarando estado
  
  // Filtros para Admin
  const [empresasFiltro, setEmpresasFiltro] = useState<EmpresaFiltro[]>([]);
  const [filtroEmpresaId, setFiltroEmpresaId] = useState('todos');
  const [filtroNome, setFiltroNome] = useState('');
  
  const [activeTab, setActiveTab] = useState('clientes_cr');

  const isAdmin = role === 'Admin';
  // const isCliente = role === 'Cliente'; // Removido, pois não é usado

  const getOwnerId = () => {
    if (role === 'Admin') return usuario?.id || null; // Admin usa seu próprio ID
    if (role === 'Cliente') return (perfil as ClienteProfile)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id;
    return null;
  };
  
  const ownerId = getOwnerId();

  const fetchEmpresasFiltro = useCallback(async () => {
    if (!isAdmin || !usuario?.id) return;
    
    const { data, error } = await supabase
        .from('tbl_clientes')
        .select('id, nome')
        .eq('aprovado', true)
        .order('nome');

    if (error) {
        showError('Erro ao carregar lista de empresas: ' + error.message);
        setEmpresasFiltro([]);
    } else {
        const clientData = data as EmpresaFiltro[];
        
        // Adiciona a opção para os próprios clientes do Admin
        const adminOption: EmpresaFiltro = { id: usuario.id, nome: 'Meus Clientes (CR)' };
        const allClients = [adminOption, ...clientData];
        
        setEmpresasFiltro(allClients);
    }
  }, [isAdmin, usuario?.id]);

  const buscarDados = useCallback(async () => {
    setCarregandoDados(true);
    
    // 1. Buscar Clientes de Contas a Receber (clientes)
    let queryCR = supabase
      .from('clientes')
      .select('*')
      .order('nome', { ascending: true });

    if (isAdmin) {
        if (filtroEmpresaId !== 'todos') {
            queryCR = queryCR.eq('empresa_id', filtroEmpresaId);
        }
    } else if (ownerId) {
        queryCR = queryCR.eq('empresa_id', ownerId);
    } else {
        setClientesCR([]);
    }

    const { data: dataCR, error: errorCR } = await queryCR;

    if (errorCR) {
      showError('Erro ao carregar clientes CR: ' + errorCR.message);
      setClientesCR([]);
    } else {
      const filteredData = (dataCR as Cliente[]).filter(c => 
        c.nome.toLowerCase().includes(filtroNome.toLowerCase()) ||
        (c.razao_social?.toLowerCase() || '').includes(filtroNome.toLowerCase()) ||
        (c.documento?.toLowerCase() || '').includes(filtroNome.toLowerCase())
      );
      setClientesCR(filteredData);
    }
    
    // 2. Buscar Empresas do Sistema (tbl_clientes) - Apenas Admin
    if (isAdmin) {
        const { data: dataEmpresas, error: errorEmpresas } = await supabase
            .from('tbl_clientes')
            .select('*')
            .order('nome', { ascending: true });
            
        if (errorEmpresas) {
            showError('Erro ao carregar empresas do sistema: ' + errorEmpresas.message);
            setEmpresasSistema([]);
        } else {
            const filteredEmpresas = (dataEmpresas as EmpresaSistema[]).filter(e => 
                e.nome.toLowerCase().includes(filtroNome.toLowerCase()) ||
                e.email.toLowerCase().includes(filtroNome.toLowerCase())
            );
            setEmpresasSistema(filteredEmpresas);
        }
    }

    setCarregandoDados(false);
  }, [isAdmin, ownerId, filtroEmpresaId, filtroNome]);

  useEffect(() => {
    if (!carregandoSessao && usuario) {
      if (isAdmin) {
        fetchEmpresasFiltro();
      }
      buscarDados();
    }
  }, [carregandoSessao, usuario, isAdmin, buscarDados, fetchEmpresasFiltro]);
  
  // Re-busca quando os filtros mudam
  useEffect(() => {
      if (!carregandoSessao && usuario) {
          buscarDados();
      }
  }, [filtroEmpresaId, filtroNome, buscarDados, carregandoSessao, usuario]);


  const handleSaveComplete = () => {
    setDialogAberto(false);
    setClienteSelecionado(null);
    setPerfilParaEditar(null); // Limpa o perfil de edição
    buscarDados();
  };

  const handleEditCR = (cliente: Cliente) => {
    setClienteSelecionado(cliente);
    setPerfilParaEditar(null); // Garante que o FormCliente seja usado
    setDialogAberto(true);
  };
  
  const handleEditEmpresaSistema = (empresa: EmpresaSistema) => {
    // Para editar a empresa do sistema, usamos o FormUsuario, pois ele lida com ClienteProfile
    setPerfilParaEditar(empresa);
    setClienteSelecionado(null); // Garante que o FormUsuario seja usado
    setDialogAberto(true);
  };

  const handleDeleteCR = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este cliente de Contas a Receber?')) return;

    const { error } = await supabase.from('clientes').delete().eq('id', id);

    if (error) {
      showError('Erro ao excluir cliente: ' + error.message);
    } else {
      showSuccess('Cliente excluído com sucesso.');
      buscarDados();
    }
  };
  
  const handleAprovarCliente = async (cliente: EmpresaSistema) => {
    if (!window.confirm(`Tem certeza que deseja aprovar a empresa ${cliente.nome}?`)) return;
    
    setCarregandoDados(true);
    const { error } = await supabase
        .from('tbl_clientes')
        .update({ aprovado: true })
        .eq('id', cliente.id);
        
    if (error) {
        showError('Erro ao aprovar cliente: ' + error.message);
    } else {
        showSuccess(`Empresa ${cliente.nome} aprovada com sucesso!`);
        buscarDados();
    }
  };
  
  const handleNewCR = () => {
      setClienteSelecionado(null);
      setPerfilParaEditar(null); // Garante que o FormCliente seja usado
      setDialogAberto(true);
  };
  
  // Renderização do conteúdo da tabela de Clientes CR
  const renderClientesCRTable = () => (
    <div className="overflow-x-auto">
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Nome Fantasia</TableHead>
                    <TableHead className="hidden md:table-cell">Razão Social</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Telefone</TableHead>
                    {isAdmin && <TableHead>Empresa ID</TableHead>}
                    <TableHead className="text-right">Ações</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {clientesCR.length === 0 ? (
                    <TableRow>
                        <TableCell colSpan={isAdmin ? 6 : 5} className="text-center py-4 text-muted-foreground">
                            Nenhum cliente de Contas a Receber cadastrado.
                        </TableCell>
                    </TableRow>
                ) : (
                    clientesCR.map((cliente) => (
                        <TableRow key={cliente.id}>
                            <TableCell className="font-medium">{cliente.nome_fantasia || cliente.nome}</TableCell>
                            <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{cliente.razao_social || '-'}</TableCell>
                            <TableCell>{cliente.email || '-'}</TableCell>
                            <TableCell>{cliente.telefone || '-'}</TableCell>
                            {isAdmin && <TableCell className="text-sm text-muted-foreground">{cliente.empresa_id || 'N/A'}</TableCell>}
                            <TableCell className="text-right">
                                <div className="flex justify-end space-x-1">
                                    <Button variant="ghost" size="sm" onClick={() => handleEditCR(cliente)}>
                                        <Edit className="w-4 h-4" />
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => handleDeleteCR(cliente.id)}>
                                        <Trash2 className="w-4 h-4 text-red-500" />
                                    </Button>
                                </div>
                            </TableCell>
                        </TableRow>
                    ))
                )}
            </TableBody>
        </Table>
    </div>
  );
  
  // Renderização do conteúdo da tabela de Empresas do Sistema
  const renderEmpresasSistemaTable = () => (
    <div className="overflow-x-auto">
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Nome da Empresa</TableHead>
                    <TableHead>Email (Login)</TableHead>
                    <TableHead>Limite Usuários</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {empresasSistema.length === 0 ? (
                    <TableRow>
                        <TableCell colSpan={5} className="text-center py-4 text-muted-foreground">
                            Nenhuma empresa cadastrada no sistema.
                        </TableCell>
                    </TableRow>
                ) : (
                    empresasSistema.map((empresa) => {
                        const isAprovado = empresa.aprovado;
                        return (
                            <TableRow key={empresa.id} className={cn(!isAprovado && "bg-yellow-500/10")}>
                                <TableCell className="font-medium">{empresa.nome}</TableCell>
                                <TableCell>{empresa.email}</TableCell>
                                <TableCell>{empresa.limite_usuarios}</TableCell>
                                <TableCell>
                                    <Badge variant={isAprovado ? 'default' : 'warning'}>
                                        {isAprovado ? 'Aprovado' : 'Pendente'}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right space-x-2 min-w-[150px]">
                                    {!isAprovado && (
                                        <Button 
                                            variant="default" 
                                            size="sm" 
                                            onClick={() => handleAprovarCliente(empresa)}
                                            className="h-8"
                                        >
                                            <CheckCircle className="h-4 w-4 mr-1" /> Aprovar
                                        </Button>
                                    )}
                                    <Button 
                                        variant="outline" 
                                        size="icon" 
                                        onClick={() => handleEditEmpresaSistema(empresa)}
                                    >
                                        <Edit className="h-4 w-4" />
                                    </Button>
                                    {/* Remoção de empresa do sistema é uma ação crítica, vamos simplificar para não permitir exclusão direta aqui */}
                                </TableCell>
                            </TableRow>
                        );
                    })
                )}
            </TableBody>
        </Table>
    </div>
  );


  if (carregandoSessao || carregandoDados) {
    return (
      <LayoutPrincipal>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </LayoutPrincipal>
    );
  }

  return (
    <LayoutPrincipal>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl md:text-3xl font-bold">Gerenciamento de Clientes</h1>
        
        {/* Botão de Novo Cliente (CR) ou Nova Empresa (Sistema) */}
        <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
          <DialogTrigger asChild>
            <Button onClick={handleNewCR} className="w-full sm:w-auto" disabled={isAdmin && activeTab === 'empresas_sistema'}>
              <PlusCircle className="w-4 h-4 mr-2" />
              Novo Cliente (CR)
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{clienteSelecionado ? 'Editar Cliente CR' : 'Novo Cliente CR'}</DialogTitle>
            </DialogHeader>
            <FormCliente 
              clienteInicial={clienteSelecionado}
              onSaveComplete={handleSaveComplete}
            />
          </DialogContent>
        </Dialog>
      </div>
      
      {isAdmin ? (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full mb-6">
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="clientes_cr" className="flex items-center"><UsersIcon className="w-4 h-4 mr-2" /> Clientes de Contas a Receber</TabsTrigger>
                <TabsTrigger value="empresas_sistema" className="flex items-center"><Building2 className="w-4 h-4 mr-2" /> Empresas do Sistema (tbl_clientes)</TabsTrigger>
            </TabsList>
            
            <TabsContent value="clientes_cr">
                <Card className="mt-4">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg flex items-center"><Filter className="w-4 h-4 mr-2" /> Filtros</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col md:flex-row gap-4">
                        <Input
                            placeholder="Buscar por nome, documento ou razão social..."
                            value={filtroNome}
                            onChange={(e) => setFiltroNome(e.target.value)}
                            className="w-full md:max-w-xs"
                        />
                        <Select value={filtroEmpresaId} onValueChange={setFiltroEmpresaId} disabled={empresasFiltro.length === 0}>
                            <SelectTrigger className="w-full md:w-[250px]">
                                <Building2 className="w-4 h-4 mr-2" />
                                <SelectValue placeholder="Filtrar por Empresa do Sistema" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="todos">Todos os Clientes CR</SelectItem>
                                {empresasFiltro.map(e => (
                                    <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </CardContent>
                </Card>
                <Card className="mt-4">
                    <CardHeader><CardTitle className="text-xl">Clientes CR Cadastrados ({clientesCR.length})</CardTitle></CardHeader>
                    <CardContent>{renderClientesCRTable()}</CardContent>
                </Card>
            </TabsContent>
            
            <TabsContent value="empresas_sistema">
                <Card className="mt-4">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg flex items-center"><Filter className="w-4 h-4 mr-2" /> Filtro</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col md:flex-row gap-4">
                        <Input
                            placeholder="Buscar por nome ou email da empresa..."
                            value={filtroNome}
                            onChange={(e) => setFiltroNome(e.target.value)}
                            className="w-full md:max-w-xs"
                        />
                    </CardContent>
                </Card>
                <Card className="mt-4">
                    <CardHeader><CardTitle className="text-xl">Empresas do Sistema ({empresasSistema.length})</CardTitle></CardHeader>
                    <CardContent>{renderEmpresasSistemaTable()}</CardContent>
                </Card>
            </TabsContent>
        </Tabs>
      ) : (
        // Cliente/Usuário (apenas Clientes CR)
        <Card>
            <CardHeader>
                <CardTitle className="text-xl">Clientes Cadastrados ({clientesCR.length})</CardTitle>
            </CardHeader>
            <CardContent>{renderClientesCRTable()}</CardContent>
        </Card>
      )}
      
      {/* Dialog para editar Empresa do Sistema (usa FormUsuario) */}
      <Dialog open={dialogAberto && !!perfilParaEditar} onOpenChange={setDialogAberto}>
          <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Editar Empresa do Sistema</DialogTitle>
            </DialogHeader>
            <FormUsuario 
              criadorRole={role}
              criadorPerfil={perfil}
              usuarioInicial={perfilParaEditar}
              onSaveComplete={handleSaveComplete}
            />
          </DialogContent>
        </Dialog>
    </LayoutPrincipal>
  );
};

export default ClientesPage;