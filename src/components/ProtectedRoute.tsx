import React, { ReactNode, useMemo } from 'react';
import { useSessao } from '@/hooks/use-sessao';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AdminUsuarioProfile, UsuarioProfile } from '@/types/usuario';

interface ProtectedRouteProps {
  permissionKey?: string; // Tornar opcional
  children: ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ permissionKey, children }) => {
  const { role, perfil, carregando, usuario } = useSessao();

  const permissoes = useMemo<Record<string, boolean> | null>(() => {
    if (role !== 'Usuario' || !perfil) return null;

    // Usuario do Admin
    if ('admin_id' in perfil) {
      return (perfil as AdminUsuarioProfile).permissoes || {};
    }

    // Usuario de Cliente
    return (perfil as UsuarioProfile).permissoes || {};
  }, [role, perfil]);

  if (carregando) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Se não houver usuário logado, redireciona para o login
  if (!usuario) {
    return <Navigate to="/login" replace />;
  }

  const isUsuarioAdmin = role === 'Usuario' && !!(perfil as any)?.admin_id;

  // 🔓 Admin e Clientes passam diretamente
  if (role === 'Admin' || role === 'Cliente') {
    return <>{children}</>;
  }

  // 🔐 Lógica para Role 'Usuario' (agora inclui AdminUsuario)
  if (role === 'Usuario') {
    // Se for um usuário de admin, ele precisa de permissões específicas
    if (isUsuarioAdmin) {
      // Se não for necessária uma permissão específica, permite o acesso (ex: /perfil)
      if (!permissionKey) {
        return <>{children}</>;
      }
      // Se for necessária uma permissão, verifica se o usuário a possui
      if (!permissoes || !permissoes[permissionKey]) {
        // Redireciona para o painel se não tiver permissão
        return <Navigate to="/painel" replace />;
      }
    } else {
      // Lógica para usuários de cliente (se houver alguma diferenciação no futuro)
      if (!permissionKey) {
        return <>{children}</>;
      }
      if (!permissoes || !permissoes[permissionKey]) {
        return <Navigate to="/painel" replace />;
      }
    }
  }

  return <>{children}</>;
};

export default ProtectedRoute;
