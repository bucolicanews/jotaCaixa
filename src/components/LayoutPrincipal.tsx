import React from 'react';
import MenuLateral from './MenuLateral';
import { useSessao } from '@/hooks/use-sessao';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

interface LayoutPrincipalProps {
  children: React.ReactNode;
}

/**
 * Layout principal que envolve todas as páginas autenticadas.
 * Inclui verificação de autenticação, menu lateral e verificação de empresa vinculada.
 */
const LayoutPrincipal: React.FC<LayoutPrincipalProps> = ({ children }) => {
  const { usuario, empresaId, carregando } = useSessao();
  const navegar = useNavigate();
  const localizacao = useLocation();

  if (carregando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!usuario) {
    // Redirecionar usuários não autenticados para a página de login
    navegar('/login');
    return null;
  }

  // Se o usuário estiver logado, mas não tiver empresa vinculada,
  // ele deve ser forçado a cadastrar uma.
  if (!empresaId) {
    // Evita loop de redirecionamento se já estiver na página de cadastro
    if (localizacao.pathname !== '/cadastro-empresa') {
      navegar('/cadastro-empresa');
      return null;
    }
    // Se estiver na página de cadastro, o LayoutPrincipal não deve renderizar o menu lateral,
    // mas como CadastroEmpresa não usa LayoutPrincipal, este bloco só serve para garantir
    // que o fluxo de navegação está correto.
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