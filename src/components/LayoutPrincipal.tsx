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
 * Inclui verificação de autenticação e de empresa vinculada.
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

  // Se não houver usuário, redireciona para o login.
  if (!usuario) {
    // Usamos replace para que o usuário não possa voltar para a página anterior.
    navegar('/login', { replace: true });
    return null;
  }

  // Se o usuário estiver logado, mas não tiver uma empresa vinculada,
  // ele deve ser forçado a cadastrar uma.
  if (!empresaId) {
    // Evita um loop de redirecionamento se já estiver na página de cadastro.
    if (localizacao.pathname !== '/cadastro-empresa') {
      navegar('/cadastro-empresa', { replace: true });
    }
    // Retorna null para não renderizar o layout principal enquanto estiver na página de cadastro.
    // A página CadastroEmpresa será renderizada pela rota em App.tsx.
    return null;
  }

  // Se o usuário está logado, tem uma empresa, mas está tentando acessar a página de cadastro,
  // redirecionamos ele para o painel.
  if (empresaId && localizacao.pathname === '/cadastro-empresa') {
    navegar('/painel', { replace: true });
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