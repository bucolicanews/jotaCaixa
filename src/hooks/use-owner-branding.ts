import { useState, useEffect, useCallback } from 'react';
import { useSessao } from './use-sessao';
import { ClienteProfile, AdminProfile, UsuarioProfile, AdminUsuarioProfile } from '@/types/usuario';
import { supabase } from '@/integrations/supabase/client';

interface OwnerBranding {
  ownerName: string;
  logoUrl: string | null;
  loading: boolean;
}

/**
 * Hook para buscar o nome e a URL da logo do proprietário (Admin ou Cliente)
 * para uso em relatórios e branding.
 */
export function useOwnerBranding(): OwnerBranding {
  const { perfil, role, carregando } = useSessao();
  const [branding, setBranding] = useState<Omit<OwnerBranding, 'loading'>>({ ownerName: 'Carregando...', logoUrl: null });
  const [loading, setLoading] = useState(true);

  const fetchBranding = useCallback(async () => {
    if (carregando || !perfil) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    
    let ownerId: string | null = null;
    let tableName: 'tbl_admins' | 'tbl_clientes' | null = null;
    
    if (role === 'Admin') {
      ownerId = perfil.id;
      tableName = 'tbl_admins';
    } else if (role === 'Cliente') {
      ownerId = perfil.id;
      tableName = 'tbl_clientes';
    } else if (role === 'Usuario') {
      const user = perfil as UsuarioProfile | AdminUsuarioProfile;
      
      // Se o usuário estiver vinculado a um cliente, usa o branding do cliente
      if ('cliente_id' in user && user.cliente_id) {
        ownerId = user.cliente_id;
        tableName = 'tbl_clientes';
      } 
      // Se o usuário estiver vinculado a um admin, usa o branding do admin
      else if ('admin_id' in user && user.admin_id) {
        ownerId = user.admin_id;
        tableName = 'tbl_admins';
      }
    }
    
    if (ownerId && tableName) {
      const { data, error } = await supabase
        .from(tableName)
        .select('nome, logo_url')
        .eq('id', ownerId)
        .single();
        
      if (error && error.code !== 'PGRST116') {
        console.error(`Error fetching branding for ${tableName}:`, error);
        // Fallback para o nome do perfil logado se a busca falhar
        setBranding({ ownerName: perfil.nome || 'N/A', logoUrl: null });
      } else if (data) {
        // Usa o nome da empresa/admin (data.nome) como título principal
        setBranding({ ownerName: data.nome || perfil.nome || 'N/A', logoUrl: data.logo_url });
      } else {
        setBranding({ ownerName: perfil.nome || 'N/A', logoUrl: null });
      }
    } else {
      // Se não for Admin/Cliente e não estiver vinculado, usa o nome do perfil logado
      setBranding({ ownerName: perfil.nome || 'N/A', logoUrl: null });
    }
    
    setLoading(false);
  }, [perfil, role, carregando]);

  useEffect(() => {
    fetchBranding();
  }, [fetchBranding]);

  return { ...branding, loading };
}