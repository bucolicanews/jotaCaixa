import { AnyProfile, UserRole } from '@/types/usuario';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';

// Definição do tipo de contexto (SessionContextType)
interface SessionContextType {
  perfil: AnyProfile | null;
  role: UserRole | null;
  carregando: boolean;
  refreshSessao: () => Promise<void>; // PROPRIEDADE ADICIONADA
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [perfil, setPerfil] = useState<AnyProfile | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [carregando, setCarregando] = useState(true);

  const fetchProfile = useCallback(async (userId: string, userRole: UserRole) => {
    let tableName = '';
    if (userRole === 'Admin') {
      tableName = 'tbl_admins';
    } else if (userRole === 'Cliente') {
      tableName = 'tbl_clientes';
    } else if (userRole === 'Usuario') {
      tableName = 'tbl_usuarios';
    }

    if (!tableName) return null;

    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Erro ao buscar perfil:', error);
      showError('Erro ao carregar dados do perfil.');
      return null;
    }
    return data as AnyProfile;
  }, []);

  const refreshSessao = useCallback(async () => {
    setCarregando(true);
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const userRole = (user.user_metadata.role || 'Usuario') as UserRole;
      setRole(userRole);
      
      const profileData = await fetchProfile(user.id, userRole);
      setPerfil(profileData);
    } else {
      setPerfil(null);
      setRole(null);
    }
    setCarregando(false);
  }, [fetchProfile]);

  useEffect(() => {
    refreshSessao();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        refreshSessao();
      } else {
        setPerfil(null);
        setRole(null);
        setCarregando(false);
      }
    });

    return () => {
      authListener?.unsubscribe();
    };
  }, [refreshSessao]);

  return (
    <SessionContext.Provider value={{ perfil, role, carregando, refreshSessao }}>
      {children}
    </SessionContext.Provider>
  );
};

export const useSessao = () => {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSessao must be used within a SessionProvider');
  }
  return context;
};