import React, { ReactNode } from 'react';
import { useSessao } from '@/hooks/use-sessao';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AdminUsuarioProfile, ClienteProfile, UsuarioProfile } from '@/types/usuario';

interface ProtectedRouteProps {
  permissionKey: string;
  children: ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ permissionKey, children }) => {
  const { role, perfil, carregando } = useSessao();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (carregando) {
      return; // Aguarda o carregamento da sessão
    }

    // Admin tem acesso a tudo
    if (role === 'Admin') {
      return;
    }

    const getPermissoes = (): Record<string, boolean> => {
        if (role === 'Usuario' && perfil && ('admin_id' in perfil)) {
            return (perfil as AdminUsuarioProfile)?.permissoes || {};
        }
        if (role === 'Cliente') {
            return (perfil as ClienteProfile)?.permissoes || {};
        }
        if (role === 'Usuario') {
            return (perfil as UsuarioProfile)?.permissoes || {};
        }
        return {};
    };

    const permissoes = getPermissoes();
    
    if (!permissoes[permissionKey]) {
      // Se não tiver a permissão, redireciona para o painel
      navigate('/painel', { replace: true });
    }

  }, [carregando, role, perfil, permissionKey, navigate]);

  // Enquanto carrega, exibe um loader
  if (carregando) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Se tiver permissão (passou pelo useEffect), renderiza o componente filho
  // A lógica do useEffect já terá redirecionado se necessário
  
  const getPermissoes = (): Record<string, boolean> => {
    if (role === 'Admin') return { [permissionKey]: true }; // Admin sempre tem permissão
    if (role === 'Usuario' && perfil && ('admin_id' in perfil)) {
        return (perfil as AdminUsuarioProfile)?.permissoes || {};
    }
    if (role === 'Cliente') {
        return (perfil as ClienteProfile)?.permissoes || {};
    }
    if (role === 'Usuario') {
        return (perfil as UsuarioProfile)?.permissoes || {};
    }
    return {};
  };

  if (getPermissoes()[permissionKey]) {
    return <>{children}</>;
  }

  // Renderiza um loader enquanto o redirecionamento do useEffect acontece
  return (
    <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
};

export default ProtectedRoute;
