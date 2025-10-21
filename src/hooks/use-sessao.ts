import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Session, User, AuthChangeEvent } from '@supabase/supabase-js';

interface EstadoSessao {
  sessao: Session | null;
  usuario: User | null;
  carregando: boolean;
}

/**
 * Hook para monitorar o estado de autenticação do Supabase.
 * Retorna a sessão, o usuário e o estado de carregamento.
 */
export function useSessao(): EstadoSessao {
  const [estado, setEstado] = useState<EstadoSessao>({
    sessao: null,
    usuario: null,
    carregando: true,
  });

  useEffect(() => {
    // Função assíncrona para buscar a sessão inicial
    const buscarSessaoInicial = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setEstado({
        sessao: session,
        usuario: session?.user ?? null,
        carregando: false,
      });
    };

    buscarSessaoInicial();

    // Monitorar mudanças no estado de autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_evento: AuthChangeEvent, sessaoAtual: Session | null) => {
      setEstado({
        sessao: sessaoAtual,
        usuario: sessaoAtual?.user ?? null,
        carregando: false,
      });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return estado;
}