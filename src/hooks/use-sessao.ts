import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Session, User, AuthChangeEvent } from '@supabase/supabase-js';
import { PerfilUsuario, DadosSessao } from '@/types/usuario';

/**
 * Hook para monitorar o estado de autenticação do Supabase e buscar dados do perfil/empresa.
 */
export function useSessao(): DadosSessao {
  const [estado, setEstado] = useState<DadosSessao>({
    usuario: null,
    perfil: null,
    empresaId: null,
    carregando: true,
  });

  const buscarDadosAdicionais = async (user: User) => {
    // 1. Buscar Perfil (tabela 'usuarios')
    const { data: perfilData, error: perfilError } = await supabase
      .from('usuarios')
      .select('*')
      .eq('id', user.id)
      .single();

    if (perfilError && perfilError.code !== 'PGRST116') { // PGRST116 = No rows found
      console.error('Erro ao buscar perfil:', perfilError);
    }

    const perfil = perfilData as PerfilUsuario | null;

    // 2. Buscar Empresa ID (tabela 'empresas')
    let empresaId: string | null = null;
    if (perfil?.tipo_usuario === 'Admin' || perfil?.tipo_usuario === 'Cliente') {
      const { data: empresaData, error: empresaError } = await supabase
        .from('empresas')
        .select('id')
        .eq('usuario_id', user.id)
        .single();

      if (empresaData) {
        empresaId = empresaData.id;
      } else if (empresaError && empresaError.code !== 'PGRST116') {
        console.error('Erro ao buscar empresa:', empresaError);
      }
    }

    setEstado({
      usuario: user,
      perfil: perfil,
      empresaId: empresaId,
      carregando: false,
    });
  };

  useEffect(() => {
    // Função assíncrona para buscar a sessão inicial
    const buscarSessaoInicial = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await buscarDadosAdicionais(session.user);
      } else {
        setEstado({
          usuario: null,
          perfil: null,
          empresaId: null,
          carregando: false,
        });
      }
    };

    buscarSessaoInicial();

    // Monitorar mudanças no estado de autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_evento: AuthChangeEvent, sessaoAtual: Session | null) => {
      if (sessaoAtual) {
        buscarDadosAdicionais(sessaoAtual.user);
      } else {
        setEstado({
          usuario: null,
          perfil: null,
          empresaId: null,
          carregando: false,
        });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return estado;
}