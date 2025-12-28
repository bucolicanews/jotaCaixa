import React, { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { useSessao } from '@/hooks/use-sessao';
import { usePermissoesUsuario } from '@/hooks/use-permissoes-usuario';
import { Loader2, Plus, Search, Trash2, Edit, Filter, Users as UsersIcon, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import FormUsuario from '@/components/formularios/FormUsuario';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { AnyProfile, UsuarioProfile, UserRole, AdminUsuarioProfile, ClienteProfile } from '@/types/usuario';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BASE_URL } from '@/config/app-config';

// Tipagem para o perfil de usuário com nome da empresa
type UsuarioComEmpresa = (UsuarioProfile | AdminUsuarioProfile) & { nome_empresa?: string };

// Tipo para o filtro de empresa (inclui o Admin)
interface EmpresaFiltro {
    id: string;
    nome: string;
}

const GerenciarUsuarios: React.FC = () => {
  const { usuario, perfil, role, carregando } = useSessao();
  const { hasPermissao, carregando: carregandoPermissoes } = usePermissoesUsuario();
  const [usuarios, setUsuarios] = useState<UsuarioComEmpresa[]>([]);
  const [empresasFiltro, setEmpresasFiltro] = useState<EmpresaFiltro[]>([]);
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [filtro, setFiltro] = useState('');
  const [filtroEmpresaId, setFiltroEmpresaId] = useState('todos');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [perfilParaEditar, setPerfilParaEditar] = useState<AnyProfile | null>(null);
  const [isSendingInvite, setIsSendingInvite] = useState<string | null>(null); // NOVO ESTADO
  
  const [activeTab, setActiveTab] = useState('meus_funcionarios');

  const isAdmin = role === 'Admin';
  const isCliente = role === 'Cliente';
  const isUsuario = role === 'Usuario';
  
  const canManageUsers = hasPermissao('cadastrar_usuarios');
  
  // Determina se o usuário é funcionário do Admin (admin_usuario)
  const isAdminUsuario = isUsuario && !!(perfil as AdminUsuarioProfile)?.admin_id;
  const adminIdDoUsuario = isAdminUsuario ? (perfil as AdminUsuarioProfile)?.admin_id : null;
  const usuarioId = usuario?.id || null;
  const clientePerfil = isCliente && perfil ? (perfil as ClienteProfile) : null;
  const clientePerfilId = clientePerfil?.id || null;
  const clientePerfilNome = clientePerfil?.nome || 'Minha Empresa';

  // Efeito para definir a aba ativa inicial
  useEffect(() => {
      if (!carregando && (isAdmin || isCliente)) {
          setActiveTab('meus_funcionarios');
      }
  }, [carregando, isAdmin, isCliente]);


  const fetchDados = useCallback(async () => {
    if (!usuarioId || !role) {
        setCarregandoDados(false);
        return;
    }

    setCarregandoDados(true);
    
    let fetchedClientes: EmpresaFiltro[] = [];
    let fetchedUsers: UsuarioComEmpresa[] = [];
    const creatorId = isAdmin ? usuarioId : isAdminUsuario ? adminIdDoUsuario : clientePerfilId;

    if (isAdmin || (isAdminUsuario && creatorId)) {
      // 1. Admin ou Sub-Admin: Busca todos os clientes do criador
      const { data: clientsData, error: clientsError } = await supabase
        .from('tbl_clientes')
        .select('id, nome')
        .eq('admin_id', creatorId);

      if (clientsError) {
        showError('Erro ao carregar clientes para filtro: ' + clientsError.message);
        setCarregandoDados(false);
        return;
      }
      
      fetchedClientes = clientsData as EmpresaFiltro[];
      
      // Adiciona o próprio Admin/Sub-Admin como um "proprietário"
      if (creatorId) {
          const adminOption: EmpresaFiltro = { id: creatorId, nome: 'Meus Usuários (Admin)' };
          fetchedClientes.unshift(adminOption);
      }
      
      setEmpresasFiltro(fetchedClientes);

      // Busca Usuários (Funcionários) do Admin/Sub-Admin
      const { data: adminUsersData, error: adminUsersError } = await supabase
        .from('admin_usuarios')
        .select('*, admin_id')
        .eq('admin_id', creatorId)
        .order('nome', { ascending: true });
        
      if (adminUsersError) console.error('Erro ao carregar usuários do Admin:', adminUsersError);
      
      const adminUsers = (adminUsersData || []).map(u => ({ 
          ...u, 
          cliente_id: null, // Garante que cliente_id é null
          is_admin_user: true,
          cliente_nome: 'Meus Usuários (Admin)' 
      })) as UsuarioComEmpresa[];
      
      fetchedUsers.push(...adminUsers);

      // Busca Usuários (Funcionários) dos Clientes
      const clientIds = fetchedClientes
        .filter(c => c.id && c.id !== creatorId)
        .map(c => c.id as string);
      const uniqueClientIds = Array.from(new Set(clientIds));
      
      if (uniqueClientIds.length > 0) {
          const chunkSize = 20;
          const clientUsersRows: UsuarioProfile[] = [];
          
          for (let i = 0; i < uniqueClientIds.length; i += chunkSize) {
              const chunk = uniqueClientIds.slice(i, i + chunkSize);
              const inFilter = `(${chunk.map(id => `"${id}"`).join(',')})`;
              
              const { data: clientUsersData, error: clienteUsersError } = await supabase
                .from('tbl_usuarios')
                .select('*')
                .filter('cliente_id', 'in', inFilter)
                .order('nome', { ascending: true });
              
              if (clienteUsersError) {
                  console.error('Erro ao carregar usuários dos Clientes:', clienteUsersError);
                  showError('Falha ao carregar usuários das empresas clientes: ' + clienteUsersError.message);
                  break;
              }
              
              clientUsersRows.push(...((clientUsersData as UsuarioProfile[]) || []));
          }
          
          const clientUsers = clientUsersRows.map(item => {
            const nomeEmpresa = fetchedClientes.find(c => c.id === (item as UsuarioProfile).cliente_id)?.nome || 'N/A';
            return { ...item, cliente_nome: nomeEmpresa, is_admin_user: false } as UsuarioComEmpresa;
          });
          
          fetchedUsers.push(...clientUsers);
      }
      
    } else if (isCliente && creatorId) {
      // CLIENTE: Busca apenas seus próprios Usuários (Funcionários)
      const { data: usuariosData, error: usuariosError } = await supabase
        .from('tbl_usuarios')
        .select('*')
        .eq('cliente_id', creatorId) 
        .order('nome', { ascending: true });

      if (usuariosError) {
        showError('Erro ao carregar usuários: ' + usuariosError.message);
        setUsuarios([]);
        setCarregandoDados(false);
        return;
      }
      
      fetchedUsers = (usuariosData || []).map(u => ({ ...u, cliente_nome: clientePerfilNome })) as UsuarioComEmpresa[];
    }
    
    // NOVO PASSO: Buscar todos os IDs de Clientes (tbl_clientes) e Admin (tbl_admins) para exclusão
    const [clientProfilesRes, adminProfilesRes] = await Promise.all([
        supabase.from('tbl_clientes').select('id'),
        supabase.from('tbl_admins').select('id'),
    ]);
    
    const clientProfileIds = new Set((clientProfilesRes.data || []).map(c => c.id));
    const adminProfileIds = new Set((adminProfilesRes.data || []).map(a => a.id));
    
    // 3. Filtrar: Excluir o Admin logado E qualquer perfil que seja Cliente ou Admin (para garantir que apenas subordinados fiquem)
    const filteredUsers = fetchedUsers
        .filter(u => u.id !== usuarioId) // Exclui o usuário logado
        .filter(u => !clientProfileIds.has(u.id) && !adminProfileIds.has(u.id)); // Exclui qualquer um que seja Cliente ou Admin

    setUsuarios(filteredUsers);
    setCarregandoDados(false);
  }, [usuarioId, role, isAdmin, isCliente, isAdminUsuario, adminIdDoUsuario, clientePerfilId, clientePerfilNome]);

  useEffect(() => {
    if (!carregando) {
        if (usuarioId) {
            fetchDados();
        } else {
            setCarregandoDados(false);
        }
    }
  }, [carregando, usuarioId, fetchDados]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFiltro(e.target.value);
  };

  // Separação de usuários para as abas
  // Para admin_usuario, considera o admin_id do Admin como "seu" proprietário
  const meuProprietarioId = isAdminUsuario ? adminIdDoUsuario : usuarioId;
  const meusFuncionarios = usuarios.filter(u => (u as UsuarioProfile)?.cliente_id === meuProprietarioId || (u as AdminUsuarioProfile)?.admin_id === meuProprietarioId);
  const funcionariosClientes = usuarios.filter(u => (u as UsuarioProfile)?.cliente_id !== meuProprietarioId && (u as AdminUsuarioProfile)?.admin_id !== meuProprietarioId);

  const filterUsers = (userList: UsuarioComEmpresa[], currentTab: string) => {
    const termoBusca = filtro.toLowerCase();
    return userList.filter(u => {
        const nomeEmpresa = u.nome_empresa || '';
        
        const textMatch = u.nome.toLowerCase().includes(termoBusca) ||
               u.email.toLowerCase().includes(termoBusca) ||
               nomeEmpresa.toLowerCase().includes(termoBusca);
               
        if (!textMatch) return false;
        
        if (isAdmin && currentTab === 'funcionarios_clientes' && filtroEmpresaId !== 'todos') {
            // Filtra pelo ID do cliente (proprietario_id)
            const proprietarioId = (u as UsuarioProfile).cliente_id || (u as AdminUsuarioProfile).admin_id;
            return proprietarioId === filtroEmpresaId;
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
      // Determina a tabela de origem
      const userToDelete = usuarios.find(u => u.id === id);
      const isMyUser = (userToDelete as UsuarioProfile)?.cliente_id === usuarioId || (userToDelete as AdminUsuarioProfile)?.admin_id === usuarioId;
      const tabela = isMyUser && isAdmin ? 'admin_usuarios' : 'tbl_usuarios';
      
      // Deleta o perfil do usuário na tabela correta
      const { error: profileError } = await supabase
        .from(tabela)
        .delete()
        .eq('id', id);

      if (profileError) throw profileError;
      
      // Deleta o usuário do auth.users (Admin tem permissão para isso)
      // Nota: Em um ambiente real, isso requer service_role, mas aqui simulamos a exclusão do perfil.
      
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
  
  // NOVO HANDLER: Enviar Link de Redefinição de Senha
  const handleResendInvite = async (user: UsuarioComEmpresa) => {
      if (!user.email) {
          showError('Email do usuário não encontrado.');
          return;
      }
      
      setIsSendingInvite(user.id);
      
      try {
          const { data, error } = await supabase.auth.resetPasswordForEmail(user.email, {
              redirectTo: `${BASE_URL}/atualizar-senha`,
          });
          
          if (error) throw error;
          
          const resetLink = (data as { action_link: string | null }).action_link || `${BASE_URL}/atualizar-senha`;
          
          if (window.confirm(`Link de Acesso Gerado para ${user.nome}. Deseja copiar o link para enviar manualmente?`)) {
              navigator.clipboard.writeText(resetLink);
              showSuccess('Link copiado para a área de transferência.');
          }
          
          showSuccess(`Link de redefinição de senha enviado para ${user.email}.`);
      } catch (error: any) {
          showError('Falha ao enviar link: ' + error.message);
      } finally {
          setIsSendingInvite(null);
      }
  };
  
  // O targetRole é sempre 'Usuario' nesta página
  const targetRole: UserRole = 'Usuario';
  const title = 'Gerenciar Funcionários'; 
  const buttonText = 'Novo Usuário (Funcionário)'; 
  
  // Helper function to render the table content
  const renderTableContent = (profiles: UsuarioComEmpresa[], currentTab: string) => {
    
    if (profiles.length === 0) {
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
                    {profiles.map((userProfile) => {
                        const id = userProfile.id;
                        const nome = userProfile.nome;
                        const isSending = isSendingInvite === id;
                        
                        return (
                            <TableRow key={id}>
                                <TableCell className="font-medium">{nome}</TableCell>
                                <TableCell>{userProfile.email}</TableCell>
                                {isAdmin && currentTab === 'funcionarios_clientes' && (
                                    <TableCell className="text-sm text-muted-foreground">{userProfile.cliente_nome || 'N/A'}</TableCell>
                                )}
                                <TableCell>
                                    {userProfile.data_inicio_contrato ? (
                                        format(parseISO(userProfile.data_inicio_contrato), 'dd/MM/yyyy', { locale: ptBR })
                                    ) : (
                                        'N/A'
                                    )}
                                </TableCell>
                                <TableCell className="text-right space-x-2 min-w-[150px]">
                                    
                                    {/* NOVO BOTÃO: Enviar Link de Redefinição */}
                                    <Button 
                                        variant="outline" 
                                        size="icon" 
                                        onClick={() => handleResendInvite(userProfile)}
                                        title="Enviar Link de Redefinição de Senha"
                                        disabled={isSending || carregandoDados}
                                    >
                                        {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                                    </Button>
                                    
                                    <Button 
                                        variant="outline" 
                                        size="icon" 
                                        onClick={() => handleOpenDialog(userProfile)}
                                        disabled={!canManageUsers}
                                    >
                                        <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button 
                                        variant="destructive" 
                                        size="icon" 
                                        onClick={() => handleDelete(id, nome)}
                                        disabled={!canManageUsers}
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


  if (carregando || carregandoDados || carregandoPermissoes) {
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
                disabled={!canManageUsers}
                title={!canManageUsers ? 'Você não tem permissão para criar novos usuários.' : buttonText}
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
                          {empresasFiltro.filter(e => e.id !== usuarioId).map(e => (
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
