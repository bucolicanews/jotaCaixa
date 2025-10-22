import { useNavigate } from 'react-router-dom';
import { useSessao } from '@/hooks/use-sessao';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import FormEmpresa from '@/components/FormEmpresa';

const CadastroEmpresa = () => {
  const { usuario, empresaId, carregando } = useSessao();
  const navegar = useNavigate();

  if (carregando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!usuario) {
    // Se não estiver logado, redireciona para o login
    navegar('/login');
    return null;
  }

  if (empresaId) {
    // Se já tiver uma empresa, redireciona para o painel
    navegar('/painel');
    return null;
  }

  const handleSaveComplete = () => {
    // Força um refresh para que o useSessao recarregue os dados, incluindo o novo empresaId
    // e o LayoutPrincipal possa redirecionar corretamente.
    window.location.href = '/painel';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-2xl">Primeiro Acesso: Cadastro da Empresa</CardTitle>
          <CardDescription>
            Para começar a usar o sistema, precisamos cadastrar a empresa que você irá gerenciar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {usuario && (
            <FormEmpresa 
              userId={usuario.id}
              onSaveComplete={handleSaveComplete}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CadastroEmpresa;