import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { showSuccess, showError } from '@/utils/toast';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input'; // Usando Input simples, pois não temos PasswordInput no seu codebase atual

const AtualizarSenha = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [sessionValid, setSessionValid] = useState(false);

  useEffect(() => {
    // Monitora o estado de autenticação para verificar se o evento é de recuperação de senha
    const { data: { subscription: authListener } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        // Se o evento for PASSWORD_RECOVERY, a sessão está temporariamente válida para atualização
        setSessionValid(true);
      } else if (session) {
        // Se já houver uma sessão válida (usuário logado), redireciona para o painel
        navigate('/painel');
      } else {
        // Se não houver sessão e não for um evento de recuperação, a página não deve ser acessada diretamente
        setSessionValid(false);
      }
      setLoading(false);
    });

    return () => {
      authListener.unsubscribe();
    };
  }, [navigate]);

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

    // Atualiza a senha do usuário logado temporariamente
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      showError('Não foi possível atualizar sua senha. Por favor, tente novamente.');
      console.error('Password update error:', error);
    } else {
      showSuccess('Senha atualizada com sucesso! Redirecionando para o login...');
      // Após a atualização, a sessão temporária é encerrada, e o usuário deve ser redirecionado para o login
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    }
    setLoading(false);
  };
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!sessionValid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4 text-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl">Acesso Negado</CardTitle>
            <CardDescription>Este link de redefinição de senha é inválido ou expirou.</CardDescription>
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