import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from './use-sessao';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';

// Define o tipo de mapeamento esperado
export type ContabilConfigMap = Record<'Ativo' | 'Passivo' | 'Patrimonio Liquido' | 'Receita' | 'Custo' | 'Despesa', string | undefined>;

interface ContabilConfigHook {
  configMap: ContabilConfigMap;
  loading: boolean;
  refetch: () => void;
}

const DEFAULT_CONFIG_MAP: ContabilConfigMap = {
    'Ativo': '1',
    'Passivo': '2',
    'Patrimonio Liquido': '3', // CORRIGIDO: 3 é PL
    'Receita': '4', // CORRIGIDO: 4 é Receita
    'Custo': '5', // CORRIGIDO: 5 é Custo (ou Despesa)
    'Despesa': '6', // CORRIGIDO: 6 é Despesa (usando 6 como fallback, mas o usuário mencionou 5)
};

/**
 * Hook que busca o mapeamento de categorias contábeis (Receita, Despesa, etc.)
 * para os códigos de nível 1 do Plano de Contas do proprietário.
 * Se não houver configuração, retorna os padrões (1, 2, 3, 4, 5, 6).
 */
export function useContabilConfig(): ContabilConfigHook {
  const { usuario, perfil, role, carregando: carregandoSessao } = useSessao();
  const [configMap, setConfigMap] = useState<ContabilConfigMap>(DEFAULT_CONFIG_MAP);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const getOwnerId = () => {
    if (role === 'Admin') return usuario?.id || null;
    if (role === 'Cliente') return (perfil as ClienteProfile)?.id || null;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id || null;
    return null;
  };
  
  const ownerId = getOwnerId();

  const refetch = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  const fetchConfig = useCallback(async () => {
    if (!ownerId || carregandoSessao) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    
    const { data, error } = await supabase
      .from('configuracao_contabil')
      .select('codigo_nivel_1, tipo_natureza')
      .eq('proprietario_id', ownerId);

    if (error && error.code !== 'PGRST116') {
      console.error('Erro ao carregar configuração contábil:', error);
    } 
    
    const fetchedMap = (data || []).reduce((acc, item) => {
        (acc as any)[item.tipo_natureza] = item.codigo_nivel_1;
        return acc;
    }, {} as Partial<ContabilConfigMap>);
    
    // Mescla os defaults com os dados carregados
    setConfigMap({
        ...DEFAULT_CONFIG_MAP,
        ...fetchedMap
    });
    
    setLoading(false);
  }, [ownerId, carregandoSessao, refreshKey]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  return { configMap, loading, refetch };
}