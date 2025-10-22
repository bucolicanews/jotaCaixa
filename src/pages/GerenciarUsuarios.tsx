import { useState, useEffect } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Edit, Trash2, PlusCircle, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { AnyProfile, ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import FormUsuario from '@/components/FormUsuario';
import { Badge } from '@/components/ui/badge';

const GerenciarUsuarios = () => {
  const { usuario, role, carregando, perfil } = useSessao();
  const [itens, setItens] = useState<AnyProfile[]>([]);
  const [cliente, setCliente] = useState<ClienteProfile | null>(null);
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [itemSelecionado, setItemSelecionado] = useState<AnyProfile | null>(null);
  const [dialogAberto, setDialogAberto] = useState(false);

  const isAdmin = role === 'Admin';
  const isCliente = role === 'Cliente' && (perfil as ClienteProfile)?.aprovado;

  const buscarDados = async () => {
    setCarregandoDados(true);
    if (isAdmin) {
      const { data: clientes, error: errClientes } = await supabase.from('tbl_clientes').select('*').order('aprovado', { ascending: true }).order('nome');
      const { data: usuarios, error: errUsuarios } = await supabase.from('tbl_usuarios').select('*').is('cliente_id', null);
      
      if (errClientes || errUsuarios) {
        showError('Erro ao carregar dados.');
      } else {
        const todos = [...(clientes || []), ...(usuarios || [])];
        setItens(todos);
      }
    } else if (isCliente) {
      const { data: clienteData, error: errCliente } = await supabase.from('tbl_clientes').select('*').eq('id', usuario!.id).single();
      if (errCliente) showError('Erro ao carregar dados do cliente.');
      else setCliente(clienteData as ClienteProfile);

      const { data: usuariosData, error: errUsuarios } = await supabase.from('tbl_usuarios').select('*').eq('cliente_id', usuario!.id);
      if (errUsuarios) showError('Erro ao carregar usuários.');
      else setItens((usuariosData as UsuarioProfile[]) || []);
    }
    setCarregandoDados(false);
  };

  useEffect(() => {
    if (!carregando && (isAdmin || isCliente)) {
      buscarDados();
    }
  }, [carregando, role, isAdmin, isCliente, usuario]);

  const handleApprove = async (cliente: ClienteProfile) => {
    if (!window.confirm(`Tem certeza que deseja aprovar a empresa ${cliente.nome}?`)) return;
    const { error } = await supabase
      .from('tbl_clientes')
      .update({ aprovado: true })
      .eq('id', cliente.id);
    
    if (error) {
      showError(`Falha ao aprovar: ${error.message}`);
    } else {
      showSuccess(`${cliente.nome} aprovada com sucesso.`);
      buscarDados();
    }
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

    const isClient = 'aprovado' in item;
    const tableName = isClient ? 'tbl_clientes' : 'tbl_usuarios';
    
    const { error } = await supabase.from(tableName).delete().eq('id', item.id);

    if (error) {
      showError(`Falha ao excluir: ${error.message}`);
    } else {
      showSuccess(`${isClient ? 'Cliente' : 'Usuário'} excluído com sucesso.`);
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
        <h1 className="text-3xl font-bold">{isAdmin ? 'Gerenciar Contas' : 'Gerenciar Equipe'}</h1>
        <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
          <DialogTrigger asChild>
            <Button onClick={() => setItemSelecionado(null)} disabled={!!(cliente && itens.length >= cliente.limite_usuarios)}>
              <PlusCircle className="w-4 h-4 mr-2" />
              {isCliente ? 'Novo Usuário' : 'Novo Cliente'}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{itemSelecionado ? 'Editar' : 'Novo'} {isCliente ? 'Usuário' : 'Cliente'}</DialogTitle></DialogHeader>
            <FormUsuario 
              criadorRole={role!} 
              clienteId={isCliente ? usuario?.id : undefined} 
              usuarioInicial={itemSelecionado}
              onSaveComplete={handleSaveComplete} 
            />
          </DialogContent>
        </Dialog>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{isAdmin ? `Contas (${itens.length})` : `Sua Equipe (${itens.length})`}</CardTitle>
          {isCliente && cliente && <CardDescription>Limite: {itens.length} / {cliente.limite_usuarios}</CardDescription>}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Email</TableHead><TableHead>Perfil / Status</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
            <TableBody>
              {itens.map((item) => {
                if (!item) return null;
                const isClient = 'aprovado' in item;
                return (
                  <TableRow key={item.id}>
                    <TableCell>{item.nome}</TableCell>
                    <TableCell>{item.email}</TableCell>
                    <TableCell>
                      {isClient ? (
                        <Badge variant={item.aprovado ? 'default' : 'destructive'}>
                          {item.aprovado ? 'Cliente' : 'Pendente'}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Usuário</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isAdmin && isClient && !item.aprovado && (
                        <Button variant="outline" size="sm" onClick={() => handleApprove(item as ClienteProfile)} className="mr-2">
                          <CheckCircle2 className="w-4 h-4 mr-2" /> Aprovar
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(item)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
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