import React, { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { useSessao } from '@/hooks/use-sessao';
import { Loader2, Plus, Search, Trash2, Edit, Building2, Filter } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState(role === 'Admin' ? 'clientes' : 'usuarios');

  const isAdmin = role === 'Admin';
  const isCliente = role === 'Cliente';

  const fetchDados = useCallback(async () => {
    if (!usuario || !role) return;

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
      } else {
        fetchedClientes = clientesData as ClienteProfile[];
        setClientes(fetchedClientes);
      }
      
      // Configura opções de filtro para o Admin
      const adminFilterOption: EmpresaFiltro = { id: usuario.id, nome: 'Meus Usuários (Admin)' };
      const clientFilterOptions: EmpresaFiltro[] = fetchedClientes.map(c => ({ id: c.id, nome: c.nome }));
      setEmpresasFiltro([adminFilterOption, ...clientFilterOptions]);
      
      // ADMIN: Busca TODOS os Usuários (Funcionários) do sistema
      // Seleciona o nome do cliente para exibição
      const { data: usuariosData, error: usuariosError } = await supabase
        .from('tbl_usuarios')
        .select('*, tbl_clientes(nome)')
        .order('nome', { ascending: true });

      if (usuariosError) {
        showError('Erro ao carregar usuários: ' + usuariosError.message);
      } else {
        fetchedUsuarios = (usuariosData as any[]).map(item => {
          const nomeEmpresa = item.tbl_clientes?.nome || (item.cliente_id === usuario.id ? 'Meus Usuários (Admin)' : 'N/A');
          return { ...item, nome_empresa: nomeEmpresa } as UsuarioComEmpresa;
        });
        setUsuarios(fetchedUsuarios);
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
      } else {
        fetchedUsuarios = usuariosData as UsuarioComEmpresa[];
        setUsuarios(fetchedUsuarios);
      }
    }
    
    setCarregandoDados(false);
  }, [usuario, role, isAdmin, isCliente]);

  useEffect(() => {
    fetchDados();
  }, [fetchDados]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFiltro(e.target.value);
  };

  const filteredClientes = clientes.filter(c => 
    c.nome.toLowerCase().includes(filtro.toLowerCase()) ||
    c.email.toLowerCase().includes(filtro.toLowerCase())
  );

  const filteredUsuarios = usuarios.filter(u => {
    const termoBusca = filtro.toLowerCase();
    const nomeEmpresa = u.nome_empresa || '';
    
    // Filtro de texto
    const textMatch = u.nome.toLowerCase().includes(termoBusca) ||
           u.email.toLowerCase().includes(termoBusca) ||
           nomeEmpresa.toLowerCase().includes(termoBusca);
           
    if (!textMatch) return false;
    
    // Filtro de empresa (apenas para Admin)
    if (isAdmin && filtroEmpresaId !== 'todos') {
        return u.cliente_id === filtroEmpresaId;
    }

    return true;
  });

  const handleDelete = async (id: string, nome: string, targetRole: UserRole) => {
    if (!window.confirm(`Tem certeza que deseja deletar a conta de ${nome}? Esta ação é irreversível.`)) return;

    try {
      const tableName = targetRole === 'Cliente' ? 'tbl_clientes' : 'tbl_usuarios';
      
      // 1. Deletar o registro do perfil
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

  const handleSaveComplete = () => {
    setIsDialogOpen(false);
    setPerfilParaEditar(null);
    fetchDados();
  };
  
  const handleOpenDialog = (profile: AnyProfile | null, _targetRole: UserRole) => {
      setPerfilParaEditar(profile);
      setIsDialogOpen(true);
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
    return (
      <LayoutPrincipal>
        <p>Acesso negado ou sessão não carregada.</p>
      </LayoutPrincipal>
    );
  }
  
  const isManagingClients = activeTab === 'clientes';
  const targetRole = isManagingClients ? 'Cliente' : 'Usuario';
  const title = 'Gerenciar Usuários'; 
  const profilesToDisplay = isManagingClients ? filteredClientes : filteredUsuarios;

  return (
    <LayoutPrincipal>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">{title}</h1>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button 
                onClick={() => handleOpenDialog(null, targetRole)}
                disabled={isCliente && isManagingClients} // Cliente não pode criar Clientes
            >
              <Plus className="mr-2 h-4 w-4" />
              Novo {targetRole === 'Cliente' ? 'Cliente' : 'Usuário'}
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

      {isAdmin && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full mb-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="clientes" className="flex items-center"><Building2 className="w-4 h-4 mr-2" /> Clientes (Empresas)</TabsTrigger>
            <TabsTrigger value="usuarios" className="flex items-center"><Building2 className="w-4 h-4 mr-2" /> Usuários (Funcionários)</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      <div className="flex flex-col sm:flex-row mb-4 gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={`Buscar por nome, email ${isManagingClients ? '' : 'ou empresa'}...`}
            value={filtro}
            onChange={handleSearch}
            className="pl-10"
          />
        </div>
        
        {/* Filtro de Empresa (Apenas na aba Usuários e se for Admin) */}
        {!isManagingClients && isAdmin && (
            <Select value={filtroEmpresaId} onValueChange={setFiltroEmpresaId}>
                <SelectTrigger className="w-full sm:w-[250px]">
                    <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
                    <SelectValue placeholder="Filtrar por Empresa" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="todos">Todas as Empresas</SelectItem>
                    {empresasFiltro.map(e => (
                        <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        )}
      </div>

      <TabsContent value={activeTab}>
        {profilesToDisplay.length === 0 ? (
          <p className="text-center text-muted-foreground">Nenhum {targetRole} encontrado.</p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  {isManagingClients && <TableHead>Limite Usuários</TableHead>}
                  {!isManagingClients && isAdmin && <TableHead>Empresa</TableHead>}
                  {!isManagingClients && <TableHead>Início Contrato</TableHead>}
                  {isManagingClients && <TableHead>Status</TableHead>}
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profilesToDisplay.map((p) => {
                  const id = p.id;
                  const nome = p.nome;
                  const email = p.email;
                  
                  if (isManagingClients) {
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
                              <TableCell className="text-right space-x-2">
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
                              {isAdmin && (
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
        )}
      </TabsContent>
    </LayoutPrincipal>
  );
};

export default GerenciarUsuarios;