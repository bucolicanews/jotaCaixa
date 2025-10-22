import { useState, useEffect } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Edit, CheckCircle2, ArrowUpCircle, Key, ArrowDownCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { AnyProfile, ClienteProfile, UsuarioProfile, AdminProfile } from '@/types/usuario';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import FormUsuario from '@/components/FormUsuario';
import { Badge } from '@/components/ui/badge';

const GerenciarUsuarios = () => {
  const { usuario, role, carregando, perfil } = useSessao();
  const [admins, setAdmins] = useState<AdminProfile[]>([]);
  const [clientes, setClientes] = useState<ClienteProfile[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioProfile[]>([]);
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [itemSelecionado, setItemSelecionado] = useState<AnyProfile | null>(null);
  const [dialogAberto, setDialogAberto] = useState(false);

  const isAdmin = role === 'Admin';
  const isClienteAprovado = role === 'Cliente' && (perfil as ClienteProfile)?.aprovado;

  const buscarDados = async () => {
    setCarregandoDados(true);
    if (isAdmin) {
      const [adminRes, clientesRes, usuariosRes] = await Promise.all([
        supabase.from('tbl_admins').select('*'),
        supabase.from('tbl_clientes').select('*').order('aprovado', { ascending: false }).order('nome'),
        supabase.from('tbl_usuarios').select('*').is('cliente_id', null)
      ]);

      if (adminRes.error || clientesRes.error || usuariosRes.error) {
        showError('Erro ao carregar dados.');
      } else {
        setAdmins(adminRes.data || []);
        setClientes(clientesRes.data || []);
        setUsuarios(usuariosRes.data || []);
      }
    } else if (isClienteAprovado) {
      const { data, error } = await supabase.from('tbl_usuarios').select('*').eq('cliente_id', usuario!.id);
      if (error) showError('Erro ao carregar usuários.');
      else setUsuarios(data || []);
    }
    setCarregandoDados(false);
  };

  useEffect(() => {
    if (!carregando && (isAdmin || isClienteAprovado)) {
      buscarDados();
    }
  }, [carregando, role, isAdmin, isClienteAprovado, usuario]);

  const handleAction = (action: () => void) => {
    setDialogAberto(false);
    setItemSelecionado(null);
    action();
    buscarDados();
  };

  const handleApprove = async (cliente: ClienteProfile) => {
    const { error } = await supabase.from('tbl_clientes').update({ aprovado: true }).eq('id', cliente.id);
    if (error) showError(`Falha ao aprovar: ${error.message}`);
    else handleAction(() => showSuccess(`${cliente.nome} aprovada.`));
  };

  const handlePromote = async (user: UsuarioProfile) => {
    const { error } = await supabase.rpc('request_client_promotion', { p_company_name: user.nome });
    if (error) showError(`Falha na promoção: ${error.message}`);
    else handleAction(() => showSuccess(`${user.nome} promovido a Cliente.`));
  };

  const handleDemote = async (cliente: ClienteProfile) => {
    const actionText = cliente.aprovado ? 'rebaixar' : 'reprovar';
    if (!window.confirm(`Tem certeza que deseja ${actionText} ${cliente.nome}?`)) return;
    const { error } = await supabase.rpc('demote_cliente_to_user', { p_cliente_id: cliente.id });
    if (error) showError(`Falha ao ${actionText}: ${error.message}`);
    else handleAction(() => showSuccess(`${cliente.nome} foi movido para usuários.`));
  };

  const handlePasswordReset = async (email: string) => {
    if (!window.confirm(`Enviar link de redefinição de senha para ${email}?`)) return;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/atualizar-senha` });
    if (error) showError(`Falha ao enviar email: ${error.message}`);
    else showSuccess(`Link enviado para ${email}.`);
  };

  if (carregando || carregandoDados) {
    return <LayoutPrincipal><div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></LayoutPrincipal>;
  }

  if (!isAdmin && !isClienteAprovado) {
    return <LayoutPrincipal><Card><CardHeader><CardTitle>Acesso Negado</CardTitle></CardHeader></Card></LayoutPrincipal>;
  }

  const renderTable = (title: string, data: AnyProfile[], type: 'admin' | 'cliente' | 'usuario') => (
    <Card className="mb-6">
      <CardHeader><CardTitle>{title} ({data.length})</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Email</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
          <TableBody>
            {data.map((item) => {
              if (!item) return null;
              const isClient = type === 'cliente';
              const clientProfile = item as ClienteProfile;
              return (
                <TableRow key={item.id}>
                  <TableCell>{item.nome}</TableCell><TableCell>{item.email}</TableCell>
                  <TableCell>
                    {type === 'admin' && <Badge variant="default">Admin</Badge>}
                    {isClient && <Badge variant={clientProfile.aprovado ? 'default' : 'destructive'}>{clientProfile.aprovado ? 'Cliente' : 'Pendente'}</Badge>}
                    {type === 'usuario' && <Badge variant="secondary">Usuário</Badge>}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    {isAdmin && type === 'cliente' && !clientProfile.aprovado && <Button variant="outline" size="sm" onClick={() => handleApprove(clientProfile)}><CheckCircle2 className="w-4 h-4 mr-2" />Aprovar</Button>}
                    {isAdmin && type === 'cliente' && <Button variant="outline" size="sm" onClick={() => handleDemote(clientProfile)}><ArrowDownCircle className="w-4 h-4 mr-2" />{clientProfile.aprovado ? 'Rebaixar' : 'Reprovar'}</Button>}
                    {isAdmin && type === 'usuario' && <Button variant="outline" size="sm" onClick={() => handlePromote(item as UsuarioProfile)}><ArrowUpCircle className="w-4 h-4 mr-2" />Promover</Button>}
                    {item.id !== usuario?.id && <Button variant="ghost" size="icon" onClick={() => handlePasswordReset(item.email)} title="Enviar reset de senha"><Key className="w-4 h-4" /></Button>}
                    <Button variant="ghost" size="icon" onClick={() => { setItemSelecionado(item); setDialogAberto(true); }} title="Editar"><Edit className="w-4 h-4" /></Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  return (
    <LayoutPrincipal>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">{isAdmin ? 'Gerenciar Contas' : 'Gerenciar Equipe'}</h1>
      </div>
      {isAdmin && renderTable('Administradores', admins, 'admin')}
      {isAdmin && renderTable('Clientes (Empresas)', clientes, 'cliente')}
      {isAdmin ? renderTable('Usuários Independentes', usuarios, 'usuario') : renderTable('Sua Equipe', usuarios, 'usuario')}
      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Conta</DialogTitle></DialogHeader>
          <FormUsuario criadorRole={role!} usuarioInicial={itemSelecionado} onSaveComplete={() => handleAction(() => {})} />
        </DialogContent>
      </Dialog>
    </LayoutPrincipal>
  );
};

export default GerenciarUsuarios;