import { User } from '@supabase/supabase-js';

export type TipoUsuario = 'Admin' | 'Cliente' | 'Funcionario';

export interface PerfilUsuario {
  id: string; // auth.users id
  nome: string;
  email: string;
  tipo_usuario: TipoUsuario;
  criado_em: string;
  atualizado_em: string;
}

export interface DadosSessao {
  usuario: User | null;
  perfil: PerfilUsuario | null;
  empresaId: string | null;
  carregando: boolean;
}