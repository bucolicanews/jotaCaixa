import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from './use-sessao';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';

interface MapeamentoItem {
    codigo_nivel_1: string;
    tipo_natureza: 'Ativo' | 'Passivo' | 'Patrimonio Liquido' | 'Receita' | 'Despesa';
}

interface MapeamentoContabilHook {
    mapeamento: MapeamentoItem[];
    loading: boolean;
    refetch: () => void;
}

/**
 * Hook que busca o mapeamento de códigos de nível 1 (1, 2, 3, 4, 5) para a natureza contábil.
 */
export function useMapeamentoContabil(): MapeamentoContabilHook {
    const { usuario, perfil, role, carregando: carregandoSessao } = useSessao();
    const [mapeamento, setMapeamento] = useState<MapeamentoItem[]>([]);
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

    const fetchMapeamento = useCallback(async () => {
        if (!ownerId || carregandoSessao) {
            setLoading(false);
            return;
        }
        
        setLoading(true);
        
        const { data, error } = await supabase
            .from('configuracao_contabil')
            .select('codigo_nivel_1, tipo_natureza')
            .eq('proprietario_id', ownerId);

        if (error) {
            console.error('Erro ao buscar mapeamento contábil:', error);
            setMapeamento([]);
        } else {
            setMapeamento(data as MapeamentoItem[]);
        }
        setLoading(false);
    }, [ownerId, carregandoSessao, refreshKey]);

    useEffect(() => {
        fetchMapeamento();
    }, [fetchMapeamento]);

    return { mapeamento, loading, refetch };
}