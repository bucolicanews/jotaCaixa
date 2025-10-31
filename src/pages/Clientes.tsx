import { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Edit, Trash2, PlusCircle, Filter, Building2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { Cliente } from '@/types/cliente';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import FormCliente from '@/components/FormCliente';
import { UsuarioProfile, ClienteProfile } from '@/types/usuario';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';

// Tipo para o filtro de empresa (inclui o Admin)
interface EmpresaFiltro {
    id: string;
    nome: string;
}

const ClientesPage = () => {
  const { usuario, perfil, role, carregando: carregandoSessao } = useSessao();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [carregandoClientes, setCarregandoClientes] = useState(true);
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null);
  const [dialogAberto, setDialogAberto] = useState(false);
  
  // Filtros para Admin
  const [empresasFiltro, setEmpresasFiltro] = useState<EmpresaFiltro[]>([]);
  const [filtroEmpresaId, setFiltroEmpresaId] = useState('todos');
  const [filtroNome, setFiltroNome] = useState('');

  const isAdmin = role === 'Admin';

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
        const adminOption: EmpresaFiltro = { id: usuario.id, nome: 'Meus Clientes (Admin)' };
        const allClients = [adminOption, ...clientData];
        
        setEmpresasFiltro(allClients);
    }
  }, [isAdmin, usuario?.id]);

  const buscarClientes = useCallback(async () => {
    setCarregandoClientes(true);
    
    let query = supabase
      .from('clientes')
      .select('*')
      .order('nome', { ascending: true });

    if (isAdmin) {
        // Admin vê todos os clientes de Contas a Receber
        // RLS já garante que o Admin veja todos os clientes de todas as empresas.
        // Se o filtro de empresa estiver ativo, aplicamos a restrição.
        if (filtroEmpresaId !== 'todos') {
            query = query.eq('empresa_id', filtroEmpresaId);
        }
    } else if (ownerId) {
        // Cliente/Usuário vê apenas os clientes da sua empresa
        query = query.eq('empresa_id', ownerId);
    } else {
        setClientes([]);
        setCarregandoClientes(false);
        return;
    }

    const { data, error } = await query;

    if (error) {
      showError('Erro ao carregar clientes: ' + error.message);
      setClientes([]);
    } else {
      // Aplica filtro de nome localmente
      const filteredData = (data as Cliente[]).filter(c => 
        c.nome.toLowerCase().includes(filtroNome.toLowerCase()) ||
        (c.razao_social?.toLowerCase() || '').includes(filtroNome.toLowerCase()) ||
        (c.documento?.toLowerCase() || '').includes(filtroNome.toLowerCase())
      );
      setClientes(filteredData);
    }
    setCarregandoClientes(false);
  }, [isAdmin, ownerId, filtroEmpresaId, filtroNome]);

  useEffect(() => {
    if (!carregandoSessao && usuario) {
      if (isAdmin) {
        fetchEmpresasFiltro();
      }
      buscarClientes();
    }
  }, [carregandoSessao, usuario, isAdmin, buscarClientes, fetchEmpresasFiltro]);
  
  // Re-busca quando os filtros mudam
  useEffect(() => {
      if (!carregandoSessao && usuario) {
          buscarClientes();
      }
  }, [filtroEmpresaId, filtroNome, buscarClientes, carregandoSessao, usuario]);


  const handleSaveComplete = () => {
    setDialogAberto(false);
    setClienteSelecionado(null);
    buscarClientes();
  };

  const handleEdit = (cliente: Cliente) => {
    setClienteSelecionado(cliente);
    setDialogAberto(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este cliente?')) return;

    const { error } = await supabase.from('clientes').delete().eq('id', id);

    if (error) {
      showError('Erro ao excluir cliente: ' + error.message);
    } else {
      showSuccess('Cliente excluído com sucesso.');
      buscarClientes();
    }
  };

  if (carregandoSessao || carregandoClientes) {
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
        <h1 className="text-2xl md:text-3xl font-bold">Clientes (Contas a Receber)</h1>
        <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
          <DialogTrigger asChild>
            <Button onClick={() => setClienteSelecionado(null)} className="w-full sm:w-auto">
              <PlusCircle className="w-4 h-4 mr-2" />
              Novo Cliente
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{clienteSelecionado ? 'Editar Cliente' : 'Novo Cliente'}</DialogTitle>
            </DialogHeader>
            <FormCliente 
              clienteInicial={clienteSelecionado}
              onSaveComplete={handleSaveComplete}
            />
          </DialogContent>
        </Dialog>
      </div>
      
      {/* Filtros para Admin */}
      {isAdmin && (
        <Card className="mb-6">
            <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center"><Filter className="w-4 h-4 mr-2" /> Filtros de Supervisão</CardTitle>
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
                        <SelectItem value="todos">Todas as Empresas</SelectItem>
                        {empresasFiltro.map(e => (
                            <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Clientes Cadastrados ({clientes.length})</CardTitle>
        </CardHeader>
        <CardContent>
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
                {clientes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 6 : 5} className="text-center py-4 text-muted-foreground">
                      Nenhum cliente cadastrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  clientes.map((cliente) => (
                    <TableRow key={cliente.id}>
                      <TableCell className="font-medium">{cliente.nome_fantasia || cliente.nome}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{cliente.razao_social || '-'}</TableCell>
                      <TableCell>{cliente.email || '-'}</TableCell>
                      <TableCell>{cliente.telefone || '-'}</TableCell>
                      {isAdmin && <TableCell className="text-sm text-muted-foreground">{cliente.empresa_id || 'N/A'}</TableCell>}
                      <TableCell className="text-right">
                        <div className="flex justify-end space-x-1">
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(cliente)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(cliente.id)}>
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
        </CardContent>
      </Card>
    </LayoutPrincipal>
  );
};

export default ClientesPage;