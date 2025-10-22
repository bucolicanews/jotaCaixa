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
  aprovado: boolean;
}

export interface UsuarioProfile {
  id: string;
  nome: string;
  email: string;
  cliente_id: string | null;
  permissoes: Record<string, boolean>; // Ex: { "contas_pagar": true, "relatorios": false }
}

export type AnyProfile = AdminProfile | ClienteProfile | UsuarioProfile | null;

export interface DadosSessao {
  usuario: User | null;
  perfil: AnyProfile;
  role: UserRole;
  carregando: boolean;
}