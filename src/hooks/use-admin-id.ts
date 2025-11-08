import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';

/**
 * Hook que busca o ID do primeiro administrador (Admin principal) do sistema.
 * Usado para operações que dependem da configuração global (ex: Stripe keys).
 */
export function useAdminId() {
  const [adminId, setAdminId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAdminId = useCallback(async () => {
    setLoading(true);
    try {
      // Busca o ID do primeiro Admin (LIMIT 1)
      const { data, error } = await supabase
        .from('tbl_admins')
        .select('id')
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = No rows found
        console.error('Erro ao buscar Admin ID:', error);
        showError('Falha ao carregar a configuração do administrador.');
        setAdminId(null);
      } else if (data) {
        setAdminId(data.id);
      } else {
        setAdminId(null);
      }
    } catch (e) {
      console.error('Erro inesperado ao buscar Admin ID:', e);
      setAdminId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAdminId();
  }, [fetchAdminId]);

  return { adminId, loading };
}