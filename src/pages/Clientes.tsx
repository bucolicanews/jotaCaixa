import { useState, useEffect } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Edit, Trash2, PlusCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError } from '@/utils/toast';
import { Cliente } from '@/types/cliente';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import FormCliente from '@/components/FormCliente';
import { UsuarioProfile } from '@/types/usuario';

const ClientesPage = () => {
  const { usuario, perfil, role, carregando: carregandoSessao } = useSessao();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [carregandoClientes, setCarregandoClientes] = useState(true);
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null);
  const [dialogAberto, setDialogAberto] = useState(false);

  const getOwnerId = () => {
    if (role === 'Admin') return usuario?.id || null; // Admin usa seu próprio ID
    if (role === 'Cliente') return (perfil as any)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id;
    return null;
  };

  const buscarClientes = async () => {
    const ownerId = getOwnerId();
    
    setCarregandoClientes(true);
    
    let query = supabase
      .from('clientes')
      .select('*')
      .order('nome', { ascending: true });

    if (ownerId) {
        // Admin, Cliente e Usuário agora usam ownerId para filtrar empresa_id
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
      setClientes(data as Cliente[]);
    }
    setCarregandoClientes(false);
  };

  useEffect(() => {
    if (!carregandoSessao && usuario) {
      buscarClientes();
    }
  }, [carregandoSessao, usuario, role]);

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
        <h1 className="text-2xl md:text-3xl font-bold">Meus Clientes</h1>
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
                  <TableHead className="hidden lg:table-cell">Telefone Fixo</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-4 text-muted-foreground">
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
                      <TableCell className="hidden lg:table-cell">{cliente.telefone_fixo || '-'}</TableCell>
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