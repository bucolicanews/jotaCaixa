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
    if (role === 'Admin' || role === 'Cliente') return (perfil as any)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id;
    return null;
  };

  const buscarClientes = async () => {
    const ownerId = getOwnerId();
    if (!ownerId) {
      setCarregandoClientes(false);
      return;
    }

    setCarregandoClientes(true);
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .eq('empresa_id', ownerId)
      .order('nome', { ascending: true });

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
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Meus Clientes</h1>
        <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
          <DialogTrigger asChild>
            <Button onClick={() => setClienteSelecionado(null)}>
              <PlusCircle className="w-4 h-4 mr-2" />
              Novo Cliente
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                    Nenhum cliente cadastrado.
                  </TableCell>
                </TableRow>
              ) : (
                clientes.map((cliente) => (
                  <TableRow key={cliente.id}>
                    <TableCell className="font-medium">{cliente.nome}</TableCell>
                    <TableCell>{cliente.email || '-'}</TableCell>
                    <TableCell>{cliente.telefone || '-'}</TableCell>
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
        </CardContent>
      </Card>
    </LayoutPrincipal>
  );
};

export default ClientesPage;