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
    empresaId: null,
    carregando: true,
  });

  const buscarDadosAdicionais = useCallback(async (user: User | null) => {
    if (!user) {
      setEstado({ usuario: null, perfil: null, empresaId: null, carregando: false });
      return;
    }

    // Agora, buscamos o usuário e fazemos um "join" para trazer os dados do perfil junto.
    const [perfilResult, empresaResult] = await Promise.all([
      supabase.from('usuarios').select('*, tbl_perfil(*)').eq('id', user.id).single(),
      supabase.from('empresas').select('id').eq('usuario_id', user.id).single(),
    ]);

    const { data: perfilData, error: perfilError } = perfilResult;
    if (perfilError && perfilError.code !== 'PGRST116') {
      console.error('Erro ao buscar perfil:', perfilError);
    }
    const perfil = (perfilData as PerfilUsuario) || null;

    const { data: empresaData, error: empresaError } = empresaResult;
    if (empresaError && empresaError.code !== 'PGRST116') {
      console.error('Erro ao buscar empresa:', empresaError);
    }
    const empresaId = empresaData?.id || null;

    setEstado({ usuario: user, perfil, empresaId, carregando: false });
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