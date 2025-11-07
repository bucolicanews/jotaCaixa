import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useSessao } from './use-sessao';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { CAMPOS_USUARIO_MAPA } from '@/config/contrato-campos-mapeaveis';
import { ContratoTag } from '@/types/contratos';

interface BulkTagManagerHook {
    loading: boolean;
    isAllActive: boolean;
    toggleAllTags: (activate: boolean) => Promise<void>;
    refetchStatus: () => void;
}

/**
 * Hook para gerenciar a ativação/desativação em massa de tags de contrato para um recurso (Usuário/Cliente).
 * @param resourceId O ID do recurso (Usuário ou Cliente) que possui as tags.
 */
export function useBulkTagManager(resourceId: string | undefined): BulkTagManagerHook {
    const { perfil, role } = useSessao();
    const [loading, setLoading] = useState(true);
    const [activeTagsCount, setActiveTagsCount] = useState(0);
    const [refreshKey, setRefreshKey] = useState(0);

    const getEmpresaId = () => {
        if (role === 'Cliente') return (perfil as ClienteProfile)?.id;
        if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id;
        
        // Se for Admin, o ID da empresa para a qual a tag será criada/lida é o ID do recurso (Cliente/Usuário) que está sendo editado.
        if (role === 'Admin' && resourceId) {
            // Se o recurso for um Cliente (tem limite_usuarios), usa o ID dele.
            if (perfil && 'limite_usuarios' in perfil) return resourceId;
            // Se o recurso for um Usuário (tem cliente_id), precisamos buscar o cliente_id dele.
            // No contexto do FormPerfil, o resourceId é o ID do próprio Admin, então usamos ele.
            return resourceId;
        }
        
        return null;
    };
    
    const empresaId = getEmpresaId();
    const allMappableTags = CAMPOS_USUARIO_MAPA.map(m => m.tag);
    const isAllActive = activeTagsCount === allMappableTags.length;

    const refetchStatus = useCallback(() => {
        setRefreshKey(prev => prev + 1);
    }, []);

    const fetchTagStatus = useCallback(async () => {
        if (!resourceId || !empresaId) {
            setLoading(false);
            return;
        }
        
        setLoading(true);
        
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
        setLoading(false);
    }, [resourceId, empresaId, refreshKey]);

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
            if (activate) {
                // Inserir todas as tags que não estão ativas
                const tagsToInsert: Partial<ContratoTag>[] = CAMPOS_USUARIO_MAPA.map(m => ({
                    nome_tag: m.tag,
                    descricao: m.label,
                    origem_dado: `tbl_usuarios.${m.field}`,
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
            setLoading(false);
        }
    }, [resourceId, empresaId, refetchStatus]);

    return { loading, isAllActive, toggleAllTags, refetchStatus };
}