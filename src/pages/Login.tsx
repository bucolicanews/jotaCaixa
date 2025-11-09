import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useSessao } from '@/hooks/use-sessao';
import { useTheme } from '@/hooks/use-theme'; // Importando useTheme do local correto
import { BASE_URL } from '@/config/app-config'; // Importando BASE_URL

/**
 * Componente de Login.
 * Redireciona para o painel principal se o usuário já estiver autenticado.
 */
const Login = () => {
  const { usuario, carregando } = useSessao();
  const { theme } = useTheme(); // Obtendo o tema atual
  const navegar = useNavigate();

  useEffect(() => {
    if (!carregando && usuario) {
      // Redirecionar usuários autenticados para o painel principal
      navegar('/painel');
    }
  }, [usuario, carregando, navegar]);

  if (carregando) {
    return <div className="flex justify-center items-center min-h-screen">Carregando...</div>;
  }

  // O tema do Supabase Auth UI deve ser 'dark' ou 'light'
  const authTheme = theme === 'dark' ? 'dark' : 'light';

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md p-8 space-y-6 bg-card rounded-lg shadow-md">
        <h2 className="text-2xl font-bold text-center text-foreground">
          Acesso ao Fluxo de Caixa
        </h2>
        <Auth
          supabaseClient={supabase}
          appearance={{ theme: ThemeSupa }}
          theme={authTheme} // Usando o tema dinâmico
          providers={[]}
          redirectTo={BASE_URL + '/painel'} // Usando BASE_URL
          view="sign_in" // Garante que a tela inicial seja o login
          localization={{
            variables: {
              sign_in: {
                email_label: 'Email',
                password_label: 'Senha',
                button_label: 'Entrar',
                link_text: 'Já tenho Conta? Entrar', 
                social_provider_text: 'Entrar com {{provider}}',
                // NOVO: Placeholders em Português
                email_input_placeholder: 'Seu endereço de email',
                password_input_placeholder: 'Sua senha',
              },
              sign_up: {
                email_label: 'Email',
                password_label: 'Criar Senha',
                button_label: 'Cadastrar',
                link_text: 'Não tenho conta? Cadastre-se', 
                // NOVO: Placeholders em Português
                email_input_placeholder: 'Seu endereço de email',
                password_input_placeholder: 'Crie uma senha',
              },
              forgotten_password: {
                email_label: 'Email',
                button_label: 'Enviar instruções de recuperação',
                link_text: 'Esqueceu sua senha?',
                email_input_placeholder: 'Seu endereço de email',
              },
              update_password: {
                password_label: 'Nova Senha',
                button_label: 'Atualizar Senha',
                password_input_placeholder: 'Sua nova senha',
              },
            },
          }}
        />
        <p className="text-sm text-center text-muted-foreground">
          Se você recebeu um Código de Acesso, use a opção de login por email/senha e entre em contato com o administrador para vincular sua conta.
        </p>
      </div>
    </div>
  );
};

export default Login;