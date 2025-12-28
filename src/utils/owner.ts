import { AnyProfile, UserRole, AdminUsuarioProfile, ClienteProfile, UsuarioProfile, AdminProfile } from '@/types/usuario';

type OwnerType = 'Admin' | 'Cliente' | 'AdminUsuario' | 'ClienteUsuario' | 'Unknown';

export interface OwnerContext {
  ownerId: string | null;
  ownerType: OwnerType;
  sourceProfileId: string | null;
}

const hasAdminId = (perfil: AnyProfile): perfil is AdminUsuarioProfile =>
  !!perfil && 'admin_id' in perfil && typeof perfil.admin_id === 'string' && perfil.admin_id.trim().length > 0;

const hasClienteId = (perfil: AnyProfile): perfil is UsuarioProfile =>
  !!perfil && 'cliente_id' in perfil && typeof perfil.cliente_id === 'string' && perfil.cliente_id.trim().length > 0;

const isClienteProfile = (perfil: AnyProfile): perfil is ClienteProfile =>
  !!perfil && 'limite_usuarios' in perfil && typeof perfil.id === 'string';

const isAdminProfile = (perfil: AnyProfile): perfil is AdminProfile =>
  !!perfil && 'plano' in perfil && typeof perfil.id === 'string';

/**
 * Resolve o ID do proprietário (Admin ou Cliente) que deve ser usado para consultas
 * multi-tenant. Garante que funcionários vinculados a um Admin/Cliente utilizem o ID do proprietário.
 * ESTA É A ÚNICA FONTE DE VERDADE PARA A LÓGICA DE PROPRIETÁRIO.
 */
export const resolveOwnerContext = (
  role: UserRole,
  perfil: AnyProfile,
): OwnerContext => {
  if (role === 'Admin' && isAdminProfile(perfil)) {
    return { ownerId: perfil.id, ownerType: 'Admin', sourceProfileId: perfil.id };
  }

  if (role === 'Cliente' && isClienteProfile(perfil)) {
    return { ownerId: perfil.id, ownerType: 'Cliente', sourceProfileId: perfil.id };
  }

  if (role === 'Usuario' && perfil) {
    // Prioridade 1: Usuário de Admin (usa admin_id)
    if (hasAdminId(perfil)) {
      return { ownerId: perfil.admin_id, ownerType: 'AdminUsuario', sourceProfileId: perfil.id };
    }
    // Prioridade 2: Usuário de Cliente (usa cliente_id)
    if (hasClienteId(perfil)) {
      return { ownerId: perfil.cliente_id, ownerType: 'ClienteUsuario', sourceProfileId: perfil.id };
    }
  }

  // Fallback para garantir que um ID de usuário não se torne um ownerId por engano.
  const sourceId = perfil?.id ?? null;
  return { ownerId: null, ownerType: 'Unknown', sourceProfileId: sourceId };
};