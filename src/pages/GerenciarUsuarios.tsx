import React, { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { useSessao } from '@/hooks/use-sessao';
import { Loader2, Plus, Search, Trash2, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import FormUsuario from '@/components/FormUsuario';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { AnyProfile, UsuarioProfile, UserRole } from '@/types/usuario';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const GerenciarUsuarios: React.FC = () => {
  const { usuario, perfil, role, carregando } = useSessao();
  const [usuarios, setUsuarios] = useState<AnyProfile[]>([]);
  const [carregandoUsuarios, setCarregandoUsuarios] = useState(true);
  const [filtro, setFiltro] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [usuarioParaEditar, setUsuarioParaEditar] = useState<AnyProfile | null>(null);

  const fetchUsuarios = useCallback(async () => {
    if (!usuario || !role) return;

    setCarregandoUsuarios(true);
    let query;

    if (role === 'Admin') {
      // ADMIN: Busca todos os Usuários (Funcionários) e o nome da empresa vinculada
      query = supabase.from('tbl_usuarios').select('*, tbl_clientes(nome)').order('nome', { ascending: true });
    } else if (role === 'Cliente') {
      // CLIENTE: Vê seus próprios Usuários (Funcionários)
      query = supabase.from('tbl_usuarios').select('*').eq('cliente_id', usuario.id).order('nome', { ascending: true });
    } else {
      setCarregandoUsuarios(false);
      return;
    }

    const { data, error } = await query;

    if (error) {
      showError('Erro ao carregar usuários: ' + error.message);
      setUsuarios([]);
    } else {
      // Mapeia os dados para garantir que o perfil seja do tipo correto
      const mappedData = data.map(item => {
        if (role === 'Admin' && item.tbl_clientes) {
          // Adiciona o nome da empresa ao perfil do usuário para exibição
          return { ...item, nome_empresa: item.tbl_clientes.nome } as UsuarioProfile & { nome_empresa: string };
        }
        return item as UsuarioProfile;
      });
      setUsuarios(mappedData as AnyProfile[]);
    }
    setCarregandoUsuarios(false);
  }, [usuario, role]);

  useEffect(() => {
    fetchUsuarios();
  }, [fetchUsuarios]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFiltro(e.target.value);
  };

  const filteredUsuarios = usuarios.filter(u => {
    if (!u) return false; 
    // Garante que nomeEmpresa é uma string antes de chamar toLowerCase()
    const nomeEmpresa = ('nome_empresa' in u && typeof u.nome_empresa === 'string') ? u.nome_empresa : '';
    return u.nome.toLowerCase().includes(filtro.toLowerCase()) ||
           u.email.toLowerCase().includes(filtro.toLowerCase()) ||
           nomeEmpresa.toLowerCase().includes(filtro.toLowerCase());
  });

  const handleDelete = async (id: string, nome: string, targetRole: UserRole) => {
    if (!window.confirm(`Tem certeza que deseja deletar a conta de ${nome}? Esta ação é irreversível.`)) return;

    try {
      const tableName = targetRole === 'Cliente' ? 'tbl_clientes' : 'tbl_usuarios';
      
      // 1. Deletar o registro do perfil
      const { error: profileError } = await supabase
        .from(tableName)
        .delete()
        .eq('id', id);

      if (profileError) throw profileError;
      
      showSuccess(`Conta de ${nome} deletada com sucesso.`);
      fetchUsuarios();
    } catch (error: any) {
      showError('Falha ao deletar conta: ' + error.message);
    }
  };

  const handleSaveComplete = () => {
    setIsDialogOpen(false);
    setUsuarioParaEditar(null);
    fetchUsuarios();
  };

  if (carregando) {
    return (
      <LayoutPrincipal>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </LayoutPrincipal>
    );
  }

  if (!usuario || !role || !perfil) {
    return (
      <LayoutPrincipal>
        <p>Acesso negado ou sessão não carregada.</p>
      </LayoutPrincipal>
    );
  }

  // Se for Admin, ele gerencia Usuários (Funcionários) de todas as empresas
  const isManagingClients = role === 'Admin';
  const targetRole = 'Usuario'; // Admin gerencia Usuários (Funcionários)
  const title = isManagingClients ? 'Gerenciar Usuários (Funcionários)' : 'Gerenciar Usuários (Equipe)';
  
  // Se o Admin está aqui, ele gerencia Usuários. Se o Cliente está aqui, ele gerencia Usuários.
  // A única exceção é se o Admin precisar gerenciar Clientes, mas isso deve ser em outra rota ou tab.
  // Mantendo a rota atual focada em Usuários (Funcionários) para ambos os perfis.

  return (
    <LayoutPrincipal>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">{title}</h1>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setUsuarioParaEditar(null)}>
              <Plus className="mr-2 h-4 w-4" />
              Novo {targetRole}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{usuarioParaEditar ? `Editar ${targetRole}` : `Criar Novo ${targetRole}`}</DialogTitle>
            </DialogHeader>
            <FormUsuario 
              criadorRole={role}
              criadorPerfil={perfil}
              clienteId={role === 'Cliente' ? usuario.id : undefined}
              usuarioInicial={usuarioParaEditar}
              onSaveComplete={handleSaveComplete}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex mb-4 space-x-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={`Buscar por nome, email ou empresa...`}
            value={filtro}
            onChange={handleSearch}
            className="pl-10"
          />
        </div>
      </div>

      {carregandoUsuarios ? (
        <div className="flex justify-center items-center h-40">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filteredUsuarios.length === 0 ? (
        <p className="text-center text-muted-foreground">Nenhum {targetRole} encontrado.</p>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                {role === 'Admin' && <TableHead>Empresa</TableHead>}
                <TableHead>Início Contrato</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsuarios.map((u) => {
                if (!u || !('cliente_id' in u)) return null; // Garante que é um UsuarioProfile
                const userProfile = u as UsuarioProfile & { nome_empresa?: string };
                
                return (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    {userProfile.nome}
                  </TableCell>
                  <TableCell>{userProfile.email}</TableCell>
                  {role === 'Admin' && (
                    <TableCell className="text-sm text-muted-foreground">{userProfile.nome_empresa || 'N/A'}</TableCell>
                  )}
                  <TableCell>
                      {userProfile.data_inicio_contrato 
                          ? format(new Date(userProfile.data_inicio_contrato!), 'dd/MM/yyyy', { locale: ptBR })
                          : 'N/A'}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button 
                      variant="outline" 
                      size="icon" 
                      onClick={() => {
                        setUsuarioParaEditar(u);
                        setIsDialogOpen(true);
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="destructive" 
                      size="icon" 
                      onClick={() => handleDelete(u.id, u.nome, 'Usuario')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              )})}
            </TableBody>
          </Table>
        </div>
      )}
    </LayoutPrincipal>
  );
};

export default GerenciarUsuarios;