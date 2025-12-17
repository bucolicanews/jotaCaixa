import { AnyProfile, UserRole, AdminUsuarioProfile, ClienteProfile, UsuarioProfile } from '@/types/usuario';

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

/**
 * Resolve o ID do proprietário (Admin ou Cliente) que deve ser usado para consultas
 * multi-tenant. Garante que funcionários vinculados a um Admin utilizem o admin_id.
 */
export const resolveOwnerContext = (
  role: UserRole,
  perfil: AnyProfile,
  usuarioId?: string | null,
): OwnerContext => {
  if (role === 'Admin') {
    return { ownerId: usuarioId ?? null, ownerType: 'Admin', sourceProfileId: usuarioId ?? null };
  }

  if (role === 'Cliente' && isClienteProfile(perfil)) {
    return { ownerId: perfil.id, ownerType: 'Cliente', sourceProfileId: perfil.id };
  }

  if (role === 'Usuario' && perfil) {
    if (hasClienteId(perfil)) {
      return { ownerId: perfil.cliente_id, ownerType: 'ClienteUsuario', sourceProfileId: perfil.id };
    }
    if (hasAdminId(perfil)) {
      return { ownerId: perfil.admin_id, ownerType: 'AdminUsuario', sourceProfileId: perfil.id };
    }
  }

  return { ownerId: null, ownerType: 'Unknown', sourceProfileId: usuarioId ?? null };
};
