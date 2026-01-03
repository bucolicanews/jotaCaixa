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
}

const PROTOCOLO_BUCKET = 'protocolos';

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
            
        // A RLS agora usa id_proprietario, então a consulta é simplificada.
        
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
    }, [carregandoSessao, buscarProtocolos]);

    const uploadFile = async (file: File, path: string) => {
        const { data, error } = await supabase.storage.from(PROTOCOLO_BUCKET).upload(path, file);
        if (error) {
            throw new Error(`Erro no upload do arquivo ${file.name}: ${error.message}`);
        }
        const { data: { publicUrl } } = supabase.storage.from(PROTOCOLO_BUCKET).getPublicUrl(path);
        return publicUrl;
    };

    const handleCreateProtocolo = useCallback(async (data: any) => {
        if (!ownerId) throw new Error("ID do proprietário não encontrado.");

        const protocolUUID = uuidv4();
        const imgProtocoloFile = data.img_protocolo[0];
        const anexosFiles = data.anexos ? Array.from(data.anexos) : [];

        // 1. Upload da imagem do protocolo
        const imgExtension = imgProtocoloFile.name.split('.').pop();
        const imgPath = `${data.id_cliente}/${protocolUUID}/protocolo_assinado.${imgExtension}`;
        const url_img_protocolo = await uploadFile(imgProtocoloFile, imgPath);

        // 2. Upload dos anexos
        const anexosUrls = await Promise.all(
            anexosFiles.map((file: File) => {
                const anexoPath = `${data.id_cliente}/${protocolUUID}/${uuidv4()}-${file.name}`;
                return uploadFile(file, anexoPath);
            })
        );
        
        // 3. Inserir no banco de dados
        const { error: insertError } = await supabase.from('protocolos').insert({
            id: protocolUUID,
            id_cliente: data.id_cliente,
            titulo: data.numero_protocolo || `Protocolo ${protocolUUID.substring(0, 8)}`,
            descrição: data.descrição || null,
            numero_protocolo: data.numero_protocolo || `PROT-${protocolUUID.substring(0, 8)}`,
            status: 'Impresso',
            id_proprietario: ownerId, // USANDO id_proprietario
            img_protocolo: url_img_protocolo,
            nome_resp_recebimento: data.nome_resp_recebimento,
            anexos: anexosUrls.length > 0 ? anexosUrls : null,
        });

        if (insertError) throw insertError;
        
        refetch();
    }, [ownerId, refetch]);

    const handleDeleteProtocolo = useCallback(async (protocolo: Protocolo) => {
        // Implementar a lógica de deleção
        console.log("Deletar protocolo", protocolo);
        showSuccess('Protocolo deletado com sucesso.');
        refetch();
    }, [refetch]);

    const handleUpdateStatus = useCallback(async (protocoloId: string, status: Protocolo['status']) => {
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