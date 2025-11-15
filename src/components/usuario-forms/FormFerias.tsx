import React from 'react';
import GerenciarFerias from '@/components/formularios/GerenciarFerias';
import GerenciarFeriasAdmin from '@/components/formularios/GerenciarFeriasAdmin';
import { UsuarioProfile, AdminUsuarioProfile } from '@/types/usuario';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface FormFeriasProps {
  usuarioInicial: UsuarioProfile | AdminUsuarioProfile | null;
}

const FormFerias: React.FC<FormFeriasProps> = ({ usuarioInicial }) => {
  
  if (!usuarioInicial) {
      return (
          <Card><CardContent className="p-6">As configurações de férias estarão disponíveis após a criação do usuário.</CardContent></Card>
      );
  }
  
  // Determina se o usuário é um funcionário do Admin (tem admin_id e não cliente_id)
  const isUserOfAdmin = 'admin_id' in usuarioInicial && !!usuarioInicial.admin_id;
  
  // O ID do proprietário é o ID do Cliente ou Admin
  const proprietarioId = isUserOfAdmin 
    ? (usuarioInicial as AdminUsuarioProfile).admin_id 
    : (usuarioInicial as UsuarioProfile).cliente_id;

  if (!proprietarioId) {
      return (
          <Card><CardContent className="p-6">O perfil do funcionário não está vinculado a uma empresa/admin.</CardContent></Card>
      );
  }

  return (
    <div className="space-y-6">
        <Card>
            <CardHeader><CardTitle className="text-lg">Agendamento de Férias</CardTitle></CardHeader>
            <CardContent>
                {isUserOfAdmin ? (
                    <GerenciarFeriasAdmin
                        funcionarioId={usuarioInicial.id} 
                        adminId={proprietarioId} 
                    />
                ) : (
                    <GerenciarFerias 
                        funcionarioId={usuarioInicial.id} 
                        empresaId={proprietarioId} 
                    />
                )}
            </CardContent>
        </Card>
    </div>
  );
};

export default FormFerias;