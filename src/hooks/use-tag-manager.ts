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
 * @param resourceId O ID do recurso (Cliente CR, Cliente do Sistema ou Usuário) que está sendo editado.
 * @param tagMetadata O mapeamento da tag (nome e descrição).
 * @param refreshKey Chave para forçar a re-busca do estado.
 */
export function useTagManager(resourceId: string | undefined, tagMetadata: TagMetadata, refreshKey: number) {
    const { perfil, role, usuario } = useSessao();
    const [isTagActive, setIsTagActive] = useState(false);
    const [loading, setLoading] = useState(true);

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
    
    // Determina a origem do dado (clientes para Cliente CR, tbl_usuarios para Usuário)
    const isUserScope = perfil && 'cliente_id' in perfil;
    const origemDado = isUserScope ? `tbl_usuarios` : `clientes`;

    const fetchTagStatus = useCallback(async () => {
        if (!resourceId || !empresaId) {
            setLoading(false);
            return;
        }
        
        setLoading(true);
        
        // CORREÇÃO: Usando 'in' com um array de um único item para forçar a interpretação literal da string da tag.
        const { data, error } = await supabase
            .from('contrato_tags')
            .select('id')
            .in('nome_tag', [tagMetadata.tag]) // Usando IN
            .eq('empresa_id', empresaId)
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = No rows found
            // Se o erro for 406, logamos o problema, mas não paramos o app
            if (error.code === '406') {
                console.error(`[useTagManager] Erro 406 ao buscar tag ${tagMetadata.tag}. Verifique a codificação do nome da tag.`, error);
            } else {
                console.error('Erro ao buscar status da tag:', error);
            }
        }
        
        setIsTagActive(!!data);
        setLoading(false);
    }, [resourceId, empresaId, tagMetadata.tag, refreshKey]); // Adicionando refreshKey aqui

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
                origem_dado: `${origemDado}.${tagMetadata.field}`, // Usando a origem correta
                empresa_id: empresaId,
            };
            
            const { error } = await supabase
                .from('contrato_tags')
                .upsert(dataToInsert, { onConflict: 'nome_tag, empresa_id' });
                
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
    }, [resourceId, empresaId, tagMetadata, origemDado]);

    return { isTagActive, loading, toggleTag };
}