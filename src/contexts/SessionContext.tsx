import React, { createContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';
import { DadosSessao, AnyProfile, UserRole } from '@/types/usuario';

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

  const buscarDadosAdicionais = useCallback(async (user: User | null) => {
    if (!user) {
      setEstado({ usuario: null, perfil: null, role: null, carregando: false });
      return;
    }

    let perfil: AnyProfile = null;
    let role: UserRole = null;

    // 1. Verifica se é Admin
    const { data: adminData } = await supabase.from('tbl_admins').select('*').eq('id', user.id).single();
    if (adminData) {
      perfil = adminData;
      role = 'Admin';
    } else {
      // 2. Se não, verifica se é Cliente
      const { data: clienteData } = await supabase.from('tbl_clientes').select('*').eq('id', user.id).single();
      if (clienteData) {
        perfil = clienteData;
        role = 'Cliente';
      } else {
        // 3. Se não, verifica se é Usuario
        const { data: usuarioData } = await supabase.from('tbl_usuarios').select('*').eq('id', user.id).single();
        if (usuarioData) {
          perfil = usuarioData;
          role = 'Usuario';
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
    refetch();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      buscarDadosAdicionais(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, [buscarDadosAdicionais, refetch]);

  return (
    <SessionContext.Provider value={{ ...estado, refetch }}>
      {children}
    </SessionContext.Provider>
  );
};