import { useState, useEffect } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Edit, Trash2, PlusCircle, ShieldAlert } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { AnyProfile, ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import FormUsuario from '@/components/FormUsuario';
import { Badge } from '@/components/ui/badge';

const GerenciarUsuarios = () => {
  const { usuario, role, carregando } = useSessao();
  const [itens, setItens] = useState<AnyProfile[]>([]);
  const [cliente, setCliente] = useState<ClienteProfile | null>(null);
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [itemSelecionado, setItemSelecionado] = useState<AnyProfile | null>(null);
  const [dialogAberto, setDialogAberto] = useState(false);

  const isAdmin = role === 'Admin';
  const isCliente = role === 'Cliente';
  const limiteAtingido = isCliente && cliente && itens.length >= cliente.limite_usuarios;

  useEffect(() => {
    if (!carregando && (isAdmin || isCliente)) {
      buscarDados();
    } else if (!carregando) {
      setCarregandoDados(false);
    }
  }, [carregando, role, isAdmin, isCliente]);

  const buscarDados = async () => {
    setCarregandoDados(true);
    if (isAdmin) {
      const { data, error } = await supabase.from('tbl_clientes').select('*').order('nome');
      if (error) showError('Erro ao carregar clientes: ' + error.message);
      else setItens((data as ClienteProfile[]) || []);
    } else if (isCliente) {
      const { data: clienteData, error: clienteError } = await supabase.from('tbl_clientes').select('*').eq('id', usuario!.id).single();
      if (clienteError) showError('Erro ao carregar dados do cliente: ' + clienteError.message);
      else setCliente(clienteData as ClienteProfile);

      const { data: usuariosData, error: usuariosError } = await supabase.from('tbl_usuarios').select('*').eq('cliente_id', usuario!.id).order('nome');
      if (usuariosError) showError('Erro ao carregar usuários: ' + usuariosError.message);
      else setItens((usuariosData as UsuarioProfile[]) || []);
    }
    setCarregandoDados(false);
  };

  const handleSaveComplete = () => {
    setDialogAberto(false);
    setItemSelecionado(null);
    buscarDados();
  };

  const handleEdit = (item: AnyProfile) => {
    setItemSelecionado(item);
    setDialogAberto(true);
  };

  const handleDelete = async (item: AnyProfile) => {
    if (!item) return;
    if (!window.confirm(`Tem certeza que deseja excluir ${item.nome}? Esta ação é irreversível.`)) return;

    const tableName = isAdmin ? 'tbl_clientes' : 'tbl_usuarios';
    const { error } = await supabase.from(tableName).delete().eq('id', item.id);

    if (error) {
      showError(`Falha ao excluir: ${error.message}`);
    } else {
      showSuccess(`${isAdmin ? 'Cliente' : 'Usuário'} excluído com sucesso.`);
      buscarDados();
    }
  };

  if (carregando || carregandoDados) {
    return <LayoutPrincipal><div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></LayoutPrincipal>;
  }

  if (!isAdmin && !isCliente) {
    return (
      <LayoutPrincipal>
        <Card className="w-full max-w-lg mx-auto">
          <CardHeader className="text-center">
            <ShieldAlert className="w-12 h-12 mx-auto text-destructive" />
            <CardTitle className="mt-4 text-2xl">Acesso Negado</CardTitle>
            <CardDescription>Você não tem permissão para acessar esta página.</CardDescription>
          </CardHeader>
        </Card>
      </LayoutPrincipal>
    );
  }

  return (
    <LayoutPrincipal>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">{isAdmin ? 'Gerenciar Clientes' : 'Gerenciar Usuários'}</h1>
        <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
          <DialogTrigger asChild>
            <Button onClick={() => setItemSelecionado(null)} disabled={!!limiteAtingido}>
              <PlusCircle className="w-4 h-4 mr-2" />
              {isAdmin ? 'Novo Cliente' : 'Novo Usuário'}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{itemSelecionado ? 'Editar' : 'Novo'} {isAdmin ? 'Cliente' : 'Usuário'}</DialogTitle>
            </DialogHeader>
            {role && (
              <FormUsuario
                criadorRole={role}
                clienteId={isCliente ? usuario?.id : undefined}
                usuarioInicial={itemSelecionado}
                onSaveComplete={handleSaveComplete}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{isAdmin ? `Clientes (${itens.length})` : `Usuários (${itens.length})`}</CardTitle>
          {isCliente && cliente && (
            <CardDescription>
              Limite de usuários: {itens.length} / {cliente.limite_usuarios}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isAdmin ? 'Cliente' : 'Usuário'}</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-center">Perfil</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itens.map((item) => {
                if (!item) return null;
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.nome}</TableCell>
                    <TableCell>{item.email}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={isAdmin ? 'default' : 'secondary'}>
                        {isAdmin ? 'Cliente' : 'Usuário'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(item)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(item)}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </LayoutPrincipal>
  );
};

export default GerenciarUsuarios;