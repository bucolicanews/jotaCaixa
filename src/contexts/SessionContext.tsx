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

    // 1. Buscar Admin
    const { data: adminData } = await supabase.from('tbl_admins').select('*').eq('id', user.id).single();
    if (adminData) {
      perfil = adminData;
      role = 'Admin';
    } else {
      // 2. Buscar Cliente
      const { data: clienteData } = await supabase.from('tbl_clientes').select('*').eq('id', user.id).single();
      if (clienteData) {
        perfil = clienteData;
        role = 'Cliente';
      } else {
        // 3. Buscar Usuário (Funcionário do Cliente)
        const { data: usuarioData } = await supabase.from('tbl_usuarios').select('*').eq('id', user.id).single();
        if (usuarioData) {
          perfil = usuarioData;
          role = 'Usuario';
        } else {
          // 4. Buscar Usuário (Funcionário do Admin) - NOVO
          const { data: adminUsuarioData } = await supabase.from('admin_usuarios').select('*, admin_id').eq('id', user.id).single();
          if (adminUsuarioData) {
            // Mapeia para o tipo UsuarioProfile, mas com admin_id
            perfil = { ...adminUsuarioData, cliente_id: null } as AdminUsuarioProfile; // CORREÇÃO: cliente_id é null
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
  
  // Lógica de Redirecionamento Pós-Login
  useEffect(() => {
      if (!estado.carregando && estado.usuario) {
          // Se for Cliente (aprovado ou pendente) ou Admin, redireciona para o painel.
          if (estado.role === 'Cliente' || estado.role === 'Admin') {
              if (window.location.pathname === '/login' || window.location.pathname === '/') {
                  navigate('/painel', { replace: true });
              }
          }
          // Usuários (Funcionários) são redirecionados para o painel se estiverem vinculados.
          // Verifica cliente_id (Cliente) ou admin_id (AdminUsuarioProfile)
          const isUsuarioVinculado = estado.role === 'Usuario' && (
              (estado.perfil as UsuarioProfile)?.cliente_id || 
              (estado.perfil as AdminUsuarioProfile)?.admin_id
          );
          
          if (isUsuarioVinculado) {
              if (window.location.pathname === '/login' || window.location.pathname === '/') {
                  navigate('/painel', { replace: true });
              }
          }
      }
  }, [estado, navigate]);


  return (
    <SessionContext.Provider value={{ ...estado, refetch }}>
      {children}
    </SessionContext.Provider>
  );
};