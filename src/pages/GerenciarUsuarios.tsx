import { useState, useEffect } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Edit, Trash2, PlusCircle, ShieldAlert } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { PerfilUsuario } from '@/types/usuario';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import FormUsuario from '@/components/FormUsuario';
import { Badge } from '@/components/ui/badge';

const GerenciarUsuarios = () => {
  const { perfil, carregando } = useSessao();
  const [itens, setItens] = useState<any[]>([]); // Pode ser Clientes ou Usuários
  const [cliente, setCliente] = useState<any>(null); // Dados do cliente logado
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [itemSelecionado, setItemSelecionado] = useState<any | null>(null);
  const [dialogAberto, setDialogAberto] = useState(false);

  const isAdmin = perfil?.tbl_perfil?.nome === 'Admin';
  const isCliente = perfil?.tbl_perfil?.nome === 'Cliente';
  const limiteAtingido = isCliente && cliente && itens.length >= cliente.limite_usuarios;

  useEffect(() => {
    if (!carregando && perfil) {
      buscarDados();
    }
  }, [carregando, perfil]);

  const buscarDados = async () => {
    setCarregandoDados(true);
    if (isAdmin) {
      const { data, error } = await supabase.from('clientes').select('*, usuario:usuarios(*, tbl_perfil(nome))');
      if (error) showError('Erro ao carregar clientes: ' + error.message);
      else setItens(data || []);
    } else if (isCliente) {
      const { data: clienteData, error: clienteError } = await supabase.from('clientes').select('*').eq('usuario_id', perfil!.id).single();
      if (clienteError) {
        showError('Erro ao carregar dados do cliente: ' + clienteError.message);
        setCarregandoDados(false);
        return;
      }
      setCliente(clienteData);

      const { data: usuariosData, error: usuariosError } = await supabase.from('usuarios').select('*, tbl_perfil(nome)').eq('cliente_id', clienteData.id);
      if (usuariosError) showError('Erro ao carregar usuários: ' + usuariosError.message);
      else setItens(usuariosData || []);
    }
    setCarregandoDados(false);
  };

  const handleSaveComplete = () => {
    setDialogAberto(false);
    setItemSelecionado(null);
    buscarDados();
  };

  const handleEdit = (item: any) => {
    const userToEdit = isAdmin ? item.usuario : item;
    setItemSelecionado(userToEdit);
    setDialogAberto(true);
  };

  const handleDelete = async (user: PerfilUsuario) => {
    if (!window.confirm(`Tem certeza que deseja excluir o usuário ${user.nome}? Esta ação não pode ser desfeita.`)) return;

    // Deleta o registro da tabela 'usuarios'.
    // NOTA: Isso não remove o usuário do sistema de autenticação do Supabase (auth.users).
    // Para uma exclusão completa e segura, uma Edge Function com a service_role_key seria necessária.
    const { error } = await supabase
      .from('usuarios')
      .delete()
      .eq('id', user.id);

    if (error) {
      showError('Erro ao excluir usuário: ' + error.message);
    } else {
      showSuccess('Usuário excluído com sucesso.');
      buscarDados(); // Atualiza a lista de usuários.
    }
  };

  if (carregando || carregandoDados) {
    return <LayoutPrincipal><div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div></LayoutPrincipal>;
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
            <Button onClick={() => setItemSelecionado(null)} disabled={limiteAtingido}>
              <PlusCircle className="w-4 h-4 mr-2" />
              {isAdmin ? 'Novo Cliente' : 'Novo Usuário'}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{itemSelecionado ? 'Editar' : 'Novo'} {isAdmin ? 'Cliente' : 'Usuário'}</DialogTitle>
            </DialogHeader>
            {perfil && (
              <FormUsuario
                perfilLogado={perfil}
                clienteId={isCliente ? cliente.id : null}
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
                const user = isAdmin ? item.usuario : item;
                return (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.nome}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={user.tbl_perfil.nome === 'Admin' ? 'destructive' : user.tbl_perfil.nome === 'Cliente' ? 'default' : 'secondary'}>
                        {user.tbl_perfil.nome}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(user)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(user)}>
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