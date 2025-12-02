import React, { createContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';
import { DadosSessao, AnyProfile, UserRole, UsuarioProfile, AdminUsuarioProfile } from '@/types/usuario';

interface SessionContextType extends DadosSessao {
  refetch: () => Promise<void>;
}

export const SessionContext = createContext<SessionContextType | undefined>(undefined);

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [estado, setEstado] = useState<DadosSessao>({
    usuario: null,
    perfil: null,
    role: null,
    carregando: true,
  });
  const navigate = useNavigate();

  const buscarDadosAdicionais = useCallback(async (user: User | null) => {
    if (!user) {
      setEstado({ usuario: null, perfil: null, role: null, carregando: false });
      return;
    }

    let perfil: AnyProfile = null;
    let role: UserRole = null;
    
    // Função auxiliar para buscar e ignorar erros 406 (RLS)
    const fetchProfile = async (table: string) => {
        const { data, error } = await supabase.from(table).select('*').eq('id', user.id).maybeSingle();
        
        if (error && error.code !== 'PGRST116') {
            // PGRST116 é "No rows found", que é esperado. Outros erros (como 406) são logados, mas ignorados.
            console.warn(`[SessionContext] RLS/Fetch Error on ${table}:`, error);
            return null;
        }
        return data;
    };

    // 1. Buscar Admin
    const adminData = await fetchProfile('tbl_admins');
    if (adminData) {
      perfil = adminData;
      role = 'Admin';
    } else {
      // 2. Buscar Cliente
      const clienteData = await fetchProfile('tbl_clientes');
      if (clienteData) {
        perfil = clienteData;
        role = 'Cliente';
      } else {
        // 3. Buscar Usuário (Funcionário do Cliente)
        const usuarioData = await fetchProfile('tbl_usuarios');
        if (usuarioData) {
          perfil = usuarioData;
          role = 'Usuario';
        } else {
          // 4. Buscar Usuário (Funcionário do Admin)
          const adminUsuarioData = await fetchProfile('admin_usuarios');
          if (adminUsuarioData) {
            // Mapeia para o tipo AdminUsuarioProfile
            perfil = { ...adminUsuarioData, cliente_id: null } as AdminUsuarioProfile;
            role = 'Usuario';
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
      // Lógica de alta prioridade para recuperação de senha
      if (event === 'PASSWORD_RECOVERY') {
        navigate('/atualizar-senha');
      } else {
        buscarDadosAdicionais(session?.user ?? null);
      }
    });
    return () => subscription.unsubscribe();
  }, [buscarDadosAdicionais, navigate]);
  
  // Lógica de Redirecionamento Pós-Login (Simplificada para evitar conflitos)
  useEffect(() => {
      if (!estado.carregando && estado.usuario) {
          // Redireciona qualquer usuário autenticado para /painel se estiver em / ou /login.
          // O Painel.tsx fará o roteamento condicional final.
          if (window.location.pathname === '/login' || window.location.pathname === '/') {
              navigate('/painel', { replace: true });
          }
      }
  }, [estado.carregando, estado.usuario, navigate]);


  return (
    <SessionContext.Provider value={{ ...estado, refetch }}>
      {children}
    </SessionContext.Provider>
  );
};