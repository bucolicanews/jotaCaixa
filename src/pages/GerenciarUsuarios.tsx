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
  const [usuarios, setUsuarios] = useState<PerfilUsuario[]>([]);
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [usuarioSelecionado, setUsuarioSelecionado] = useState<PerfilUsuario | null>(null);
  const [dialogAberto, setDialogAberto] = useState(false);

  const isAdmin = perfil?.tbl_perfil?.nome === 'Admin';

  useEffect(() => {
    if (!carregando && isAdmin) {
      buscarDados();
    } else if (!carregando && !isAdmin) {
      setCarregandoDados(false);
    }
  }, [carregando, perfil, isAdmin]);

  const buscarDados = async () => {
    setCarregandoDados(true);
    
    const { data, error } = await supabase.from('usuarios').select('*, tbl_perfil(nome)').neq('id', perfil!.id).order('nome');
    if (error) {
      showError('Erro ao carregar usuários: ' + error.message);
    } else {
      setUsuarios(data as PerfilUsuario[]);
    }

    setCarregandoDados(false);
  };

  const handleSaveComplete = () => {
    setDialogAberto(false);
    setUsuarioSelecionado(null);
    buscarDados();
  };

  const handleEdit = (usuario: PerfilUsuario) => {
    setUsuarioSelecionado(usuario);
    setDialogAberto(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este usuário? Esta ação é irreversível.')) return;
    
    const { error } = await supabase.from('usuarios').delete().eq('id', id);

    if (error) {
      showError('Erro ao excluir usuário: ' + error.message);
    } else {
      showSuccess('Usuário excluído com sucesso.');
      buscarDados();
    }
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

  if (!isAdmin) {
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
        <h1 className="text-3xl font-bold">Gerenciar Usuários</h1>
        <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
          <DialogTrigger asChild>
            <Button onClick={() => setUsuarioSelecionado(null)}>
              <PlusCircle className="w-4 h-4 mr-2" />
              Novo Usuário
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{usuarioSelecionado ? 'Editar Usuário' : 'Novo Usuário'}</DialogTitle>
            </DialogHeader>
            {perfil && (
              <FormUsuario 
                perfilLogado={perfil}
                usuarioInicial={usuarioSelecionado}
                onSaveComplete={handleSaveComplete}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Usuários Cadastrados ({usuarios.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="w-[150px] text-center">Perfil</TableHead>
                  <TableHead className="w-[100px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usuarios.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.nome}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={user.tbl_perfil?.nome === 'Admin' ? 'destructive' : user.tbl_perfil?.nome === 'Empresa' ? 'default' : 'secondary'}>
                        {user.tbl_perfil?.nome}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end space-x-2">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(user)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(user.id)}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </LayoutPrincipal>
  );
};

export default GerenciarUsuarios;