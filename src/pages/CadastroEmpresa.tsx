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
    navegar('/login');
    return null;
  }

  if (empresaId) {
    navegar('/painel');
    return null;
  }

  const handleSaveComplete = () => {
    // Usamos window.location.replace para navegar para o painel e
    // substituir a página de cadastro no histórico do navegador.
    // Isso também força um recarregamento completo da aplicação,
    // garantindo que o hook useSessao busque os dados da nova empresa.
    window.location.replace('/painel');
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
              onSaveComplete={handleSaveComplete}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CadastroEmpresa;