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
  const { role, perfil, carregando, usuario, setupStatus } = useSessao();

  const permissoes = useMemo<Record<string, boolean> | null>(() => {
    if (!perfil) return null;

    // Admin e Cliente usam o perfil diretamente
    if (role === 'Admin' || role === 'Cliente') {
        return (perfil as any).permissoes || {};
    }

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

  // 🔓 1. Admin sempre tem acesso total
  if (role === 'Admin') {
    return <>{children}</>;
  }
  
  // 🔓 2. Se não houver chave de permissão, permite o acesso (ex: /perfil)
  if (!permissionKey) {
      return <>{children}</>;
  }

  // 🔐 3. Se for Cliente ou Usuário, verifica a permissão
  if (role === 'Cliente' || role === 'Usuario') {
    
    // Se o setup não estiver completo, permite acesso apenas ao /painel (que lida com o setup blocker)
    if (role === 'Cliente' && !setupStatus.isComplete) {
        // Se a rota não for o painel, redireciona para o painel
        if (window.location.pathname !== '/painel') {
            return <Navigate to="/painel" replace />;
        }
        // Se for o painel, permite o acesso para mostrar o blocker
        return <>{children}</>;
    }
    
    // Verifica se a permissão necessária está ativa
    if (permissoes && permissoes[permissionKey] === true) {
      return <>{children}</>;
    }
    
    // Se não tiver a permissão, redireciona para o painel
    return <Navigate to="/painel" replace />;
  }

  // Fallback para qualquer outro caso (deve ser raro)
  return <Navigate to="/painel" replace />;
};

export default ProtectedRoute;