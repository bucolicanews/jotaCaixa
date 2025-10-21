import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useSessao } from '@/hooks/use-sessao';

/**
 * Componente de Login.
 * Redireciona para o painel principal se o usuário já estiver autenticado.
 */
const Login = () => {
  const { sessao, carregando } = useSessao();
  const navegar = useNavigate();

  useEffect(() => {
    if (!carregando && sessao) {
      // Redirecionar usuários autenticados para o painel principal
      navegar('/painel');
    }
  }, [sessao, carregando, navegar]);

  if (carregando) {
    return <div className="flex justify-center items-center min-h-screen">Carregando...</div>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md dark:bg-gray-800">
        <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-white">
          Acesso ao Fluxo de Caixa
        </h2>
        <Auth
          supabaseClient={supabase}
          appearance={{ theme: ThemeSupa }}
          theme="light"
          providers={[]}
          redirectTo={window.location.origin + '/painel'}
          localization={{
            variables: {
              sign_in: {
                email_label: 'Email',
                password_label: 'Senha',
                button_label: 'Entrar',
                link_text: 'Já tem uma conta? Entrar',
                social_provider_text: 'Entrar com {{provider}}',
                forgotten_password_text: 'Esqueceu sua senha?',
              },
              sign_up: {
                email_label: 'Email',
                password_label: 'Criar Senha',
                button_label: 'Cadastrar',
                link_text: 'Não tem uma conta? Cadastrar',
              },
              forgotten_password: {
                email_label: 'Email',
                button_label: 'Enviar instruções de recuperação',
                link_text: 'Esqueceu sua senha?',
              },
              update_password: {
                password_label: 'Nova Senha',
                button_label: 'Atualizar Senha',
              },
            },
          }}
        />
        <p className="text-sm text-center text-gray-500 dark:text-gray-400">
          Se você recebeu um Código de Acesso, use a opção de login por email/senha e entre em contato com o administrador para vincular sua conta.
        </p>
      </div>
    </div>
  );
};

export default Login;