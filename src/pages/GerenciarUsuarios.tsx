import { useState, useEffect } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Edit, Trash2, PlusCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { PerfilUsuario } from '@/types/usuario';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import FormUsuario from '@/components/FormUsuario';
import { Badge } from '@/components/ui/badge';

// Limite de usuários para o perfil Cliente (exemplo)
const LIMITE_USUARIOS_CLIENTE = 5;

const GerenciarUsuarios = () => {
  const { perfil, empresaId, carregando } = useSessao();
  const [usuarios, setUsuarios] = useState<PerfilUsuario[]>([]);
  const [carregandoUsuarios, setCarregandoUsuarios] = useState(true);
  const [usuarioSelecionado, setUsuarioSelecionado] = useState<PerfilUsuario | null>(null);
  const [dialogAberto, setDialogAberto] = useState(false);

  const isCliente = perfil?.tipo_usuario === 'Cliente';
  const isAdmin = perfil?.tipo_usuario === 'Admin';
  const podeCadastrar = isAdmin || isCliente;
  const limiteAtingido = isCliente && usuarios.length >= LIMITE_USUARIOS_CLIENTE;

  useEffect(() => {
    if (!carregando && perfil) {
      buscarUsuarios();
    }
  }, [carregando, perfil, empresaId]);

  const buscarUsuarios = async () => {
    setCarregandoUsuarios(true);
    
    let query = supabase
      .from('usuarios')
      .select('*')
      .order('nome', { ascending: true });

    // Se for Cliente, só pode ver usuários da sua empresa (Funcionários)
    if (isCliente && empresaId) {
      // Nota: Assumindo que a tabela 'usuarios' não tem 'empresa_id' diretamente.
      // Para um Cliente gerenciar seus funcionários, precisamos de uma tabela de vínculo ou RLS mais complexo.
      // Por simplicidade, vamos assumir que o Cliente só pode ver usuários que ele mesmo cadastrou (se o RLS permitir).
      // Para este MVP, vamos listar todos os usuários que não são Admin, se o usuário logado for Cliente.
      // **AVISO:** A lógica de RLS no Supabase deve garantir que o Cliente só veja seus próprios funcionários.
      // Como não temos uma tabela de vínculo Empresa-Usuário para Funcionários, vamos listar todos os usuários que não são Admin.
      // Em um sistema real, precisaríamos de uma coluna 'empresa_id' na tabela 'usuarios' ou uma tabela de relacionamento.
      
      // Para fins de demonstração, vamos buscar todos os usuários que não são Admin.
      query = query.neq('tipo_usuario', 'Admin');
    } else if (isAdmin) {
      // Admin vê todos
    } else {
      // Outros perfis não devem estar aqui, mas se estiverem, não veem nada.
      setUsuarios([]);
      setCarregandoUsuarios(false);
      return;
    }

    const { data, error } = await query;

    if (error) {
      showError('Erro ao carregar usuários: ' + error.message);
      setUsuarios([]);
    } else {
      setUsuarios(data as PerfilUsuario[]);
    }
    setCarregandoUsuarios(false);
  };

  const handleSaveComplete = () => {
    setDialogAberto(false);
    setUsuarioSelecionado(null);
    buscarUsuarios();
  };

  const handleEdit = (usuario: PerfilUsuario) => {
    setUsuarioSelecionado(usuario);
    setDialogAberto(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este usuário? Esta ação é irreversível.')) return;

    // Nota: Excluir um usuário da tabela 'usuarios' não exclui o registro em 'auth.users'.
    // Para exclusão completa, seria necessário usar a Service Role Key (apenas em Edge Functions ou Backend).
    // Aqui, vamos apenas remover o perfil, o que o impede de usar o sistema devido à falta de perfil.
    
    const { error } = await supabase
      .from('usuarios')
      .delete()
      .eq('id', id);

    if (error) {
      showError('Erro ao excluir usuário: ' + error.message);
    } else {
      showSuccess('Usuário excluído com sucesso.');
      buscarUsuarios(); // Rebusca a lista
    }
  };

  if (carregando || carregandoUsuarios) {
    return (
      <LayoutPrincipal>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </LayoutPrincipal>
    );
  }

  if (!podeCadastrar) {
    return (
      <LayoutPrincipal>
        <Card>
          <CardHeader><CardTitle>Acesso Negado</CardTitle></CardHeader>
          <CardContent><p className="text-red-500">Você não tem permissão para gerenciar usuários.</p></CardContent>
        </Card>
      </LayoutPrincipal>
    );
  }

  return (
    <LayoutPrincipal>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Gerenciar Usuários</h1>
        <div className="space-x-2">
          <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
            <DialogTrigger asChild>
              <Button 
                onClick={() => setUsuarioSelecionado(null)}
                disabled={limiteAtingido}
              >
                <PlusCircle className="w-4 h-4 mr-2" />
                Novo Usuário
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>{usuarioSelecionado ? 'Editar Usuário' : 'Novo Usuário'}</DialogTitle>
              </DialogHeader>
              {perfil && empresaId && (
                <FormUsuario 
                  empresaId={empresaId}
                  perfilLogado={perfil.tipo_usuario}
                  usuarioInicial={usuarioSelecionado}
                  onSaveComplete={handleSaveComplete}
                />
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {limiteAtingido && (
        <div className="mb-4 p-3 bg-yellow-100 border border-yellow-400 text-yellow-700 rounded-md">
          <p className="text-sm font-medium">Limite de usuários atingido ({usuarios.length}/{LIMITE_USUARIOS_CLIENTE}). Exclua um usuário existente para cadastrar um novo.</p>
        </div>
      )}

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
                  <TableHead className="w-[150px] text-center">Tipo</TableHead>
                  <TableHead className="w-[100px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usuarios.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                      Nenhum usuário encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  usuarios.map((user) => (
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
                          {/* Admin não pode ser excluído por Cliente/Funcionário */}
                          {user.tipo_usuario !== 'Admin' && (
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(user.id)}>
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          )}
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

export default GerenciarUsuarios;