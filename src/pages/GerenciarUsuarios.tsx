import React, { useState, useEffect, useCallback, useMemo } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Clock, User, Filter } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError } from '@/utils/toast';
import { UsuarioProfile, ClienteProfile } from '@/types/usuario';
import { Cliente } from '@/types/cliente';
import { DataTable } from '@/components/ui/data-table';
import { columns } from '@/components/ponto/columns';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOwner } from '@/hooks/use-owner';

// Tipo simplificado para o usuário que estamos buscando
interface UsuarioPonto extends UsuarioProfile {
    cliente_nome?: string; // Nome do cliente/empresa a que o usuário pertence
    is_admin_user?: boolean;
    admin_id?: string | null;
}

const AcompanharPonto: React.FC = () => {
  const { role, perfil, usuario, carregando: carregandoSessao } = useSessao();
  const { ownerId } = useOwner();
  
  const [usuarios, setUsuarios] = useState<UsuarioPonto[]>([]);
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [filtroNome, setFiltroNome] = useState('');
  const [filtroClienteId, setFiltroClienteId] = useState('todos');
  const [clientesDisponiveis, setClientesDisponiveis] = useState<Cliente[]>([]);

  const isAdmin = role === 'Admin';

  const buscarDados = useCallback(async () => {
    if (!ownerId) {
        setCarregandoDados(false);
        return;
    }
    
    setCarregandoDados(true);
    
    let fetchedUsers: UsuarioPonto[] = [];
    let fetchedClientes: Cliente[] = [];

    if (isAdmin && usuario?.id) {
        // ADMIN LOGIC
        // 1. Fetch admin's own clients to populate filter and map names
        const { data: clientsData, error: clientsError } = await supabase
            .from('tbl_clientes')
            .select('id, nome');
        if (clientsError) {
            showError('Erro ao carregar clientes: ' + clientsError.message);
            setCarregandoDados(false);
            return;
        }
        fetchedClientes = (clientsData as Cliente[]) || [];
        // Add admin's own "company" to the list for filtering
        fetchedClientes.unshift({ id: usuario.id, nome: 'Meus Usuários (Admin)' } as Cliente);
        setClientesDisponiveis(fetchedClientes);

        // 2. Fetch admin's direct employees from `admin_usuarios`
        const { data: adminUsersData, error: adminUsersError } = await supabase
            .from('admin_usuarios')
            .select('*')
            .eq('admin_id', usuario.id);
        if (adminUsersError) {
            showError('Erro ao carregar usuários do admin: ' + adminUsersError.message);
        } else if (adminUsersData) {
            fetchedUsers.push(...adminUsersData.map(u => ({
                ...u,
                cliente_id: null, // No client_id for admin's users
                admin_id: usuario.id,
                is_admin_user: true,
                cliente_nome: 'Meus Usuários (Admin)'
            } as UsuarioPonto)));
        }

        // 3. Fetch employees of the admin's clients from `tbl_usuarios`
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
                } as UsuarioPonto)));
            }
        }
    } else if (!isAdmin && ownerId) {
        // CLIENT LOGIC
        // Fetch only their own employees from `tbl_usuarios`
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
            } as UsuarioPonto));
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
            // If filtering for admin's own users
            if (filtroClienteId === usuario?.id) {
                return u.is_admin_user;
            }
            // If filtering for a client's users
            return u.cliente_id === filtroClienteId;
        });
    }

    return filtered;
  }, [usuarios, filtroNome, filtroClienteId, usuario?.id]);


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
      <div className="flex items-center mb-6">
        <h1 className="text-2xl md:text-3xl font-bold flex items-center">
          <Clock className="w-6 h-6 mr-2" /> Acompanhar Ponto
        </h1>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle className="text-xl flex items-center">
            <User className="w-5 h-5 mr-2" /> Usuários Ativos
          </CardTitle>
        </CardHeader>
        <CardContent>
            
            {/* Filtros */}
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

export default AcompanharPonto;