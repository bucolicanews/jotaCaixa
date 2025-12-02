import React, { createContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';
import {
  DadosSessao,
  AnyProfile,
  UserRole,
  UsuarioProfile,
  AdminUsuarioProfile,
  ClienteProfile,
} from '@/types/usuario';

interface SessionContextType extends DadosSessao {
  refetch: () => Promise<void>;
}

export const SessionContext = createContext<SessionContextType | undefined>(undefined);

const safeParsePermissoes = (maybe: any) => {
  if (!maybe) return {};
  if (typeof maybe === 'object') return maybe;
  try {
    return JSON.parse(maybe);
  } catch (err) {
    console.warn('safeParsePermissoes: parse error', err);
    return {};
  }
};

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [estado, setEstado] = useState<DadosSessao>({
    usuario: null,
    perfil: null,
    role: null,
    carregando: true,
  });
  const navigate = useNavigate();

  const fetchProfile = async (table: string, userId: string) => {
    const { data, error } = await supabase.from(table).select('*').eq('id', userId).maybeSingle();
    
    if (error) {
      console.warn(`[SessionContext] fetch ${table} error:`, error);
    }
    return data ?? null;
  };

  const buscarDadosAdicionais = useCallback(async (user: User | null) => {
    if (!user) {
      setEstado({ usuario: null, perfil: null, role: null, carregando: false });
      return;
    }

    let perfil: AnyProfile = null;
    let role: UserRole | string | null = null;

    // 1. Admin (tbl_admins)
    const adminData = await fetchProfile('tbl_admins', user.id);
    if (adminData) {
      perfil = adminData as ClienteProfile;
      role = 'Admin';
    } else {
      // 2. admin_usuarios (funcionário do admin)
      const adminUsuarioData = await fetchProfile('admin_usuarios', user.id);
      if (adminUsuarioData) {
        const permissoes = safeParsePermissoes(adminUsuarioData.permissoes);
        perfil = { ...adminUsuarioData, permissoes } as AdminUsuarioProfile;
        role = 'UsuarioDoAdmin';
      } else {
        // 3. tbl_clientes (cliente)
        const clienteData = await fetchProfile('tbl_clientes', user.id);
        if (clienteData) {
          perfil = clienteData as ClienteProfile;
          role = 'Cliente';
        } else {
          // 4. tbl_usuarios (funcionário de cliente)
          const usuarioData = await fetchProfile('tbl_usuarios', user.id);
          if (usuarioData) {
            const permissoes = safeParsePermissoes(usuarioData.permissoes);
            perfil = { ...usuarioData, permissoes } as UsuarioProfile;
            role = 'UsuarioDoCliente';
          }
        }
      }
    }

    setEstado({ usuario: user, perfil, role, carregando: false });
  }, []);

  const refetch = useCallback(async () => {
    setEstado(s => ({ ...s, carregando: true }));
    const { data: { session } } = await supabase.auth.getSession();
    await buscarDadosAdicionais(session?.user ?? null);
  }, [buscarDadosAdicionais]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        navigate('/atualizar-senha');
      } else {
        buscarDadosAdicionais(session?.user ?? null);
      }
    });
    return () => subscription.unsubscribe();
  }, [buscarDadosAdicionais, navigate]);

  // Redirecionamento pós-login: admins/clients/usuários vinculados vão para /painel
  useEffect(() => {
    if (!estado.carregando && estado.usuario) {
      const path = window.location.pathname;
      const isPublic = path === '/login' || path === '/';
      if (!estado.role) return;

      const allowedRolesToPainel = ['Admin', 'Cliente', 'UsuarioDoAdmin', 'UsuarioDoCliente'];

      if (allowedRolesToPainel.includes(estado.role as string) && isPublic) {
        navigate('/painel', { replace: true });
      }
    }
  }, [estado, navigate]);

  return (
    <SessionContext.Provider value={{ ...estado, refetch }}>
      {children}
    </SessionContext.Provider>
  );
};