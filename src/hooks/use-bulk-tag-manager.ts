import { useState, useCallback } from 'react';

interface BulkTagManagerHook {
    loading: boolean;
    isAllActive: boolean;
    toggleAllTags: (activate: boolean) => Promise<void>;
    refetchStatus: () => void;
    refreshKey: number;
}

/**
 * Hook para gerenciar a ativação/desativação em massa de tags de contrato para um recurso (Usuário/Cliente).
 * 
 * NOTA: A funcionalidade de bulk foi removida devido a problemas de sincronização de estado.
 * Este hook agora serve apenas para fornecer uma chave de atualização (refreshKey)
 * para forçar a re-busca das tags individuais (useTagManager).
 * 
 * @param _resourceId O ID do recurso (não usado diretamente para mutação aqui).
 */
export function useBulkTagManager(_resourceId: string | undefined): BulkTagManagerHook {
    const [refreshKey, setRefreshKey] = useState(0);

    const refetchStatus = useCallback(() => {
        setRefreshKey(prev => prev + 1);
    }, []);

    // Implementações vazias para as funções removidas
    const toggleAllTags = useCallback(async (_activate: boolean) => {
        // Funcionalidade removida
    }, []);

    return { 
        loading: false, 
        isAllActive: false, 
        toggleAllTags, 
        refetchStatus, 
        refreshKey 
    };
}