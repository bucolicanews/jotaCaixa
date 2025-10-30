import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { ContratoTag } from '@/types/contratos';
import { useSessao } from './use-sessao';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';

interface TagMetadata {
    label: string;
    tag: string;
    field: string; // Adicionado para resolver TS2339
}

/**
 * Hook para gerenciar o estado de tags dinâmicas de um recurso (Cliente ou Usuário).
 * @param resourceId O ID do recurso (Cliente ou Usuário) que está sendo editado.
 * @param tagMetadata O mapeamento da tag (nome e descrição).
 */
export function useTagManager(resourceId: string | undefined, tagMetadata: TagMetadata) {
    const { perfil, role } = useSessao();
    const [isTagActive, setIsTagActive] = useState(false);
    const [loading, setLoading] = useState(true);

    const getEmpresaId = () => {
        if (role === 'Cliente') return (perfil as ClienteProfile)?.id;
        if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id;
        return null;
    };
    
    const empresaId = getEmpresaId();

    const fetchTagStatus = useCallback(async () => {
        if (!resourceId || !empresaId) {
            setLoading(false);
            return;
        }
        
        setLoading(true);
        const { data, error } = await supabase
            .from('contrato_tags')
            .select('id')
            .eq('nome_tag', tagMetadata.tag)
            .eq('empresa_id', empresaId)
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = No rows found
            console.error('Erro ao buscar status da tag:', error);
        }
        
        setIsTagActive(!!data);
        setLoading(false);
    }, [resourceId, empresaId, tagMetadata.tag]);

    useEffect(() => {
        fetchTagStatus();
    }, [fetchTagStatus]);

    const toggleTag = useCallback(async (activate: boolean) => {
        if (!resourceId || !empresaId) {
            showError('Não foi possível determinar a empresa para gerenciar a tag.');
            return;
        }
        
        setLoading(true);
        
        if (activate) {
            // Inserir Tag
            const dataToInsert: Partial<ContratoTag> & { empresa_id: string } = {
                nome_tag: tagMetadata.tag,
                descricao: tagMetadata.label,
                origem_dado: `clientes.${tagMetadata.field}`,
                empresa_id: empresaId,
            };
            
            const { error } = await supabase
                .from('contrato_tags')
                .insert(dataToInsert);
                
            if (error) {
                showError(`Falha ao criar tag ${tagMetadata.tag}: ${error.message}`);
            } else {
                showSuccess(`Tag ${tagMetadata.tag} criada com sucesso!`);
                setIsTagActive(true);
            }
        } else {
            // Remover Tag
            const { error } = await supabase
                .from('contrato_tags')
                .delete()
                .eq('nome_tag', tagMetadata.tag)
                .eq('empresa_id', empresaId);
                
            if (error) {
                showError(`Falha ao remover tag ${tagMetadata.tag}: ${error.message}`);
            } else {
                showSuccess(`Tag ${tagMetadata.tag} removida.`);
                setIsTagActive(false);
            }
        }
        setLoading(false);
    }, [resourceId, empresaId, tagMetadata]);

    return { isTagActive, loading, toggleTag };
}