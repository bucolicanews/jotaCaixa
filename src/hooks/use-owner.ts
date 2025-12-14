import { useMemo } from 'react';
import { useSessao } from './use-sessao';
import { resolveOwnerContext } from '@/utils/owner';

export const useOwner = () => {
  const { usuario, perfil, role } = useSessao();

  return useMemo(() => resolveOwnerContext(role, perfil, usuario?.id), [role, perfil, usuario?.id]);
};
