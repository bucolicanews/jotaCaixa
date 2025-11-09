import React, { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { useSessao } from '@/hooks/use-sessao';
import { Loader2, Plus, Search, Trash2, Edit, Filter, Users as UsersIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import FormUsuario from '@/components/formularios/FormUsuario';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { AnyProfile, UsuarioProfile, UserRole } from '@/types/usuario';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
  const [empresasFiltro, setEmpresasFiltro] = useState<EmpresaFiltro[]>([]);
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [filtro, setFiltro] = useState('');
  const [filtroEmpresaId, setFiltroEmpresaId] = useState('todos');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [perfilParaEditar, setPerfilParaEditar] = useState<AnyProfile | null>(null);
  
  const [activeTab, setActiveTab] = useState('meus_funcionarios');

  const isAdmin = role === 'Admin';
  const isCliente = role === 'Cliente';

  // Efeito para definir a aba ativa inicial
  useEffect(() => {
      if (!carregando && isAdmin) {
          setActiveTab('meus_funcionarios');
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
    
    let fetchedClientes: EmpresaFiltro[] = [];
    let fetchedUsuarios: UsuarioComEmpresa[] = [];

    if (isAdmin) {
      // 1. Admin: Busca todos os clientes
      const { data: clientesData, error: clientesError } = await supabase
        .from('tbl_clientes')
        .select('id, nome');

      if (clientesError) {
        showError('Erro ao carregar clientes para filtro: ' + clientesError.message);
        setCarregandoDados(false);
        return;
      }
      
      fetchedClientes = clientesData as EmpresaFiltro[];
      
      // Adiciona o próprio Admin como um "cliente" para seus próprios usuários
      if (usuario.id) {
          fetchedClientes.unshift({ id: usuario.id, nome: 'Meus Usuários (Admin)' } as EmpresaFiltro);
      }
      
      // IDs permitidos: Admin's ID + todos os IDs de clientes
      const allowedClientIds = fetchedClientes.map(c => c.id);
      
      setEmpresasFiltro(fetchedClientes);

      // ADMIN: Busca TODOS os Usuários (Funcionários) do sistema
      const { data: usuariosData, error: usuariosError } = await supabase
        .from('tbl_usuarios')
        .select('*, tbl_clientes(nome)')
        .in('cliente_id', allowedClientIds)
        .order('nome', { ascending: true });

      if (usuariosError) {
        showError('Erro ao carregar usuários: ' + usuariosError.message);
        setUsuarios([]);
      } else {
        fetchedUsuarios = (usuariosData as any[]).map(item => {
          const nomeEmpresa = fetchedClientes.find(c => c.id === item.cliente_id)?.nome || 'N/A';
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


  const handleDelete = async (id: string, nome: string) => {
    if (!window.confirm(`Tem certeza que deseja deletar a conta de ${nome}? Esta ação é irreversível.`)) return;

    try {
      // Deleta o perfil do usuário na tbl_usuarios
      const { error: profileError } = await supabase
        .from('tbl_usuarios')
        .delete()
        .eq('id', id);

      if (profileError) throw profileError;
      
      // Deleta o usuário do auth.users
      // Nota: O RLS impede que um Cliente/Usuário delete outro usuário, apenas o Admin pode fazer isso.
      // Se o Admin estiver deletando, ele precisa de permissão de service_role, que não temos aqui.
      // Vamos confiar que a exclusão do perfil é suficiente para o fluxo de UI, e o Admin pode limpar o auth.users manualmente se necessário.
      
      showSuccess(`Conta de ${nome} deletada com sucesso.`);
      fetchDados();
    } catch (error: any) {
      showError('Falha ao deletar conta: ' + error.message);
    }
  };

  const handleSaveComplete = () => {
    setIsDialogOpen(false);
    setPerfilParaEditar(null);
    fetchDados();
  };
  
  const handleOpenDialog = (profile: AnyProfile | null) => {
      setPerfilParaEditar(profile);
      setIsDialogOpen(true);
  };
  
  // O targetRole é sempre 'Usuario' nesta página
  const targetRole: UserRole = 'Usuario';
  const title = 'Gerenciar Funcionários'; 
  const buttonText = 'Novo Usuário (Funcionário)';
  
  // Helper function to render the table content
  const renderTableContent = (profiles: AnyProfile[], currentTab: string) => {
    // Filtra perfis nulos para satisfazer o TypeScript
    const nonNullProfiles = profiles.filter((p): p is UsuarioComEmpresa => p !== null && 'cliente_id' in p);
    
    if (nonNullProfiles.length === 0) {
        return <p className="text-center text-muted-foreground">Nenhum funcionário encontrado.</p>;
    }
    
    return (
        <div className="rounded-md border overflow-x-auto">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Email</TableHead>
                        {isAdmin && currentTab === 'funcionarios_clientes' && <TableHead>Empresa</TableHead>}
                        <TableHead>Início Contrato</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {nonNullProfiles.map((userProfile) => {
                        const id = userProfile.id;
                        const nome = userProfile.nome;
                        
                        return (
                            <TableRow key={id}>
                                <TableCell className="font-medium">{nome}</TableCell>
                                <TableCell>{userProfile.email}</TableCell>
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
                                        onClick={() => handleOpenDialog(userProfile)}
                                    >
                                        <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button 
                                        variant="destructive" 
                                        size="icon" 
                                        onClick={() => handleDelete(id, nome)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        );
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
  
  return (
    <LayoutPrincipal>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl md:text-3xl font-bold">{title}</h1>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button 
                onClick={() => handleOpenDialog(null)}
                className="w-full sm:w-auto"
            >
              <Plus className="mr-2 h-4 w-4" />
              {buttonText}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{perfilParaEditar ? `Editar ${targetRole}` : `Criar Novo ${targetRole}`}</DialogTitle>
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
          {/* Ajuste: Usando grid-cols-2 para quebrar as abas em mobile */}
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="meus_funcionarios" className="flex items-center"><UsersIcon className="w-4 h-4 mr-2" /> Meus Funcionários</TabsTrigger>
            <TabsTrigger value="funcionarios_clientes" className="flex items-center"><UsersIcon className="w-4 h-4 mr-2" /> Funcionários dos Clientes</TabsTrigger>
          </TabsList>
          
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
            {renderTableContent(filteredMeusFuncionarios, 'meus_funcionarios')}
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
            {renderTableContent(filteredFuncionariosClientes, 'funcionarios_clientes')}
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
          {renderTableContent(filteredClientUsers, 'meus_funcionarios')}
        </>
      )}
    </LayoutPrincipal>
  );
};

export default GerenciarUsuarios;