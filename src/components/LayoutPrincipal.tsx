import React from 'react';
import MenuLateral from './MenuLateral';
import { useSessao } from '@/hooks/use-sessao';
import { useNavigate } from 'react-router-dom';

interface LayoutPrincipalProps {
  children: React.ReactNode;
}

/**
 * Layout principal que envolve todas as páginas autenticadas.
 * Inclui verificação de autenticação e menu lateral.
 */
const LayoutPrincipal: React.FC<LayoutPrincipalProps> = ({ children }) => {
  const { usuario, carregando } = useSessao();
  const navegar = useNavigate();

  if (carregando) {
    return <div className="flex justify-center items-center min-h-screen">Carregando autenticação...</div>;
  }

  if (!usuario) {
    // Redirecionar usuários não autenticados para a página de login
    navegar('/login');
    return null;
  }

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