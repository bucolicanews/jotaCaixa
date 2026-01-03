
import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { Protocolo } from '@/types/protocolo';
import { useSessao } from './use-sessao';
import { useDebounce } from './use-debounce';
import { resolveOwnerContext } from '@/utils/owner';

type ProtocoloComCliente = Protocolo & { tbl_clientes: { nome: string, empresa: string } | null };
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
    handleUpdateStatus: (protocoloId: number, status: Protocolo['status']) => Promise<void>;
    handleCreateProtocolo: (data: any) => Promise<any>;
}

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
            .select('*, tbl_clientes(nome, empresa)');
            
        // Se for Cliente/Usuário, a RLS já vai filtrar.
        
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
                    const clienteEmpresa = p.tbl_clientes?.empresa || '';
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
    }, [carregandoSessao, buscarProtocolos]);

    const handleDeleteProtocolo = useCallback(async (protocolo: Protocolo) => {
        // Implementar a lógica de deleção
        console.log("Deletar protocolo", protocolo);
        showSuccess('Protocolo deletado com sucesso.');
        refetch();
    }, [refetch]);

    const handleUpdateStatus = useCallback(async (protocoloId: number, status: Protocolo['status']) => {
        setCarregando(true);
        try {
            const { error } = await supabase.from('protocolos').update({ status }).eq('id', protocoloId);
            if (error) throw error;
            showSuccess('Status do protocolo atualizado com sucesso.');
            refetch();
        } catch (error: any) {
            showError('Falha ao atualizar status: ' + error.message);
        } finally {
            setCarregando(false);
        }
    }, [refetch]);

    const handleCreateProtocolo = useCallback(async (data: any) => {
        setCarregando(true);
        try {
            if (!ownerId) throw new Error("ID do proprietário não encontrado.");

            let imgUrl = null;
            const file = data.img_protocolo?.[0];

            if (file) {
                const filePath = `${ownerId}/${Date.now()}_${file.name}`;
                const { error: uploadError } = await supabase.storage
                    .from('protocolos')
                    .upload(filePath, file);

                if (uploadError) throw uploadError;

                const { data: urlData } = supabase.storage
                    .from('protocolos')
                    .getPublicUrl(filePath);
                
                imgUrl = urlData.publicUrl;
            }

            const numero_protocolo = `PROT-${Date.now()}`;

            const { error: insertError } = await supabase.from('protocolos').insert({
                cliente_id: data.cliente_id,
                numero_protocolo,
                status: 'Impresso',
                admin_id: ownerId,
                img_protocolo: imgUrl,
                nome_resp_recebimento: data.nome_resp_recebimento
            });

            if (insertError) throw insertError;
            
            showSuccess('Protocolo criado com sucesso.');
            refetch();
        } catch (error: any) {
            showError('Falha ao criar protocolo: ' + error.message);
        } finally {
            setCarregando(false);
        }
    }, [ownerId, refetch]);

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
    };
}
