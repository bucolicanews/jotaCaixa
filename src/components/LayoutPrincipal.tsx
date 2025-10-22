import React from 'react';
import MenuLateral from './MenuLateral';
import { useSessao } from '@/hooks/use-sessao';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

interface LayoutPrincipalProps {
  children: React.ReactNode;
}

/**
 * Layout principal que envolve todas as páginas autenticadas.
 * Agora, apenas verifica se o usuário está logado.
 */
const LayoutPrincipal: React.FC<LayoutPrincipalProps> = ({ children }) => {
  const { usuario, carregando } = useSessao();
  const navegar = useNavigate();

  if (carregando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Se não houver usuário, redireciona para o login.
  if (!usuario) {
    navegar('/login', { replace: true });
    return null;
  }

  // A verificação de empresa foi removida. Se o usuário está logado, ele pode acessar.
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="w-64 flex-shrink-0">
        <MenuLateral />
      </aside>
      <main className="flex-1 p-8 overflow-y-auto">
        {children}
      </main>
    </div>
  );
};

export default LayoutPrincipal;