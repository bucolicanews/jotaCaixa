import { AnyProfile, UserRole } from '@/types/usuario';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';

// Definição do tipo de contexto (SessionContextType)
interface SessionContextType {
  usuario: AnyProfile | null; // Renomeado de perfil
  role: UserRole | null;
  carregando: boolean;
  refetch: () => Promise<void>; // Renomeado de refreshSessao
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [usuario, setUsuario] = useState<AnyProfile | null>(null); // Renomeado de perfil
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

  const refetch = useCallback(async () => { // Renomeado de refreshSessao
    setCarregando(true);
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const userRole = (user.user_metadata.role || 'Usuario') as UserRole;
      setRole(userRole);
      
      const profileData = await fetchProfile(user.id, userRole);
      setUsuario(profileData); // Renomeado de setPerfil
    } else {
      setUsuario(null); // Renomeado de setPerfil
      setRole(null);
    }
    setCarregando(false);
  }, [fetchProfile]);

  useEffect(() => {
    refetch(); // Chamada renomeada

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        refetch(); // Chamada renomeada
      } else {
        setUsuario(null); // Chamada renomeada
        setRole(null);
        setCarregando(false);
      }
    });

    return () => {
      // Corrigindo a tipagem do unsubscribe (Erro 10)
      authListener?.subscription?.unsubscribe();
    };
  }, [refetch]);

  // Corrigindo a sintaxe JSX (Erros 1-7, 11-17)
  return (
    <SessionContext.Provider value={{ usuario, role, carregando, refetch }}>
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