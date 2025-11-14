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

// Tipo simplificado para o usuário que estamos buscando
interface UsuarioPonto extends UsuarioProfile {
    cliente_nome?: string; // Nome do cliente/empresa a que o usuário pertence
}

const AcompanharPonto: React.FC = () => {
  const { role, perfil, usuario, carregando: carregandoSessao } = useSessao();
  
  const [usuarios, setUsuarios] = useState<UsuarioPonto[]>([]);
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [filtroNome, setFiltroNome] = useState('');
  const [filtroClienteId, setFiltroClienteId] = useState('todos');
  const [clientesDisponiveis, setClientesDisponiveis] = useState<Cliente[]>([]);

  const isAdmin = role === 'Admin';
  
  // ID do proprietário (Admin ou Cliente)
  const getOwnerId = () => {
    if (isAdmin) return usuario?.id || null;
    if (role === 'Cliente') return (perfil as ClienteProfile)?.id || null;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id || null; // CORREÇÃO: Usando cliente_id
    return null;
  };
  
  const ownerId = getOwnerId();

  const buscarDados = useCallback(async () => {
    if (!ownerId && !isAdmin) {
        setCarregandoDados(false);
        return;
    }
    
    setCarregandoDados(true);
    
    let allowedClienteIds: string[] = [];
    let fetchedClientes: Cliente[] = [];
    
    if (isAdmin) {
        // 1. Admin: Busca todos os clientes
        const { data: clientsData, error: clientsError } = await supabase
            .from('tbl_clientes')
            .select('id, nome');

        if (clientsError) {
            showError('Erro ao carregar clientes: ' + clientsError.message);
            setCarregandoDados(false);
            return;
        }
        
        fetchedClientes = clientsData as Cliente[];
        
        // Adiciona o próprio Admin como um "cliente" para seus próprios usuários
        if (usuario?.id) {
            fetchedClientes.unshift({ id: usuario.id, nome: 'Meus Usuários (Admin)' } as Cliente);
        }
        
        // IDs permitidos: Admin's ID + todos os IDs de clientes
        allowedClienteIds = fetchedClientes.map(c => c.id);
        
    } else if (ownerId) {
        // Cliente/Usuário: Apenas o próprio ID
        allowedClienteIds = [ownerId];
    }
    
    setClientesDisponiveis(fetchedClientes);

    if (allowedClienteIds.length === 0) {
        setUsuarios([]);
        setCarregandoDados(false);
        return;
    }

    // 2. Busca Usuários
    const { data: usersData, error: usersError } = await supabase
        .from('tbl_usuarios')
        .select('*, cliente_id') // CORREÇÃO AQUI: Selecionando cliente_id
        .in('cliente_id', allowedClienteIds) // CORREÇÃO AQUI: Filtrando por cliente_id
        .order('nome');

    if (usersError) {
        showError('Erro ao carregar usuários: ' + usersError.message);
        setUsuarios([]);
    } else {
        // Mapeia os usuários para incluir o nome do cliente/empresa
        const usuariosComNomeCliente = (usersData as UsuarioProfile[]).map(user => {
            const cliente = fetchedClientes.find(c => c.id === user.cliente_id); // CORREÇÃO: Usando cliente_id
            return {
                ...user,
                cliente_nome: cliente?.nome || 'N/A',
            } as UsuarioPonto;
        });
        setUsuarios(usuariosComNomeCliente);
    }
    
    setCarregandoDados(false);
  }, [ownerId, isAdmin, usuario?.id]);

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
        filtered = filtered.filter(u => u.cliente_id === filtroClienteId); // CORREÇÃO: Usando cliente_id
    }

    return filtered;
  }, [usuarios, filtroNome, filtroClienteId]);


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