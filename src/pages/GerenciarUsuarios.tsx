import { useState, useEffect } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Edit, Trash2, PlusCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { PerfilUsuario } from '@/types/usuario';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import FormUsuario from '@/components/FormUsuario';
import { Badge } from '@/components/ui/badge';

const GerenciarUsuarios = () => {
  const { perfil, empresaId, carregando } = useSessao();
  const [usuarios, setUsuarios] = useState<PerfilUsuario[]>([]);
  const [limiteUsuarios, setLimiteUsuarios] = useState(0);
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [usuarioSelecionado, setUsuarioSelecionado] = useState<PerfilUsuario | null>(null);
  const [dialogAberto, setDialogAberto] = useState(false);

  const isCliente = perfil?.tipo_usuario === 'Cliente';
  const isAdmin = perfil?.tipo_usuario === 'Admin';
  const limiteAtingido = isCliente && usuarios.length >= limiteUsuarios;

  useEffect(() => {
    if (!carregando && perfil) {
      buscarDados();
    }
  }, [carregando, perfil, empresaId]);

  const buscarDados = async () => {
    setCarregandoDados(true);
    
    if (isCliente && empresaId) {
      // Cliente busca seus funcionários e o limite da sua empresa
      const [usuariosResult, empresaResult] = await Promise.all([
        supabase.from('usuarios').select('*').eq('empresa_id', empresaId).order('nome'),
        supabase.from('empresas').select('limite_usuarios').eq('id', empresaId).single()
      ]);

      if (usuariosResult.error) showError('Erro ao carregar usuários: ' + usuariosResult.error.message);
      else setUsuarios(usuariosResult.data as PerfilUsuario[]);

      if (empresaResult.error) showError('Erro ao carregar limite da empresa: ' + empresaResult.error.message);
      else setLimiteUsuarios(empresaResult.data?.limite_usuarios || 0);

    } else if (isAdmin) {
      // Admin busca todos os usuários (exceto ele mesmo, opcionalmente)
      const { data, error } = await supabase.from('usuarios').select('*').neq('id', perfil!.id).order('nome');
      if (error) showError('Erro ao carregar usuários: ' + error.message);
      else setUsuarios(data as PerfilUsuario[]);
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
    
    // Idealmente, isso seria uma chamada para uma Edge Function com a Service Role Key
    // para deletar o usuário do `auth.users` também.
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

  return (
    <LayoutPrincipal>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Gerenciar Usuários</h1>
        <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
          <DialogTrigger asChild>
            <Button onClick={() => setUsuarioSelecionado(null)} disabled={limiteAtingido}>
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
                empresaId={empresaId}
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
          {isCliente && (
            <CardDescription>
              Você pode cadastrar até {limiteUsuarios} usuários. ({usuarios.length} / {limiteUsuarios})
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="w-[150px] text-center">Tipo</TableHead>
                  <TableHead className="w-[100px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usuarios.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.nome}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={user.tipo_usuario === 'Admin' ? 'destructive' : user.tipo_usuario === 'Cliente' ? 'default' : 'secondary'}>
                        {user.tipo_usuario}
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