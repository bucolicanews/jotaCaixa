import React, { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { useSessao } from '@/hooks/use-sessao';
import { Loader2, Plus, Search, Trash2, Edit, Building2 } from 'lucide-react';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// Tipagem para o perfil de usuário com nome da empresa
type UsuarioComEmpresa = UsuarioProfile & { nome_empresa?: string };

const GerenciarUsuarios: React.FC = () => {
  const { usuario, perfil, role, carregando } = useSessao();
  const [usuarios, setUsuarios] = useState<UsuarioComEmpresa[]>([]);
  const [clientes, setClientes] = useState<ClienteProfile[]>([]);
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [filtro, setFiltro] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [perfilParaEditar, setPerfilParaEditar] = useState<AnyProfile | null>(null);
  const [activeTab, setActiveTab] = useState(role === 'Admin' ? 'clientes' : 'usuarios');

  const isAdmin = role === 'Admin';
  const isCliente = role === 'Cliente';

  const fetchDados = useCallback(async () => {
    if (!usuario || !role) return;

    setCarregandoDados(true);

    if (isAdmin) {
      // ADMIN: Busca Clientes (Empresas)
      const { data: clientesData, error: clientesError } = await supabase
        .from('tbl_clientes')
        .select('*')
        .order('nome', { ascending: true });

      if (clientesError) {
        showError('Erro ao carregar clientes: ' + clientesError.message);
        setClientes([]);
      } else {
        setClientes(clientesData as ClienteProfile[]);
      }
    }

    // ADMIN e CLIENTE: Busca Usuários (Funcionários)
    let query = supabase.from('tbl_usuarios').select('*, tbl_clientes(nome)').order('nome', { ascending: true });

    if (isCliente) {
      query = query.eq('cliente_id', usuario.id);
    }
    
    const { data: usuariosData, error: usuariosError } = await query;

    if (usuariosError) {
      showError('Erro ao carregar usuários: ' + usuariosError.message);
      setUsuarios([]);
    } else {
      const mappedData = usuariosData.map(item => {
        if (isAdmin && item.tbl_clientes) {
          return { ...item, nome_empresa: item.tbl_clientes.nome } as UsuarioComEmpresa;
        }
        return item as UsuarioComEmpresa;
      });
      setUsuarios(mappedData);
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
    const nomeEmpresa = u.nome_empresa || '';
    return u.nome.toLowerCase().includes(filtro.toLowerCase()) ||
           u.email.toLowerCase().includes(filtro.toLowerCase()) ||
           nomeEmpresa.toLowerCase().includes(filtro.toLowerCase());
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
  const title = isManagingClients ? 'Gerenciar Clientes (Empresas)' : 'Gerenciar Usuários (Equipe)';
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
              Novo {targetRole}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{perfilParaEditar ? `Editar ${targetRole}` : `Criar Novo ${targetRole}`}</DialogTitle>
            </DialogHeader>
            <FormUsuario 
              criadorRole={role}
              criadorPerfil={perfil}
              clienteId={isCliente ? usuario.id : undefined}
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

      <div className="flex mb-4 space-x-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={`Buscar por nome, email ${isManagingClients ? '' : 'ou empresa'}...`}
            value={filtro}
            onChange={handleSearch}
            className="pl-10"
          />
        </div>
      </div>

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
    </LayoutPrincipal>
  );
};

export default GerenciarUsuarios;