import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { Protocolo } from '@/types/protocolo';
import { useSessao } from './use-sessao';
import { useDebounce } from './use-debounce';
import { resolveOwnerContext } from '@/utils/owner';
import { v4 as uuidv4 } from 'uuid';


type ProtocoloComCliente = Protocolo & { tbl_clientes: { nome: string } | null };
export type ProtocoloStatus = Protocolo['status'] | 'todos';
export type OrdenacaoProtocolos = 'created_at_desc' | 'cliente_asc';

interface ProtocolosHook {
    protocolos: ProtocoloComCliente[];
    carregando: boolean;
    refetch: () => void;

    // Filters/Sorting State
    filtroTexto: string;
    setFiltroTexto: (text: string) => void;
    filtroStatus: ProtocoloStatus;
    setFiltroStatus: (status: ProtocoloStatus) => void;
    ordenacao: OrdenacaoProtocolos;
    setOrdenacao: (order: OrdenacaoProtocolos) => void;

    // Mutations
    handleDeleteProtocolo: (protocolo: Protocolo) => Promise<void>;
    handleUpdateStatus: (protocoloId: string, status: Protocolo['status']) => Promise<void>;
    handleCreateProtocolo: (data: any) => Promise<any>;
    handleUpdateProtocolo: (protocoloId: string, data: any) => Promise<void>;
}

const PROTOCOLO_BUCKET = 'protocolos_files';

export function useProtocolos(): ProtocolosHook {
    const { role, perfil, usuario, carregando: carregandoSessao } = useSessao();
    const [protocolos, setProtocolos] = useState<ProtocoloComCliente[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);

    // Filters/Sorting State
    const [filtroTexto, setFiltroTexto] = useState('');
    const filtroTextoDebounced = useDebounce(filtroTexto, 500);
    const [filtroStatus, setFiltroStatus] = useState<ProtocoloStatus>('todos');
    const [ordenacao, setOrdenacao] = useState<OrdenacaoProtocolos>('created_at_desc');

    const isAdmin = role === 'Admin';
    const { ownerId } = resolveOwnerContext(role, perfil, usuario?.id);

    const refetch = useCallback(() => {
        setRefreshKey(prev => prev + 1);
    }, []);

    const buscarProtocolos = useCallback(async () => {
        if (!ownerId && !isAdmin) {
            setProtocolos([]);
            setCarregando(false);
            return;
        }
        
        setCarregando(true);
        
        let query = supabase
            .from('protocolos')
            .select('*, tbl_clientes(nome)');
        
        // Aplica ordenação
        let ascending = true;
        let orderByColumn = 'created_at';
        
        if (ordenacao === 'cliente_asc') {
            // Ordenação por cliente será feita no frontend
        } else if (ordenacao === 'created_at_desc') {
            orderByColumn = 'created_at';
            ascending = false;
        }

        query = query.order(orderByColumn, { ascending: ascending });

        const { data, error } = await query;

        if (error) {
            showError('Erro ao carregar protocolos: ' + error.message);
            setProtocolos([]);
        } else {
            let fetchedProtocolos = data as ProtocoloComCliente[];
            
            // Filtragem de status (se não for 'todos')
            if (filtroStatus !== 'todos') {
                fetchedProtocolos = fetchedProtocolos.filter(p => p.status === filtroStatus);
            }
            
            // Filtragem de texto
            const termoBusca = filtroTextoDebounced.toLowerCase();
            if (termoBusca) {
                fetchedProtocolos = fetchedProtocolos.filter(p => {
                    const clienteNome = p.tbl_clientes?.nome || '';
                    const clienteEmpresa = p.tbl_clientes?.nome || ''; // Usando nome como fallback
                    return clienteNome.toLowerCase().includes(termoBusca) ||
                           clienteEmpresa.toLowerCase().includes(termoBusca) ||
                           p.numero_protocolo.toLowerCase().includes(termoBusca) ||
                           p.status.toLowerCase().includes(termoBusca);
                });
            }
            
            // Ordenação por cliente (se selecionado)
            if (ordenacao === 'cliente_asc') {
                fetchedProtocolos.sort((a, b) => (a.tbl_clientes?.nome || '').localeCompare(b.tbl_clientes?.nome || ''));
            }
            
            setProtocolos(fetchedProtocolos);
        }
        setCarregando(false);
    }, [ownerId, isAdmin, filtroStatus, filtroTextoDebounced, ordenacao, refreshKey]);

    useEffect(() => {
        if (!carregandoSessao) {
            buscarProtocolos();
        }
    }, [carregandoSessao, buscarProtocolos, refreshKey]);

    const uploadFile = async (file: File, path: string) => {
        const { data, error } = await supabase.storage.from(PROTOCOLO_BUCKET).upload(path, file, {
            cacheControl: '3600',
            upsert: false
        });
        
        if (error) {
            console.error('Erro no upload:', error);
            throw new Error(`Erro no upload do arquivo ${file.name}: ${error.message}`);
        }
        
        const { data: { publicUrl } } = supabase.storage.from(PROTOCOLO_BUCKET).getPublicUrl(path);
        return publicUrl;
    };

    const handleCreateProtocolo = useCallback(async (data: any) => {
        if (!ownerId) throw new Error("ID do proprietário não encontrado.");
        if (!usuario) throw new Error("Usuário não encontrado.");

        const protocolUUID = uuidv4();
        const anexosFiles = data.anexos ? Array.from(data.anexos) : [];

        // 1. Upload dos anexos (se houver)
        const anexosUrls = await Promise.all(
            anexosFiles.map((file: File) => {
                const anexoPath = `${data.id_cliente}/${protocolUUID}/${uuidv4()}-${file.name}`;
                return uploadFile(file, anexoPath);
            })
        );
        
        // 2. Gerar número do protocolo automaticamente
        const timestamp = new Date().getTime();
        const numeroProtocolo = `PROT-${timestamp.toString().slice(-8)}`;
        
        // 3. Inserir no banco de dados
        const { error: insertError } = await supabase.from('protocolos').insert({
            cliente_id: data.id_cliente,
            numero_protocolo: numeroProtocolo,
            titulo: data.titulo,
            descricao: data.descricao || null,
            link_tarefa: data.link_tarefa || null,
            status: 'Criado',
            admin_id: ownerId,
            anexos: anexosUrls.length > 0 ? anexosUrls : null,
            data_criacao: new Date().toISOString(),
            usuario_criador_nome: usuario.nome || usuario.email || 'Usuário',
            // criado_por usa DEFAULT auth.uid() automaticamente
        });

        if (insertError) throw insertError;
        
        refetch();
    }, [ownerId, usuario, refetch]);

    const handleDeleteProtocolo = useCallback(async (protocolo: Protocolo) => {
        // Verificar se é Admin
        if (role !== 'Admin') {
            showError('Apenas administradores podem excluir protocolos.');
            return;
        }

        // Verificar se o protocolo pode ser excluído (apenas Criado ou Impresso)
        if (protocolo.status !== 'Criado' && protocolo.status !== 'Impresso') {
            showError('Apenas protocolos com status "Criado" ou "Impresso" podem ser excluídos.');
            return;
        }

        setCarregando(true);
        try {
            // Deletar arquivos do storage se houver anexos
            if (protocolo.anexos && protocolo.anexos.length > 0) {
                const filesToDelete = protocolo.anexos.map(url => {
                    const urlParts = url.split('/');
                    const bucketIndex = urlParts.findIndex(part => part === PROTOCOLO_BUCKET);
                    if (bucketIndex !== -1) {
                        return urlParts.slice(bucketIndex + 1).join('/');
                    }
                    return null;
                }).filter(Boolean);

                if (filesToDelete.length > 0) {
                    await supabase.storage.from(PROTOCOLO_BUCKET).remove(filesToDelete as string[]);
                }
            }

            // Deletar protocolo do banco
            const { error } = await supabase.from('protocolos').delete().eq('id', protocolo.id);
            
            if (error) throw error;
            
            showSuccess('Protocolo deletado com sucesso.');
            refetch();
        } catch (error: any) {
            showError(`Erro ao deletar protocolo: ${error.message}`);
        } finally {
            setCarregando(false);
        }
    }, [refetch, role]);

    const handleUpdateStatus = useCallback(async (protocoloId: string, status: Protocolo['status']) => {
        setCarregando(true);
        try {
            const updates: any = { status };
            
            if (status === 'Impresso') {
                updates.data_impressao = new Date().toISOString();
            } else if (status === 'Entregue') {
                updates.data_recebimento = new Date().toISOString();
            }
            
            const { error } = await supabase.from('protocolos').update(updates).eq('id', protocoloId);
            if (error) throw error;
            
            showSuccess('Status atualizado com sucesso.');
            refetch();
        } catch (error: any) {
            showError('Falha ao atualizar status: ' + error.message);
        } finally {
            setCarregando(false);
        }
    }, [refetch]);

    const handleUpdateProtocolo = useCallback(async (protocoloId: string, data: any) => {
        const protocolo = protocolos.find(p => p.id === protocoloId);
        
        if (!protocolo) {
            showError('Protocolo não encontrado.');
            return;
        }

        if (protocolo.status !== 'Criado' && protocolo.status !== 'Impresso') {
            showError('Apenas protocolos com status "Criado" ou "Impresso" podem ser editados.');
            return;
        }

        setCarregando(true);
        try {
            const anexosFiles = data.anexos ? Array.from(data.anexos) : [];
            let anexosUrls = protocolo.anexos || [];

            if (anexosFiles.length > 0) {
                const newAnexosUrls = await Promise.all(
                    anexosFiles.map((file: File) => {
                        const anexoPath = `${data.id_cliente}/${protocoloId}/${uuidv4()}-${file.name}`;
                        return uploadFile(file, anexoPath);
                    })
                );
                anexosUrls = [...anexosUrls, ...newAnexosUrls];
            }

            const { error } = await supabase.from('protocolos').update({
                cliente_id: data.id_cliente,
                titulo: data.titulo,
                descricao: data.descricao || null,
                link_tarefa: data.link_tarefa || null,
                anexos: anexosUrls.length > 0 ? anexosUrls : null,
            }).eq('id', protocoloId);

            if (error) throw error;
            
            showSuccess('Protocolo atualizado com sucesso.');
            refetch();
        } catch (error: any) {
            showError(`Erro ao atualizar protocolo: ${error.message}`);
        } finally {
            setCarregando(false);
        }
    }, [protocolos, refetch]);

    return {
        protocolos,
        carregando,
        refetch,

        // Filters/Sorting State
        filtroTexto,
        setFiltroTexto,
        filtroStatus,
        setFiltroStatus,
        ordenacao,
        setOrdenacao,

        // Mutations
        handleDeleteProtocolo,
        handleUpdateStatus,
        handleCreateProtocolo,
        handleUpdateProtocolo,
    };
}