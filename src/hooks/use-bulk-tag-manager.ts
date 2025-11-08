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
        setRefreshKey(prev => prev + 1);
    }, []);

    const fetchTagStatus = useCallback(async () => {
        if (!resourceId || !empresaId) {
            setLoading(false); // CORREÇÃO 1: Resolve o loading se IDs estiverem faltando
            return;
        }
        
        setLoading(true);
        
        try {
            // Busca todas as tags ativas que correspondem às tags mapeáveis
            const { data, error } = await supabase
                .from('contrato_tags')
                .select('id')
                .eq('empresa_id', empresaId)
                .in('nome_tag', allMappableTags);

            if (error && error.code !== 'PGRST116') {
                console.error('Erro ao buscar status das tags:', error);
                setActiveTagsCount(0);
            } else {
                setActiveTagsCount(data?.length || 0);
            }
        } catch (e) {
            console.error('Erro inesperado ao buscar status das tags:', e);
            setActiveTagsCount(0);
        } finally {
            setLoading(false); // CORREÇÃO 2: Sempre resolve o loading
        }
    }, [resourceId, empresaId, refreshKey, allMappableTags]);

    useEffect(() => {
        fetchTagStatus();
    }, [fetchTagStatus]);

    const toggleAllTags = useCallback(async (activate: boolean) => {
        if (!resourceId || !empresaId) {
            showError('Não foi possível determinar a empresa para gerenciar as tags.');
            return;
        }
        
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
                
                // Usamos upsert para garantir que não haja duplicatas
                const { error } = await supabase
                    .from('contrato_tags')
                    .upsert(tagsToInsert, { onConflict: 'nome_tag, empresa_id' });
                    
                if (error) throw error;
                
                showSuccess('Todas as tags ativas foram marcadas!');
            } else {
                // Remover todas as tags mapeáveis
                const { error } = await supabase
                    .from('contrato_tags')
                    .delete()
                    .eq('empresa_id', empresaId)
                    .in('nome_tag', allMappableTags);
                    
                if (error) throw error;
                
                showSuccess('Todas as tags ativas foram desmarcadas.');
            }
            
            // Força a re-busca do status e dos componentes individuais
            refetchStatus();
            
        } catch (error: any) {
            showError(`Falha ao alterar tags: ${error.message}`);
        } finally {
            setLoading(false); // CORREÇÃO 3: Sempre resolve o loading após a mutação
        }
    }, [resourceId, empresaId, isUserScope, refetchStatus, allMappableTags]);

    return { loading, isAllActive, toggleAllTags, refetchStatus, refreshKey };
}