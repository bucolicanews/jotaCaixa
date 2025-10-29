import LayoutPrincipal from '@/components/LayoutPrincipal';
import { useSessao } from '@/hooks/use-sessao';
import { Loader2 } from 'lucide-react';
import FormPerfil from '@/components/FormPerfil';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { showError } from '@/utils/toast';

const Perfil = () => {
  const { perfil, role, carregando, refetch } = useSessao();

  if (carregando) {
    return (
      <LayoutPrincipal>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </LayoutPrincipal>
    );
  }

  if (!perfil || !role) {
    showError('Não foi possível carregar os dados do perfil.');
    return <LayoutPrincipal><Card><CardHeader><CardTitle>Erro</CardTitle></CardHeader><CardContent>Perfil não encontrado.</CardContent></Card></LayoutPrincipal>;
  }

  return (
    <LayoutPrincipal>
      <h1 className="text-2xl md:text-3xl font-bold mb-6">Meu Perfil</h1>
      <div className="max-w-lg mx-auto">
        <FormPerfil 
          perfil={perfil} 
          role={role} 
          onSaveComplete={refetch} 
        />
      </div>
    </LayoutPrincipal>
  );
};

export default Perfil;