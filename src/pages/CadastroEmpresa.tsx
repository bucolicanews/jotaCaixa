import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessao } from '@/hooks/use-sessao';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import FormEmpresa from '@/components/FormEmpresa';

const CadastroEmpresa = () => {
  const { usuario, empresaId, carregando, refetch } = useSessao();
  const navegar = useNavigate();

  // Este efeito monitora o 'empresaId'. Assim que ele for preenchido,
  // a navegação para o painel é acionada.
  useEffect(() => {
    if (empresaId) {
      navegar('/painel', { replace: true });
    }
  }, [empresaId, navegar]);

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

  // Se o empresaId já existe, o useEffect acima cuidará do redirecionamento.
  // Retornamos null para evitar que o formulário apareça rapidamente.
  if (empresaId) {
    return null;
  }

  const handleSaveComplete = async () => {
    // Após o formulário ser salvo com sucesso, chamamos o refetch aqui.
    // Isso atualizará o estado da sessão, preenchendo o 'empresaId'
    // e acionando o useEffect para navegar.
    await refetch();
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
          <FormEmpresa 
            onSaveComplete={handleSaveComplete}
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default CadastroEmpresa;