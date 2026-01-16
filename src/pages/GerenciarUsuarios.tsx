import React, { useState, useEffect, useCallback, useMemo } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, User, Filter, PlusCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { UsuarioProfile, ClienteProfile, AdminUsuarioProfile } from '@/types/usuario';
import { Cliente } from '@/types/cliente';
import { DataTable } from '@/components/ui/data-table';
import { columns } from '@/components/ponto/columns';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOwner } from '@/hooks/use-owner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import FormUsuario from '@/components/formularios/FormUsuario';
import { Plano } from '@/types/plano';

// Tipo para unificar usuários de admin e de clientes
interface UsuarioGerenciado extends UsuarioProfile {
    cliente_nome?: string;
    is_admin_user?: boolean;
    admin_id?: string | null;
}

const GerenciarUsuarios: React.FC = () => {
  const { role, perfil, usuario, carregando: carregandoSessao } = useSessao();
  const { ownerId } = useOwner();
  
  const [usuarios, setUsuarios] = useState<UsuarioGerenciado[]>([]);
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [filtroNome, setFiltroNome] = useState('');
  const [filtroClienteId, setFiltroClienteId] = useState('todos');
  const [clientesDisponiveis, setClientesDisponiveis] = useState<Cliente[]>([]);
  const [planos, setPlanos] = useState<Plano[]>([]);
  
  // Estados para o diálogo de criação/edição
  const [dialogOpen, setDialogOpen] = useState(false);
  const [usuarioParaEditar, setUsuarioParaEditar] = useState<UsuarioGerenciado | null>(null);

  const isAdmin = role === 'Admin';

  const buscarDados = useCallback(async () => {
    if (!ownerId) {
        setCarregandoDados(false);
        return;
    }
    
    setCarregandoDados(true);
    
    let fetchedUsers: UsuarioGerenciado[] = [];
    let fetchedClientes: Cliente[] = [];

    if (isAdmin && usuario?.id) {
        // LÓGICA DO ADMIN
        // 1. Buscar clientes do admin para o filtro e mapeamento de nomes
        const { data: clientsData, error: clientsError } = await supabase
            .from('tbl_clientes')
            .select('id, nome');
        if (clientsError) {
            showError('Erro ao carregar clientes: ' + clientsError.message);
            setCarregandoDados(false);
            return;
        }
        fetchedClientes = (clientsData as Cliente[]) || [];
        fetchedClientes.unshift({ id: usuario.id, nome: 'Meus Usuários (Admin)' } as Cliente);
        setClientesDisponiveis(fetchedClientes);

        // 2. Buscar funcionários diretos do admin (tabela admin_usuarios)
        const { data: adminUsersData, error: adminUsersError } = await supabase
            .from('admin_usuarios')
            .select('*')
            .eq('admin_id', usuario.id);
        if (adminUsersError) {
            showError('Erro ao carregar usuários do admin: ' + adminUsersError.message);
        } else if (adminUsersData) {
            fetchedUsers.push(...adminUsersData.map(u => ({
                ...u,
                cliente_id: null,
                admin_id: usuario.id,
                is_admin_user: true,
                cliente_nome: 'Meus Usuários (Admin)'
            } as UsuarioGerenciado)));
        }

        // 3. Buscar funcionários dos clientes do admin (tabela tbl_usuarios)
        const clientIds = fetchedClientes.filter(c => c.id !== usuario.id).map(c => c.id);
        if (clientIds.length > 0) {
            const { data: clientUsersData, error: clientUsersError } = await supabase
                .from('tbl_usuarios')
                .select('*')
                .in('cliente_id', clientIds);
            if (clientUsersError) {
                showError('Erro ao carregar usuários dos clientes: ' + clientUsersError.message);
            } else if (clientUsersData) {
                fetchedUsers.push(...clientUsersData.map(u => ({
                    ...u,
                    is_admin_user: false,
                    cliente_nome: fetchedClientes.find(c => c.id === u.cliente_id)?.nome || 'N/A'
                } as UsuarioGerenciado)));
            }
        }
    } else if (!isAdmin && ownerId) {
        // LÓGICA DO CLIENTE
        const { data: usersData, error: usersError } = await supabase
            .from('tbl_usuarios')
            .select('*')
            .eq('cliente_id', ownerId);
        if (usersError) {
            showError('Erro ao carregar usuários: ' + usersError.message);
        } else if (usersData) {
            fetchedUsers = (usersData as UsuarioProfile[]).map(u => ({
                ...u,
                cliente_nome: (perfil as ClienteProfile)?.nome || 'Minha Empresa'
            } as UsuarioGerenciado));
        }
    }

    setUsuarios(fetchedUsers.sort((a, b) => a.nome.localeCompare(b.nome)));
    setCarregandoDados(false);
  }, [ownerId, isAdmin, usuario?.id, perfil]);

  useEffect(() => {
    if (!carregandoSessao) {
      buscarDados();
    }
  }, [carregandoSessao, buscarDados]);
  
  const usuariosFiltrados = useMemo(() => {
    let filtered = usuarios;

    if (filtroNome) {
        filtered = filtered.filter(u => 
            u.nome.toLowerCase().includes(filtroNome.toLowerCase()) ||
            u.email.toLowerCase().includes(filtroNome.toLowerCase())
        );
    }
    
    if (filtroClienteId !== 'todos') {
        filtered = filtered.filter(u => {
            if (filtroClienteId === usuario?.id) {
                return u.is_admin_user;
            }
            return u.cliente_id === filtroClienteId;
        });
    }

    return filtered;
  }, [usuarios, filtroNome, filtroClienteId, usuario?.id]);
  
  const handleOpenDialog = (usuario?: UsuarioGerenciado) => {
      setUsuarioParaEditar(usuario || null);
      setDialogOpen(true);
  };
  
  const handleSaveComplete = () => {
      setDialogOpen(false);
      setUsuarioParaEditar(null);
      buscarDados();
  };

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
        <h1 className="text-2xl md:text-3xl font-bold flex items-center">
          <User className="w-6 h-6 mr-2" /> Gerenciar Usuários
        </h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
                <Button onClick={() => handleOpenDialog()} className="w-full sm:w-auto">
                    <PlusCircle className="w-4 h-4 mr-2" />
                    Novo Usuário
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{usuarioParaEditar ? 'Editar Usuário' : 'Novo Usuário'}</DialogTitle>
                </DialogHeader>
                <FormUsuario
                    criadorRole={role!}
                    criadorPerfil={perfil!}
                    usuarioInicial={usuarioParaEditar}
                    onSaveComplete={handleSaveComplete}
                    planos={planos}
                />
            </DialogContent>
        </Dialog>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle className="text-xl flex items-center">
            Usuários Ativos
          </CardTitle>
        </CardHeader>
        <CardContent>
            <div className="flex flex-col sm:flex-row gap-4 mb-4">
                <Input
                    placeholder="Filtrar por nome ou email..."
                    value={filtroNome}
                    onChange={(event) => setFiltroNome(event.target.value)}
                    className="max-w-sm"
                />
                
                {isAdmin && (
                    <Select value={filtroClienteId} onValueChange={setFiltroClienteId}>
                        <SelectTrigger className="max-w-[200px]">
                            <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
                            <SelectValue placeholder="Filtrar por Empresa" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="todos">Todas as Empresas</SelectItem>
                            {clientesDisponiveis.map(c => (
                                <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
            </div>

            <DataTable 
                columns={columns(isAdmin)} 
                data={usuariosFiltrados} 
                emptyMessage="Nenhum usuário encontrado."
            />
        </CardContent>
      </Card>
    </LayoutPrincipal>
  );
};

export default GerenciarUsuarios;