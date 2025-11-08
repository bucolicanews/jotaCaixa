import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useSessao } from './use-sessao';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { CAMPOS_USUARIO_MAPA } from '@/config/contrato-campos-mapeaveis';
import { ContratoTag } from '@/types/contratos';
import { CAMPOS_CLIENTE_MAPA } from '@/config/contrato-campos-mapeaveis'; // Importando mapeamento de cliente

interface BulkTagManagerHook {
    loading: boolean;
    isAllActive: boolean;
    toggleAllTags: (activate: boolean) => Promise<void>;
    refetchStatus: () => void;
    refreshKey: number; // ADICIONADO
}

/**
 * Hook para gerenciar a ativação/desativação em massa de tags de contrato para um recurso (Usuário/Cliente).
 * @param resourceId O ID do recurso (Usuário, Cliente CR ou Cliente do Sistema) que possui as tags.
 */
export function useBulkTagManager(resourceId: string | undefined): BulkTagManagerHook {
    const { perfil, role, usuario } = useSessao();
    const [loading, setLoading] = useState(true);
    const [activeTagsCount, setActiveTagsCount] = useState(0);
    const [refreshKey, setRefreshKey] = useState(0);

    const isUserScope = perfil && 'cliente_id' in perfil;
    
    const getOwnerId = () => {
        // 1. Se for Admin, o proprietário da tag é o próprio Admin logado.
        if (role === 'Admin') return usuario?.id || null;
        
        // 2. Se for Cliente (do sistema), o proprietário da tag é o próprio Cliente logado.
        if (role === 'Cliente') return (perfil as ClienteProfile)?.id;
        
        // 3. Se for Usuário (funcionário), o proprietário da tag é o Cliente_ID.
        if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id;
        
        return null;
    };
    
    const empresaId = getOwnerId();
    
    // Determina qual mapa de tags usar
    const allMappableTags = isUserScope ? CAMPOS_USUARIO_MAPA.map(m => m.tag) : CAMPOS_CLIENTE_MAPA.map(m => m.tag);
    const isAllActive = activeTagsCount === allMappableTags.length && allMappableTags.length > 0;

    const refetchStatus = useCallback(() => {
        console.log(`[BulkTagManager] Forçando re-busca de status. Key: ${refreshKey + 1}`);
        setRefreshKey(prev => prev + 1);
    }, [refreshKey]);

    const fetchTagStatus = useCallback(async () => {
        if (!resourceId || !empresaId) {
            console.log('[BulkTagManager] Status: Skipping fetch (no resourceId or empresaId).');
            setLoading(false);
            return;
        }
        
        console.log(`[BulkTagManager] Status: Fetching active tags for ${empresaId}.`);
        setLoading(true);
        
        try {
            const { count, error } = await supabase
                .from('contrato_tags')
                .select('id', { count: 'exact', head: true })
                .eq('empresa_id', empresaId)
                .in('nome_tag', allMappableTags);

            if (error && error.code !== 'PGRST116') { // PGRST116 = No rows found
                console.error('[BulkTagManager] Erro ao buscar status da tag:', error);
                setActiveTagsCount(0);
            } else {
                const countValue = count || 0;
                setActiveTagsCount(countValue);
                console.log(`[BulkTagManager] Status: Found ${countValue} active tags out of ${allMappableTags.length}.`);
            }
        } catch (e) {
            console.error('[BulkTagManager] Erro inesperado ao buscar status das tags:', e);
            setActiveTagsCount(0);
        } finally {
            setLoading(false);
            console.log('[BulkTagManager] Status: Fetch finished. Loading set to false.');
        }
    }, [resourceId, empresaId, allMappableTags, refreshKey]); // Adicionando refreshKey aqui para forçar a re-execução

    useEffect(() => {
        fetchTagStatus();
    }, [fetchTagStatus, refreshKey]); // Adicionando refreshKey aqui para forçar a re-execução

    const toggleAllTags = useCallback(async (activate: boolean) => {
        if (!resourceId || !empresaId) {
            showError('Não foi possível determinar a empresa para gerenciar as tags.');
            return;
        }
        
        console.log(`[BulkTagManager] ToggleAllTags: Starting operation (activate: ${activate}).`);
        setLoading(true);
        
        try {
            const targetMap = isUserScope ? CAMPOS_USUARIO_MAPA : CAMPOS_CLIENTE_MAPA;
            const origemDado = isUserScope ? `tbl_usuarios` : `clientes`; // Usamos 'clientes' para o Cliente CR
            
            if (activate) {
                // Inserir todas as tags que não estão ativas
                const tagsToInsert: Partial<ContratoTag>[] = targetMap.map(m => ({
                    nome_tag: m.tag,
                    descricao: m.label,
                    origem_dado: `${origemDado}.${m.field}`,
                    empresa_id: empresaId,
                }));
                
                console.log(`[BulkTagManager] Inserting/Upserting ${tagsToInsert.length} tags.`);
                
                // Usamos upsert para garantir que não haja duplicatas
                const { error } = await supabase
                    .from('contrato_tags')
                    .upsert(tagsToInsert, { onConflict: 'nome_tag, empresa_id' });
                    
                if (error) throw error;
                
                showSuccess('Todas as tags ativas foram marcadas!');
            } else {
                // Remover todas as tags mapeáveis
                console.log(`[BulkTagManager] Deleting all ${allMappableTags.length} mappable tags.`);
                
                const { error } = await supabase
                    .from('contrato_tags')
                    .delete()
                    .eq('empresa_id', empresaId)
                    .in('nome_tag', allMappableTags);
                    
                if (error) throw error;
                
                showSuccess('Todas as tags ativas foram desmarcadas.');
            }
            
            // Força a re-busca do status, que irá limpar o estado de loading
            refetchStatus();
            
        } catch (error: any) {
            console.error('[BulkTagManager] FATAL ERROR during toggle:', error);
            showError(`Falha ao alterar tags: ${error.message}`);
            setLoading(false); // Limpa o loading apenas em caso de falha
        }
    }, [resourceId, empresaId, isUserScope, refetchStatus, allMappableTags]);

    return { loading, isAllActive, toggleAllTags, refetchStatus, refreshKey };
}