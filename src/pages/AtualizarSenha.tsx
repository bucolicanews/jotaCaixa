import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { showSuccess, showError } from '@/utils/toast';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';

const AtualizarSenha = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    // Verifica se existe uma sessão temporária de recuperação ao carregar a página.
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('Este link de redefinição de senha é inválido ou expirou.');
      }
      setCheckingSession(false);
    };
    checkUser();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (password.length < 6) {
      showError('A senha deve ter pelo menos 6 caracteres.');
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      showError('As senhas não coincidem. Por favor, verifique.');
      setLoading(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      console.error('Password update error:', updateError);
      
      let errorMessage = 'Não foi possível atualizar sua senha. Por favor, tente novamente.';
      
      // Captura o erro específico de senha duplicada
      if (updateError.message.includes('New password should be different from the old password')) {
        errorMessage = 'A nova senha deve ser diferente da senha anterior. Por favor, escolha uma senha que você nunca usou neste sistema.';
      }
      
      showError(errorMessage);
      setLoading(false);
    } else {
      showSuccess('Senha atualizada com sucesso! Você será redirecionado para o login.');
      // Força o logout para destruir a sessão temporária de recuperação.
      await supabase.auth.signOut();
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    }
  };
  
  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4 text-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl">Acesso Negado</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/login">
              <Button className="w-full">Voltar para o Login</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Criar Nova Senha</CardTitle>
          <CardDescription>Digite sua nova senha abaixo para acessar sua conta.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="new-password">Nova Senha (mínimo 6 caracteres)</Label>
              <Input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmar Nova Senha</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading || !password || !confirmPassword}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar Nova Senha
            </Button>
          </form>
          <div className="mt-4 text-center text-sm">
            Lembrou sua senha?{' '}
            <Link to="/login" className="underline">
              Voltar para o login
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AtualizarSenha;