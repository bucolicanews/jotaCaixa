import React, { createContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';
import {
  DadosSessao,
  AnyProfile,
  UserRole,
  AdminUsuarioProfile,
} from '@/types/usuario';
import { SetupStatus } from '@/types/setup';
import { fetchSetupStatus } from '@/utils/setup-status';
import { resolveOwnerContext } from '@/utils/owner'; // IMPORTADO

interface SessionContextType extends DadosSessao {
  refetch: () => Promise<void>;
}

export const SessionContext = createContext<SessionContextType | undefined>(undefined);

const DEFAULT_SETUP_STATUS: SetupStatus = {
  isComplete: true,
  missingSteps: [],
};

const DEFAULT_SESSION_STATE: DadosSessao = {
  usuario: null,
  perfil: null,
  role: null,
  carregando: true,
  setupStatus: DEFAULT_SETUP_STATUS,
  ownerId: null,
  ownerType: 'Unknown',
  sourceProfileId: null,
};

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [estado, setEstado] = useState<DadosSessao>(DEFAULT_SESSION_STATE);
  const navigate = useNavigate();

  const buscarDadosAdicionais = useCallback(async (user: User | null) => {
    if (!user) {
      // Define o estado para o padrão, mas garante que o carregamento seja finalizado
      setEstado({
        ...DEFAULT_SESSION_STATE,
        carregando: false,
      });
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
      console.log('[SessionContext] Perfil Admin carregado:', { id: adminData.id, email: adminData.email });
    } else {
      // 2. Buscar Cliente
      const clienteData = await fetchProfile('tbl_clientes');
      if (clienteData) {
        perfil = clienteData;
        role = 'Cliente';
        console.log('[SessionContext] Perfil Cliente carregado:', { id: clienteData.id, email: clienteData.email, admin_id: clienteData.admin_id });
      } else {
        // 3. Buscar Usuário (Funcionário do Admin)
        const adminUsuarioData = await fetchProfile('admin_usuarios');
        if (adminUsuarioData) {
          // Mapeia para o tipo AdminUsuarioProfile, garantindo que admin_id seja mapeado corretamente
          perfil = {
            ...adminUsuarioData,
            cliente_id: null,
            // Tenta admin_id, depois adm_id, depois admin (para robustez)
            admin_id: adminUsuarioData.admin_id ?? adminUsuarioData.adm_id ?? adminUsuarioData.admin ?? null,
          } as AdminUsuarioProfile;

          role = 'Usuario';
        } else {
          // 4. Buscar Usuário (Funcionário do Cliente)
          const usuarioData = await fetchProfile('tbl_usuarios');
          if (usuarioData) {
            perfil = usuarioData;
            role = 'Usuario';
          }
        }
      }
    }
    
    const { ownerId, ownerType, sourceProfileId } = resolveOwnerContext(role, perfil);
    const setupStatus = await fetchSetupStatus(ownerId);

    setEstado({ usuario: user, perfil, role, carregando: false, setupStatus, ownerId, ownerType, sourceProfileId });
  }, []);

  const refetch = useCallback(async () => {
    setEstado((s) => ({ ...s, carregando: true }));
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
