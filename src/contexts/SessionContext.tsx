import React, { createContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Session, User, AuthChangeEvent } from '@supabase/supabase-js';
import { PerfilUsuario, DadosSessao } from '@/types/usuario';

// Estendendo o tipo para incluir a função de recarregar
interface SessionContextType extends DadosSessao {
  refetch: () => Promise<void>;
}

// Criando o contexto com 'undefined' como valor padrão para uma verificação de tipo mais segura
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

    // 1. Buscar Perfil
    const { data: perfilData, error: perfilError } = await supabase
      .from('usuarios')
      .select('*')
      .eq('id', user.id)
      .single();
    if (perfilError && perfilError.code !== 'PGRST116') console.error('Erro ao buscar perfil:', perfilError);
    const perfil = perfilData as PerfilUsuario | null;

    // 2. Buscar Empresa ID
    let empresaId: string | null = null;
    if (perfil) {
      const { data: empresaData, error: empresaError } = await supabase
        .from('empresas')
        .select('id')
        .eq('usuario_id', user.id)
        .single();
      if (empresaData) empresaId = empresaData.id;
      else if (empresaError && empresaError.code !== 'PGRST116') console.error('Erro ao buscar empresa:', empresaError);
    }

    setEstado({ usuario: user, perfil, empresaId, carregando: false });
  }, []);

  const refetch = useCallback(async () => {
    setEstado(s => ({ ...s, carregando: true }));
    const { data: { session } } = await supabase.auth.getSession();
    await buscarDadosAdicionais(session?.user ?? null);
  }, [buscarDadosAdicionais]);

  useEffect(() => {
    refetch(); // Busca a sessão inicial

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