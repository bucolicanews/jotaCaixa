import { User } from '@supabase/supabase-js';

export interface Perfil {
  id: string;
  nome: 'Admin' | 'Empresa' | 'Usuario';
}

export interface PerfilUsuario {
  id: string;
  nome: string;
  email: string;
  perfil_id: string;
  tbl_perfil: Perfil | null;
  criado_em: string;
  atualizado_em: string;
}

export interface DadosSessao {
  usuario: User | null;
  perfil: PerfilUsuario | null;
  carregando: boolean;
}