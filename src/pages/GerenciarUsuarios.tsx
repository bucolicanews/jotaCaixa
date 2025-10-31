import React, { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { useSessao } from '@/hooks/use-sessao';
import { Loader2, Plus, Search, Trash2, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import FormUsuario from '@/components/FormUsuario';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { AnyProfile, ClienteProfile, UsuarioProfile, UserRole } from '@/types/usuario';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const GerenciarUsuarios: React.FC = () => {
  const { usuario, perfil, role, carregando } = useSessao(); // Adicionando 'perfil'
  const [usuarios, setUsuarios] = useState<AnyProfile[]>([]);
// ... (restante do código permanece inalterado até o retorno)

  if (!usuario || !role || !perfil) { // Garantindo que o perfil também exista
    return (
      <LayoutPrincipal>
        <p>Acesso negado ou sessão não carregada.</p>
      </LayoutPrincipal>
    );
  }

  const isManagingClients = role === 'Admin';
  const targetRole = isManagingClients ? 'Cliente' : 'Usuario';
  const title = isManagingClients ? 'Gerenciar Clientes (Empresas)' : 'Gerenciar Usuários (Equipe)';

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
              criadorPerfil={perfil} // Usando 'perfil' (AnyProfile) em vez de 'usuario' (User)
              clienteId={role === 'Cliente' ? usuario.id : undefined}
              usuarioInicial={usuarioParaEditar}
              onSaveComplete={handleSaveComplete}
            />
          </DialogContent>
        </Dialog>
      </div>
// ... (restante do arquivo)