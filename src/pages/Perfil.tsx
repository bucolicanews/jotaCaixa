import React from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { useSessao } from '@/hooks/use-sessao';
import { Loader2 } from 'lucide-react';
import FormPerfil from '@/components/FormPerfil';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { showSuccess } from '@/utils/toast'; // Removido showError
// import { supabase } from '@/integrations/supabase/client'; // Removido
import { AnyProfile } from '@/types/usuario';

const Perfil: React.FC = () => {
  // Removido 'role' e ajustado para usar apenas as variáveis necessárias
  const { perfil, carregando, refreshSessao } = useSessao(); 

  const handleSaveComplete = async () => {
    showSuccess('Perfil atualizado com sucesso!');
    // refreshSessao é usado aqui, corrigindo o TS2339 (assumindo que o hook foi atualizado)
    await refreshSessao(); 
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