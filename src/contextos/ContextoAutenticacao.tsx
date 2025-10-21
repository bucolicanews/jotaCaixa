import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/lib/supabase'; // Importar o cliente Supabase
import { User } from '@supabase/supabase-js';

// Tipos em Português
interface UsuarioApp {
  id: string;
  nome: string;
  email: string;
  tipo_usuario: 'admin' | 'cliente';
}

interface EmpresaApp {
  id: string;
  nome_fantasia: string;
  cnpj: string;
}

interface ContextoAutenticacaoProps {
  usuario: UsuarioApp | null;
  empresa: EmpresaApp | null;
  carregando: boolean;
  loginPorEmail: (email: string, senha: string) => Promise<void>;
  loginPorCodigoAcesso: (codigo: string) => Promise<void>;
  logout: () => Promise<void>;
}

const ContextoAutenticacao = createContext<ContextoAutenticacaoProps | undefined>(undefined);

export const ProvedorAutenticacao: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [usuario, setUsuario] = useState<UsuarioApp | null>(null);
  const [empresa, setEmpresa] = useState<EmpresaApp | null>(null);
  const [carregando, setCarregando] = useState(true);

  // Função auxiliar para buscar dados adicionais do usuário e empresa
  const buscarDadosUsuario = async (user: User) => {
    // 1. Buscar dados na tabela 'usuarios'
    const { data: dadosUsuario, error: erroUsuario } = await supabase
      .from('usuarios')
      .select('id, nome, email, tipo_usuario')
      .eq('email', user.email)
      .single();

    if (erroUsuario || !dadosUsuario) {
      console.error("Erro ao buscar dados do usuário:", erroUsuario);
      return null;
    }

    const usuarioFormatado: UsuarioApp = {
      id: dadosUsuario.id,
      nome: dadosUsuario.nome,
      email: dadosUsuario.email,
      tipo_usuario: dadosUsuario.tipo_usuario as 'admin' | 'cliente',
    };

    setUsuario(usuarioFormatado);

    // 2. Se for cliente, buscar dados da empresa
    if (usuarioFormatado.tipo_usuario === 'cliente') {
      const { data: dadosEmpresa, error: erroEmpresa } = await supabase
        .from('empresas')
        .select('id, nome_fantasia, cnpj')
        .eq('usuario_id', usuarioFormatado.id)
        .single();
      
      if (erroEmpresa || !dadosEmpresa) {
        console.warn("Cliente sem empresa vinculada:", erroEmpresa);
        setEmpresa(null);
      } else {
        setEmpresa(dadosEmpresa as EmpresaApp);
      }
    } else {
      setEmpresa(null); // Admin não tem empresa vinculada diretamente
    }
    return usuarioFormatado;
  };

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange(async (evento, sessao) => {
      if (sessao?.user) {
        await buscarDadosUsuario(sessao.user);
      } else {
        setUsuario(null);
        setEmpresa(null);
      }
      setCarregando(false);
    });

    // Tenta carregar a sessão inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        buscarDadosUsuario(session.user);
      }
      setCarregando(false);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const loginPorEmail = async (email: string, senha: string) => {
    setCarregando(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error) throw error;
    if (data.user) {
      await buscarDadosUsuario(data.user);
    }
    setCarregando(false);
  };

  const loginPorCodigoAcesso = async (codigo: string) => {
    setCarregando(true);
    // Simulação: Supabase Auth não suporta login direto por campo customizado.
    // Na implementação real, isso seria um RPC (Remote Procedure Call) ou uma Edge Function.
    // Aqui, simulamos a busca e a criação de uma sessão temporária.
    
    // 1. Buscar usuário pelo código de acesso
    const { data: dadosUsuario, error: erroBusca } = await supabase
      .from('usuarios')
      .select('email')
      .eq('codigo_acesso', codigo)
      .single();

    if (erroBusca || !dadosUsuario) {
      throw new Error("Código de acesso inválido ou não encontrado.");
    }

    // 2. Se encontrado, você precisaria de um mecanismo para gerar um token/sessão.
    // Como não temos o backend completo, vamos simular o login usando o email encontrado.
    // Em um ambiente real, o Supabase Auth precisaria ser configurado para aceitar este fluxo.
    
    // Para fins de prototipagem, vamos assumir que o email encontrado é suficiente para
    // buscar os dados do usuário e simular o estado de autenticação.
    
    // Nota: Este é um ponto de mock. O fluxo real exigiria um endpoint seguro no backend
    // que validasse o código e retornasse um token/sessão.
    
    // Simulação de sucesso:
    const usuarioSimulado: User = {
        id: 'simulado-' + dadosUsuario.email,
        email: dadosUsuario.email,
        app_metadata: {},
        user_metadata: {},
        aud: 'authenticated',
        created_at: new Date().toISOString(),
        // ... outros campos necessários para o tipo User
    } as User; 
    
    await buscarDadosUsuario(usuarioSimulado);
    setCarregando(false);
  };

  const logout = async () => {
    setCarregando(true);
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setUsuario(null);
    setEmpresa(null);
    setCarregando(false);
  };

  return (
    <ContextoAutenticacao.Provider value={{ usuario, empresa, carregando, loginPorEmail, loginPorCodigoAcesso, logout }}>
      {children}
    </ContextoAutenticacao.Provider>
  );
};

export const useAuth = () => {
  const contexto = useContext(ContextoAutenticacao);
  if (contexto === undefined) {
    throw new Error('useAuth deve ser usado dentro de um ProvedorAutenticacao');
  }
  return contexto;
};