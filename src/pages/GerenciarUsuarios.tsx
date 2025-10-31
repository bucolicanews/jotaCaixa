import React, { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { useSessao } from '@/hooks/use-sessao';
import { Loader2, Plus, Search, Trash2, Edit, Building2, Filter, CheckCircle, Users as UsersIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import FormUsuario from '@/components/FormUsuario';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { AnyProfile, UsuarioProfile, UserRole, ClienteProfile } from '@/types/usuario';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Tipagem para o perfil de usuário com nome da empresa
type UsuarioComEmpresa = UsuarioProfile & { nome_empresa?: string };

// Tipo para o filtro de empresa (inclui o Admin)
interface EmpresaFiltro {
    id: string;
    nome: string;
}

const GerenciarUsuarios: React.FC = () => {
  const { usuario, perfil, role, carregando } = useSessao();
  const [usuarios, setUsuarios] = useState<UsuarioComEmpresa[]>([]);
  const [clientes, setClientes] = useState<ClienteProfile[]>([]);
  const [empresasFiltro, setEmpresasFiltro] = useState<EmpresaFiltro[]>([]);
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [filtro, setFiltro] = useState('');
  const [filtroEmpresaId, setFiltroEmpresaId] = useState('todos');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [perfilParaEditar, setPerfilParaEditar] = useState<AnyProfile | null>(null);
  
  const [activeTab, setActiveTab] = useState('usuarios');

  const isAdmin = role === 'Admin';
  const isCliente = role === 'Cliente';

  // Efeito para definir a aba ativa inicial
  useEffect(() => {
      if (!carregando && isAdmin) {
          setActiveTab('clientes');
      } else if (!carregando && isCliente) {
          setActiveTab('meus_funcionarios'); // Cliente só tem uma aba de usuários
      }
  }, [carregando, isAdmin, isCliente]);


  const fetchDados = useCallback(async () => {
    if (!usuario || !role) {
        setCarregandoDados(false);
        return;
    }

    setCarregandoDados(true);
    
    let fetchedClientes: ClienteProfile[] = [];
    let fetchedUsuarios: UsuarioComEmpresa[] = [];

    if (isAdmin) {
      // ADMIN: Busca TODOS os Clientes (Empresas) do sistema
      const { data: clientesData, error: clientesError } = await supabase
        .from('tbl_clientes')
        .select('*')
        .order('nome', { ascending: true });

      if (clientesError) {
        showError('Erro ao carregar clientes: ' + clientesError.message);
        setClientes([]);
      } else {
        fetchedClientes = clientesData as ClienteProfile[];
        setClientes(fetchedClientes);
      }
      
      // Configura opções de filtro para o Admin
      const adminFilterOption: EmpresaFiltro = { id: usuario.id, nome: 'Meus Usuários (Admin)' };
      const clientFilterOptions: EmpresaFiltro[] = fetchedClientes.map(c => ({ id: c.id, nome: c.nome }));
      setEmpresasFiltro([adminFilterOption, ...clientFilterOptions]);
      
      // ADMIN: Busca TODOS os Usuários (Funcionários) do sistema
      const { data: usuariosData, error: usuariosError } = await supabase
        .from('tbl_usuarios')
        .select('*, tbl_clientes(nome)')
        .order('nome', { ascending: true });

      if (usuariosError) {
        showError('Erro ao carregar usuários: ' + usuariosError.message);
        setUsuarios([]);
      } else {
        fetchedUsuarios = (usuariosData as any[]).map(item => {
          const nomeEmpresa = item.tbl_clientes?.nome || (item.cliente_id === usuario.id ? 'Meus Usuários (Admin)' : 'N/A');
          return { ...item, nome_empresa: nomeEmpresa } as UsuarioComEmpresa;
        });
        
        // FILTRA O PRÓPRIO ADMIN DA LISTA DE USUÁRIOS (tbl_usuarios)
        const filteredUsers = fetchedUsuarios.filter(u => u.id !== usuario.id);
        setUsuarios(filteredUsers);
      }

    } else if (isCliente) {
      // CLIENTE: Busca APENAS seus próprios Usuários (Funcionários)
      const { data: usuariosData, error: usuariosError } = await supabase
        .from('tbl_usuarios')
        .select('*')
        .eq('cliente_id', usuario.id)
        .order('nome', { ascending: true });

      if (usuariosError) {
        showError('Erro ao carregar usuários: ' + usuariosError.message);
        setUsuarios([]);
      } else {
        setUsuarios(usuariosData as UsuarioComEmpresa[]);
      }
    }
    
    setCarregandoDados(false);
  }, [usuario, role, isAdmin, isCliente]);

  useEffect(() => {
    if (!carregando) {
        if (usuario) {
            fetchDados();
        } else {
            setCarregandoDados(false);
        }
    }
  }, [carregando, usuario, fetchDados]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFiltro(e.target.value);
  };

  const meusFuncionarios = usuarios.filter(u => u.cliente_id === usuario?.id);
  const funcionariosClientes = usuarios.filter(u => u.cliente_id !== usuario?.id);

  const filteredClientes = clientes.filter(c => 
    c.nome.toLowerCase().includes(filtro.toLowerCase()) ||
    c.email.toLowerCase().includes(filtro.toLowerCase())
  );

  const filterUsers = (userList: UsuarioComEmpresa[], currentTab: string) => {
    const termoBusca = filtro.toLowerCase();
    return userList.filter(u => {
        const nomeEmpresa = u.nome_empresa || '';
        
        const textMatch = u.nome.toLowerCase().includes(termoBusca) ||
               u.email.toLowerCase().includes(termoBusca) ||
               nomeEmpresa.toLowerCase().includes(termoBusca);
               
        if (!textMatch) return false;
        
        if (isAdmin && currentTab === 'funcionarios_clientes' && filtroEmpresaId !== 'todos') {
            return u.cliente_id === filtroEmpresaId;
        }

        return true;
    });
  };
  
  const filteredMeusFuncionarios = filterUsers(meusFuncionarios, 'meus_funcionarios');
  const filteredFuncionariosClientes = filterUsers(funcionariosClientes, 'funcionarios_clientes');
  
  // Variável para a visualização de Cliente/Usuário (não Admin)
  const filteredClientUsers = filterUsers(usuarios, 'meus_funcionarios');


  const handleDelete = async (id: string, nome: string, targetRole: UserRole) => {
    if (!window.confirm(`Tem certeza que deseja deletar a conta de ${nome}? Esta ação é irreversível.`)) return;

    try {
      const tableName = targetRole === 'Cliente' ? 'tbl_clientes' : 'tbl_usuarios';
      
      const { error: profileError } = await supabase
        .from(tableName)
        .delete()
        .eq('id', id);

      if (profileError) throw profileError;
      
      showSuccess(`Conta de ${nome} deletada com sucesso.`);
      fetchDados();
    } catch (error: any) {
      showError('Falha ao deletar conta: ' + error.message);
    }
  };

  const handleAprovarCliente = async (cliente: ClienteProfile) => {
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
        fetchDados();
    }
  };

  const handleSaveComplete = () => {
    setIsDialogOpen(false);
    setPerfilParaEditar(null);
    fetchDados();
  };
  
  const handleOpenDialog = (profile: AnyProfile | null, _targetRole: UserRole) => {
      setPerfilParaEditar(profile);
      setIsDialogOpen(true);
  };
  
  // Lógica de determinação do botão e do targetRole
  const isManagingClients = activeTab === 'clientes';
  const targetRole: UserRole = isManagingClients ? 'Cliente' : 'Usuario';
  const title = 'Gerenciar Usuários'; 
  
  const buttonText = isManagingClients ? 'Novo Cliente (Empresa)' : 'Novo Usuário (Funcionário)';
  
  // Helper function to render the table content
  const renderTableContent = (profiles: AnyProfile[], currentRole: UserRole, currentTab: string) => {
    // Filtra perfis nulos para satisfazer o TypeScript
    const nonNullProfiles = profiles.filter((p): p is Exclude<AnyProfile, null> => p !== null);
    
    if (nonNullProfiles.length === 0) {
        return <p className="text-center text-muted-foreground">Nenhum {currentRole} encontrado.</p>;
    }
    
    return (
        <div className="rounded-md border overflow-x-auto">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Email</TableHead>
                        {currentRole === 'Cliente' && <TableHead>Limite Usuários</TableHead>}
                        {currentRole === 'Usuario' && isAdmin && currentTab === 'funcionarios_clientes' && <TableHead>Empresa</TableHead>}
                        {currentRole === 'Usuario' && <TableHead>Início Contrato</TableHead>}
                        {currentRole === 'Cliente' && <TableHead>Status</TableHead>}
                        <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {nonNullProfiles.map((p) => {
                        const id = p.id;
                        const nome = p.nome;
                        const email = p.email;
                        
                        if (currentRole === 'Cliente') {
                            const cliente = p as ClienteProfile;
                            const isAprovado = cliente.aprovado;
                            
                            return (
                                <TableRow key={id} className={cn(!isAprovado && "bg-yellow-500/10")}>
                                    <TableCell className="font-medium">{nome}</TableCell>
                                    <TableCell>{email}</TableCell>
                                    <TableCell>{cliente.limite_usuarios}</TableCell>
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
                                                onClick={() => handleAprovarCliente(cliente)}
                                                className="h-8"
                                            >
                                                <CheckCircle className="h-4 w-4 mr-1" /> Aprovar
                                            </Button>
                                        )}
                                        <Button 
                                            variant="outline" 
                                            size="icon" 
                                            onClick={() => handleOpenDialog(cliente, 'Cliente')}
                                        >
                                            <Edit className="h-4 w-4" />
                                        </Button>
                                        <Button 
                                            variant="destructive" 
                                            size="icon" 
                                            onClick={() => handleDelete(id, nome, 'Cliente')}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            );
                        } else {
                            const userProfile = p as UsuarioComEmpresa;
                            
                            return (
                                <TableRow key={id}>
                                    <TableCell className="font-medium">{nome}</TableCell>
                                    <TableCell>{email}</TableCell>
                                    {isAdmin && currentTab === 'funcionarios_clientes' && (
                                        <TableCell className="text-sm text-muted-foreground">{userProfile.nome_empresa || 'N/A'}</TableCell>
                                    )}
                                    <TableCell>
                                        {userProfile.data_inicio_contrato 
                                            ? format(new Date(userProfile.data_inicio_contrato!), 'dd/MM/yyyy', { locale: ptBR })
                                            : 'N/A'}
                                    </TableCell>
                                    <TableCell className="text-right space-x-2">
                                        <Button 
                                            variant="outline" 
                                            size="icon" 
                                            onClick={() => handleOpenDialog(userProfile, 'Usuario')}
                                        >
                                            <Edit className="h-4 w-4" />
                                        </Button>
                                        <Button 
                                            variant="destructive" 
                                            size="icon" 
                                            onClick={() => handleDelete(id, nome, 'Usuario')}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            );
                        }
                    })}
                </TableBody>
            </Table>
        </div>
    );
  };


  if (carregando || carregandoDados) {
    return (
      <LayoutPrincipal>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </LayoutPrincipal>
    );
  }

  if (!usuario || !role || !perfil) {
    return <LayoutPrincipal><p>Redirecionando...</p></LayoutPrincipal>;
  }
  
  // Determina o perfil alvo para o novo cadastro
  const newTargetRole: UserRole = isManagingClients ? 'Cliente' : 'Usuario';

  return (
    <LayoutPrincipal>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">{title}</h1>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button 
                onClick={() => handleOpenDialog(null, newTargetRole)}
                disabled={isCliente && isManagingClients}
            >
              <Plus className="mr-2 h-4 w-4" />
              {buttonText}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{perfilParaEditar ? `Editar ${targetRole}` : `Criar Novo ${newTargetRole}`}</DialogTitle>
            </DialogHeader>
            <FormUsuario 
              criadorRole={role}
              criadorPerfil={perfil}
              usuarioInicial={perfilParaEditar}
              onSaveComplete={handleSaveComplete}
            />
          </DialogContent>
        </Dialog>
      </div>

      {isAdmin ? (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full mb-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="clientes" className="flex items-center"><Building2 className="w-4 h-4 mr-2" /> Clientes (Empresas)</TabsTrigger>
            <TabsTrigger value="meus_funcionarios" className="flex items-center"><UsersIcon className="w-4 h-4 mr-2" /> Meus Funcionários</TabsTrigger>
            <TabsTrigger value="funcionarios_clientes" className="flex items-center"><UsersIcon className="w-4 h-4 mr-2" /> Funcionários dos Clientes</TabsTrigger>
          </TabsList>
          
          <TabsContent value="clientes">
            <div className="flex flex-col sm:flex-row mb-4 gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, email..."
                  value={filtro}
                  onChange={handleSearch}
                  className="pl-10"
                />
              </div>
            </div>
            {renderTableContent(filteredClientes, 'Cliente', activeTab)}
          </TabsContent>
          
          <TabsContent value="meus_funcionarios">
            <div className="flex flex-col sm:flex-row mb-4 gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou email..."
                  value={filtro}
                  onChange={handleSearch}
                  className="pl-10"
                />
              </div>
            </div>
            {renderTableContent(filteredMeusFuncionarios, 'Usuario', activeTab)}
          </TabsContent>
          
          <TabsContent value="funcionarios_clientes">
            <div className="flex flex-col sm:flex-row mb-4 gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, email ou empresa..."
                  value={filtro}
                  onChange={handleSearch}
                  className="pl-10"
                />
              </div>
              
              {empresasFiltro.length > 0 && (
                  <Select value={filtroEmpresaId} onValueChange={setFiltroEmpresaId}>
                      <SelectTrigger className="w-full sm:w-[250px]">
                          <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
                          <SelectValue placeholder="Filtrar por Empresa" />
                      </SelectTrigger>
                      <SelectContent>
                          <SelectItem value="todos">Todas as Empresas</SelectItem>
                          {/* Filtra a opção 'Meus Usuários (Admin)' para esta aba */}
                          {empresasFiltro.filter(e => e.id !== usuario?.id).map(e => (
                              <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                          ))}
                      </SelectContent>
                  </Select>
              )}
            </div>
            {renderTableContent(filteredFuncionariosClientes, 'Usuario', activeTab)}
          </TabsContent>
        </Tabs>
      ) : (
        // Cliente/Usuário (apenas gerencia usuários)
        <>
          <div className="flex flex-col sm:flex-row mb-4 gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou email..."
                value={filtro}
                onChange={handleSearch}
                className="pl-10"
              />
            </div>
          </div>
          {renderTableContent(filteredClientUsers, 'Usuario', activeTab)}
        </>
      )}
    </LayoutPrincipal>
  );
};

export default GerenciarUsuarios;