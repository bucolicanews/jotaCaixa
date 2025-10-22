import { useContext } from 'react';
import { SessionContext } from '@/contexts/SessionContext';

/**
 * Hook para acessar os dados da sessão do usuário (perfil, empresa, etc.)
 * a partir do SessionContext global.
 */
export function useSessao() {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSessao deve ser usado dentro de um SessionProvider');
  }
  return context;
}