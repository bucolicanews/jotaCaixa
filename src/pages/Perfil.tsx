import React from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { useSessao } from '@/hooks/use-sessao';
import { Loader2 } from 'lucide-react';
import FormPerfil from '@/components/formularios/FormPerfil';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { showSuccess } from '@/utils/toast';
import { AnyProfile } from '@/types/usuario';
import FormUsuario from '@/components/formularios/FormUsuario'; // Importando FormUsuario

const Perfil: React.FC = () => {
  const { perfil, carregando, refetch, role } = useSessao(); 

  const handleSaveComplete = async () => {
    showSuccess('Perfil atualizado com sucesso!');
    await refetch();
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

  if (!perfil) {
    return (
      <LayoutPrincipal>
        <Card>
          <CardHeader>
            <CardTitle>Erro de Perfil</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Não foi possível carregar os dados do perfil.</p>
          </CardContent>
        </Card>
      </LayoutPrincipal>
    );
  }
  
  // Se for Admin ou Cliente, usa o FormPerfil original (que lida com a estrutura de Cliente/Admin)
  if (role === 'Admin' || role === 'Cliente') {
      return (
        <LayoutPrincipal>
          <h1 className="text-2xl md:text-3xl font-bold mb-6">Meu Perfil</h1>
          
          <FormPerfil 
            perfilInicial={perfil as AnyProfile} 
            onSaveComplete={handleSaveComplete}
          />
        </LayoutPrincipal>
      );
  }
  
  // Se for Usuário (Funcionário), usa o FormUsuario no modo de edição
  if (role === 'Usuario') {
      // O usuário pode editar o próprio perfil, então isReadOnly é false
      const isReadOnly = false; 
      
      return (
        <LayoutPrincipal>
          <h1 className="text-2xl md:text-3xl font-bold mb-6">Meu Perfil (Funcionário)</h1>
          
          <FormUsuario
            criadorRole={role!}
            criadorPerfil={perfil}
            usuarioInicial={perfil}
            onSaveComplete={handleSaveComplete}
            isReadOnly={isReadOnly} // Passando a flag de somente leitura
          />
        </LayoutPrincipal>
      );
  }

  return null;
};

export default Perfil;