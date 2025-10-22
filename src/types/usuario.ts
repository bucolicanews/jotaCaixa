import { User } from '@supabase/supabase-js';

// O tipo de perfil agora é um objeto, não mais um texto simples.
export interface Perfil {
  id: string;
  nome: 'Admin' | 'Empresa' | 'Usuario';
}

export interface PerfilUsuario {
  id: string; // auth.users id
  nome: string;
  email: string;
  perfil_id: string; // Foreign key para tbl_perfil
  tbl_perfil: Perfil | null; // Objeto do perfil (quando fazemos join)
  criado_em: string;
  atualizado_em: string;
}

export interface DadosSessao {
  usuario: User | null;
  perfil: PerfilUsuario | null;
  empresaId: string | null;
  carregando: boolean;
}