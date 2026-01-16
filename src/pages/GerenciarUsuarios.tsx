import React, { useState, useEffect, useCallback, useMemo } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { useSessao } from '@/hooks/use-sessao';
import { useOwner } from '@/hooks/use-owner';
import { Loader2, Plus, Search, Trash2, Edit, Filter, Users as UsersIcon, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import FormUsuario from '@/components/formularios/FormUsuario';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { AnyProfile, UsuarioProfile, UserRole, AdminUsuarioProfile } from '@/types/usuario';
import { format, parseISO } from 'date-fns';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BASE_URL } from '@/config/app-config';
import { useDebounce } from '@/hooks/use-debounce';

// Tipagem para o perfil de usuário com nome da empresa
type UsuarioComEmpresa = (UsuarioProfile | AdminUsuarioProfile) & { nome_empresa?: string };

// Tipo para o filtro de empresa
interface EmpresaFiltro {
    id: string;
    nome: string;
}

const GerenciarUsuarios: React.FC = () => {
  const { usuario, perfil, role, carregando } = useSessao();
  const { ownerId, ownerType } = useOwner();
  
  const [usuarios, setUsuarios] = useState<UsuarioComEmpresa[]>([]);
  const [empresasFiltro, setEmpresasFiltro] = useState<EmpresaFiltro[]>([]);
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [filtro, setFiltro] = useState('');
  const filtroDebounced = useDebounce(filtro, 500);
  const [filtroEmpresaId, setFiltroEmpresaId] = useState('todos');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [perfilParaEditar, setPerfilParaEditar] = useState<AnyProfile | null>(null);
  const [isSendingInvite, setIsSendingInvite] = useState<string | null>(null);
  
  const [activeTab, setActiveTab] = useState('meus_funcionarios');

  const isAdmin = role === 'Admin';
  const isAdminUsuario = ownerType === 'AdminUsuario';
  const usuarioId = usuario?.id || null;

  useEffect(() => {
      if (!carregando && (isAdmin || role === 'Cliente')) {
          setActiveTab('meus_funcionarios');
      }
  }, [carregando, isAdmin, role]);

  const fetchDados = useCallback(async () => {
    if (!usuarioId || !ownerId) {
        setCarregandoDados(false);
        return;
    }

    setCarregandoDados(true);
    let fetchedUsers: UsuarioComEmpresa[] = [];

    try {
        if (ownerType === 'Admin' || ownerType === 'AdminUsuario') {
          const { data: clientsData } = await supabase
            .from('tbl_clientes')
            .select('id, nome')
            .eq('admin_id', ownerId);

          if (clientsData) {
            const adminOption: EmpresaFiltro = { id: ownerId, nome: 'Meus Usuários (Admin)' };
            setEmpresasFiltro([adminOption, ...clientsData]);
          }

          const { data: adminUsersData } = await supabase
            .from('admin_usuarios')
            .select('*, admin_id')
            .eq('admin_id', ownerId)
            .order('nome', { ascending: true });
          
          if (adminUsersData) {
              fetchedUsers.push(...adminUsersData.map(u => ({ 
                  ...u, 
                  cliente_id: null,
                  is_admin_user: true,
                  cliente_nome: 'Meus Usuários (Admin)' 
              })));
          }

          const clientIds = (clientsData || []).map(c => c.id);
          if (clientIds.length > 0) {
              const { data: clientUsersData } = await supabase
                .from('tbl_usuarios')
                .select('*')
                .in('cliente_id', clientIds)
                .order('nome', { ascending: true });
              
              if (clientUsersData) {
                  fetchedUsers.push(...clientUsersData.map(item => {
                    const nomeEmpresa = (clientsData || []).find(c => c.id === (item as UsuarioProfile).cliente_id)?.nome || 'N/A';
                    return { ...item, cliente_nome: nomeEmpresa, is_admin_user: false } as UsuarioComEmpresa;
                  }));
              }
          }
        } else if (ownerType === 'Cliente') {
          const { data: usuariosData } = await supabase
            .from('tbl_usuarios')
            .select('*')
            .eq('cliente_id', ownerId) 
            .order('nome', { ascending: true });

          if (usuariosData) {
            fetchedUsers = usuariosData.map(u => ({ ...u, cliente_nome: 'Minha Empresa' })) as UsuarioComEmpresa[];
          }
        }

        setUsuarios(fetchedUsers.filter(u => u.id !== usuarioId));
    } catch (error) {
        console.error('Erro na busca:', error);
    } finally {
        setCarregandoDados(false);
    }
  }, [usuarioId, ownerId, ownerType]);

  useEffect(() => {
    if (!carregando && usuarioId && ownerId) {
      fetchDados();
    }
  }, [carregando, usuarioId, ownerId, fetchDados]);

  const meusFuncionarios = useMemo(() => usuarios.filter(u => (u as any).is_admin_user || (u as any).admin_id === ownerId), [usuarios, ownerId]);
  const funcionariosClientes = useMemo(() => usuarios.filter(u => !(u as any).is_admin_user && (u as any).cliente_id !== ownerId), [usuarios, ownerId]);

  const filterUsers = (userList: UsuarioComEmpresa[], currentTab: string) => {
    const termoBusca = filtroDebounced.toLowerCase();
    return userList.filter(u => {
        const textMatch = u.nome.toLowerCase().includes(termoBusca) || u.email.toLowerCase().includes(termoBusca);
        if (!textMatch) return false;
        if (isAdmin && currentTab === 'funcionarios_clientes' && filtroEmpresaId !== 'todos') {
            const proprietarioId = (u as any).cliente_id || (u as any).admin_id;
            return proprietarioId === filtroEmpresaId;
        }
        return true;
    });
  };
  
  const filteredMeusFuncionarios = filterUsers(meusFuncionarios, 'meus_funcionarios');
  const filteredFuncionariosClientes = filterUsers(funcionariosClientes, 'funcionarios_clientes');

  const handleDelete = async (id: string, nome: string) => {
    if (!window.confirm(`Tem certeza que deseja deletar a conta de ${nome}?`)) return;
    try {
      const tabela = isAdmin ? 'admin_usuarios' : 'tbl_usuarios';
      const { error } = await supabase.from(tabela).delete().eq('id', id);
      if (error) throw error;
      showSuccess(`Conta deletada.`);
      fetchDados();
    } catch (error: any) {
      showError('Falha: ' + error.message);
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
  
  const handleResendInvite = async (user: UsuarioComEmpresa) => {
      if (!user.email) return;
      setIsSendingInvite(user.id);
      try {
          const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
              redirectTo: `${BASE_URL}/atualizar-senha`,
          });
          if (error) throw error;
          showSuccess(`Link enviado.`);
      } catch (error: any) {
          showError('Falha: ' + error.message);
      } finally {
          setIsSendingInvite(null);
      }
  };
  
  const renderTableContent = (profiles: UsuarioComEmpresa[], currentTab: string) => {
    if (profiles.length === 0) {
        return <p className="text-center text-muted-foreground py-10">Nenhum funcionário encontrado.</p>;
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
                    {profiles.map((userProfile) => (
                        <TableRow key={userProfile.id}>
                            <TableCell className="font-medium">{userProfile.nome}</TableCell>
                            <TableCell>{userProfile.email}</TableCell>
                            {isAdmin && currentTab === 'funcionarios_clientes' && (
                                <TableCell className="text-sm text-muted-foreground">{userProfile.cliente_nome}</TableCell>
                            )}
                            <TableCell>
                                {userProfile.data_inicio_contrato ? format(parseISO(userProfile.data_inicio_contrato), 'dd/MM/yyyy') : 'N/A'}
                            </TableCell>
                            <TableCell className="text-right space-x-2">
                                <Button variant="outline" size="icon" onClick={() => handleResendInvite(userProfile)} disabled={!!isSendingInvite}>
                                    {isSendingInvite === userProfile.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                                </Button>
                                <Button variant="outline" size="icon" onClick={() => handleOpenDialog(userProfile)}>
                                    <Edit className="w-4 h-4" />
                                </Button>
                                <Button variant="destructive" size="icon" onClick={() => handleDelete(userProfile.id, userProfile.nome)}>
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </TableCell>
                        </TableRow>
                    ))}
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
  
  return (
    <LayoutPrincipal>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl md:text-3xl font-bold flex items-center">
            <UsersIcon className="w-6 h-6 mr-2" /> Gerenciar Funcionários
        </h1>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button 
                onClick={() => handleOpenDialog(null)}
                className="w-full sm:w-auto"
                disabled={isAdminUsuario}
                title={isAdminUsuario ? 'Apenas o Admin principal pode criar novos usuários.' : 'Novo Usuário'}
            >
              <Plus className="mr-2 h-4 w-4" />
              Novo Usuário
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{perfilParaEditar ? `Editar Usuário` : `Criar Novo Usuário`}</DialogTitle>
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
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="meus_funcionarios" className="flex items-center">Meus Funcionários</TabsTrigger>
            <TabsTrigger value="funcionarios_clientes" className="flex items-center">Funcionários dos Clientes</TabsTrigger>
          </TabsList>
          
          <TabsContent value="meus_funcionarios">
            <div className="flex flex-col sm:flex-row mb-4 gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou email..."
                  value={filtro}
                  onChange={(e) => setFiltro(e.target.value)}
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
                  onChange={(e) => setFiltro(e.target.value)}
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
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row mb-4 gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou email..."
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          {renderTableContent(filterUsers(usuarios, 'meus_funcionarios'), 'meus_funcionarios')}
        </div>
      )}
    </LayoutPrincipal>
  );
};

export default GerenciarUsuarios;