import { useSessao } from './use-sessao';

/**
 * Hook para acessar o contexto do proprietário (owner) resolvido a partir da sessão.
 * Fornece o `ownerId` que deve ser usado em todas as consultas de dados multi-tenant.
 */
export const useOwner = () => {
  const { ownerId, ownerType, sourceProfileId } = useSessao();

  return { ownerId, ownerType, sourceProfileId };
};
