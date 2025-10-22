import React, { createContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Session, User, AuthChangeEvent } from '@supabase/supabase-js';
import { PerfilUsuario, DadosSessao } from '@/types/usuario';

interface SessionContextType extends DadosSessao {
  refetch: () => Promise<void>;
}

export const SessionContext = createContext<SessionContextType | undefined>(undefined);

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [estado, setEstado] = useState<DadosSessao>({
    usuario: null,
    perfil: null,
    carregando: true,
  });

  const buscarDadosAdicionais = useCallback(async (user: User | null) => {
    if (!user) {
      setEstado({ usuario: null, perfil: null, carregando: false });
      return;
    }

    const { data: perfilData, error: perfilError } = await supabase
      .from('usuarios')
      .select('*, tbl_perfil(*)')
      .eq('id', user.id)
      .single();

    if (perfilError && perfilError.code !== 'PGRST116') {
      console.error('Erro ao buscar perfil:', perfilError);
    }
    const perfil = (perfilData as PerfilUsuario) || null;

    setEstado({ usuario: user, perfil, carregando: false });
  }, []);

  const refetch = useCallback(async () => {
    setEstado(s => ({ ...s, carregando: true }));
    const { data: { session } } = await supabase.auth.getSession();
    await buscarDadosAdicionais(session?.user ?? null);
  }, [buscarDadosAdicionais]);

  useEffect(() => {
    refetch();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_evento: AuthChangeEvent, sessaoAtual: Session | null) => {
        buscarDadosAdicionais(sessaoAtual?.user ?? null);
      }
    );

    return () => subscription.unsubscribe();
  }, [buscarDadosAdicionais, refetch]);

  return (
    <SessionContext.Provider value={{ ...estado, refetch }}>
      {children}
    </SessionContext.Provider>
  );
};