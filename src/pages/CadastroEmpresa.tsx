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
    navegar('/login', { replace: true });
    return null;
  }

  if (empresaId) {
    navegar('/painel', { replace: true });
    return null;
  }

  const handleSaveComplete = () => {
    // A sessão já foi atualizada pelo refetch no FormEmpresa.
    // Agora, apenas navegamos para o painel.
    navegar('/painel', { replace: true });
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