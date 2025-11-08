import React from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { useSessao } from '@/hooks/use-sessao';
import { Loader2 } from 'lucide-react';
import FormPerfil from '@/components/formularios/FormPerfil';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { showSuccess } from '@/utils/toast'; // showError e supabase removidos
import { AnyProfile } from '@/types/usuario';

const Perfil: React.FC = () => {
  // 'role' removido, 'refreshSessao' renomeado para 'refetch'
  const { perfil, carregando, refetch } = useSessao(); 

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

  return (
    <LayoutPrincipal>
      <h1 className="text-2xl md:text-3xl font-bold mb-6">Meu Perfil</h1>
      
      <FormPerfil 
        perfilInicial={perfil as AnyProfile} 
        onSaveComplete={handleSaveComplete}
      />
    </LayoutPrincipal>
  );
};

export default Perfil;