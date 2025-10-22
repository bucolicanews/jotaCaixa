import { User } from '@supabase/supabase-js';

export type UserRole = 'Admin' | 'Cliente' | 'Usuario' | null;

export interface AdminProfile {
  id: string;
  nome: string;
  email: string;
}

export interface ClienteProfile {
  id: string;
  nome: string;
  email: string;
  limite_usuarios: number;
}

export interface UsuarioProfile {
  id: string;
  nome: string;
  email: string;
  cliente_id: string;
}

export type AnyProfile = AdminProfile | ClienteProfile | UsuarioProfile | null;

export interface DadosSessao {
  usuario: User | null;
  perfil: AnyProfile;
  role: UserRole;
  carregando: boolean;
}