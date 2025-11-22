import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { ContratoGerado } from '@/types/contratos';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { useSessao } from './use-sessao';
import { useDebounce } from './use-debounce';

type ContratoComCliente = ContratoGerado & { clientes: { nome: string } | null };
export type ContratoStatus = ContratoGerado['status'] | 'todos'; // EXPORTADO
export type Ordenacao = 'criado_em_desc' | 'vencimento_asc' | 'cliente_asc'; // EXPORTADO

interface ContratosHook {
    contratos: ContratoComCliente[];
    contratosAgrupados: {
        meusContratos: ContratoComCliente[];
        contratosClientes: ContratoComCliente[];
        pendentes: ContratoComCliente[];
        ativos: ContratoComCliente[];
        inativos: ContratoComCliente[];
    };
    carregando: boolean;
    isAdmin: boolean;
    empresaId: string | null;
    refetch: () => void;

    // Filters/Sorting State
    filtroTexto: string;
    setFiltroTexto: (text: string) => void;
    filtroStatus: ContratoStatus;
    setFiltroStatus: (status: ContratoStatus) => void;
    ordenacao: Ordenacao;
    setOrdenacao: (order: Ordenacao) => void;

    // Mutations
    handleDeleteContract: (contrato: ContratoGerado) => Promise<void>;
    handleBlockContract: (contrato: ContratoGerado) => Promise<void>;
    handleReactivateContract: (contrato: ContratoGerado) => Promise<void>;
}

export function useContratos(): ContratosHook {
    const { role, perfil, usuario, carregando: carregandoSessao } = useSessao();
    const [contratos, setContratos] = useState<ContratoComCliente[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);

    // Filters/Sorting State
    const [filtroTexto, setFiltroTexto] = useState('');
    const filtroTextoDebounced = useDebounce(filtroTexto, 500);
    const [filtroStatus, setFiltroStatus] = useState<ContratoStatus>('todos');
    const [ordenacao, setOrdenacao] = useState<Ordenacao>('criado_em_desc');

    const isAdmin = role === 'Admin';
    const isClient = role === 'Cliente';

    const getEmpresaId = () => {
        if (isAdmin) return usuario?.id || null;
        if (isClient) return (perfil as ClienteProfile)?.id;
        if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id; // FIX: proprietario_id -> cliente_id
        return null;
    };
    
    const empresaId = getEmpresaId();

    const refetch = useCallback(() => {
        setRefreshKey(prev => prev + 1);
    }, []);

    const buscarContratos = useCallback(async () => {
        if (!empresaId && !isAdmin) {
            setContratos([]);
            setCarregando(false);
            return;
        }
        
        setCarregando(true);
        
        let query = supabase
            .from('contratos_gerados')
            .select('*, clientes(nome)');
            
        // Se for Cliente/Usuário, filtra apenas pelos seus contratos
        if (!isAdmin && empresaId) {
            query = query.eq('proprietario_id', empresaId);
        }
        
        // Aplica ordenação
        let ascending = true;
        let orderByColumn = 'criado_em';
        
        if (ordenacao === 'cliente_asc') {
            // Ordenação por cliente será feita no frontend
        } else if (ordenacao === 'criado_em_desc') {
            orderByColumn = 'criado_em';
            ascending = false;
        } else if (ordenacao === 'vencimento_asc') {
            orderByColumn = 'data_inicio'; 
            ascending = true;
        }

        query = query.order(orderByColumn, { ascending: ascending });

        const { data, error } = await query;

        if (error) {
            showError('Erro ao carregar contratos: ' + error.message);
            setContratos([]);
        } else {
            let fetchedContratos = data as ContratoComCliente[];
            
            // Filtragem de status (se não for 'todos')
            if (filtroStatus !== 'todos') {
                fetchedContratos = fetchedContratos.filter(c => c.status === filtroStatus);
            }
            
            // Filtragem de texto
            const termoBusca = filtroTextoDebounced.toLowerCase();
            if (termoBusca) {
                fetchedContratos = fetchedContratos.filter(c => {
                    const clienteNome = c.clientes?.nome || '';
                    return c.conteudo_renderizado?.toLowerCase().includes(termoBusca) ||
                           clienteNome.toLowerCase().includes(termoBusca) ||
                           c.id.toLowerCase().includes(termoBusca);
                });
            }
            
            // Ordenação por cliente (se selecionado)
            if (ordenacao === 'cliente_asc') {
                fetchedContratos.sort((a, b) => (a.clientes?.nome || '').localeCompare(b.clientes?.nome || ''));
            }
            
            setContratos(fetchedContratos);
        }
        setCarregando(false);
    }, [empresaId, isAdmin, filtroStatus, filtroTextoDebounced, ordenacao, refreshKey]);

    useEffect(() => {
        if (!carregandoSessao && (isAdmin || empresaId)) {
            buscarContratos();
        }
    }, [carregandoSessao, isAdmin, empresaId, buscarContratos]);

    // --- Mutação de Contratos ---

    const handleDeleteContract = useCallback(async (contrato: ContratoGerado) => {
        if (!window.confirm('Tem certeza que deseja excluir este contrato? Isso tentará reverter os lançamentos contábeis e excluir as contas a receber associadas.')) return;

        setCarregando(true);
        
        try {
            if (!contrato.proprietario_id) {
                throw new Error('ID do proprietário do contrato não encontrado.');
            }
            
            // Chamada para a nova RPC que verifica parcelas pagas, reverte lançamentos e deleta
            const { data, error: rpcError } = await supabase.rpc('delete_contract_and_reverse_accounting', {
                p_contrato_id: contrato.id,
                p_proprietario_id: contrato.proprietario_id,
            });
            
            if (rpcError) throw rpcError;
            
            const result = data?.[0];
            
            if (result && !result.success) {
                // Se a RPC retornou FALSE (ex: parcelas pagas)
                showError(result.message);
            } else {
                showSuccess(result?.message || 'Contrato deletado com sucesso.');
            }

            refetch();
        } catch (error: any) {
            console.error('Erro ao deletar contrato:', error);
            showError('Falha ao excluir contrato: ' + error.message);
        } finally {
            setCarregando(false);
        }
    }, [refetch]);

    const handleBlockContract = useCallback(async (contrato: ContratoGerado) => {
        if (!window.confirm(`Tem certeza que deseja BLOQUEAR o contrato ${contrato.id}? Esta ação irá marcar o contrato como 'bloqueado' e BLOQUEAR todas as parcelas pendentes associadas.`)) return;

        setCarregando(true);
        
        try {
            const { error: rpcError } = await supabase.rpc('cancel_contract_installments', {
                p_contrato_id: contrato.id,
                p_motivo: 'Contrato Bloqueado',
            });
            
            if (rpcError) throw rpcError;
            
            showSuccess('Contrato bloqueado e parcelas bloqueadas com sucesso.');
            refetch();
        } catch (error: any) {
            console.error('Erro ao bloquear contrato:', error);
            showError('Falha ao bloquear contrato: ' + error.message);
        } finally {
            setCarregando(false);
        }
    }, [refetch]);

    const handleReactivateContract = useCallback(async (contrato: ContratoGerado) => {
        if (!window.confirm(`Tem certeza que deseja DESBLOQUEAR o contrato ${contrato.id}? Isso irá reativar o status do contrato e reabrir as parcelas que foram bloqueadas.`)) return;

        setCarregando(true);
        
        try {
            const { error: rpcError } = await supabase.rpc('reactivate_contract_installments', {
                p_contrato_id: contrato.id,
            });
            
            if (rpcError) throw rpcError;
            
            showSuccess('Contrato desbloqueado e parcelas reativadas com sucesso.');
            refetch();
        } catch (error: any) {
            console.error('Erro ao desbloquear contrato:', error);
            showError('Falha ao desbloquear contrato: ' + error.message);
        } finally {
            setCarregando(false);
        }
    }, [refetch]);

    // --- Agrupamento para as Tabs ---
    const contratosAgrupados = useMemo(() => {
        const meusContratos = contratos.filter(c => c.proprietario_id === empresaId);
        const contratosClientes = contratos.filter(c => c.proprietario_id !== empresaId);
        
        const pendentes = meusContratos.filter(c => c.status === 'pendente_assinatura' || c.status === 'rascunho');
        const ativos = meusContratos.filter(c => c.status === 'ativo' || c.status === 'concluido');
        const inativos = meusContratos.filter(c => c.status === 'cancelado' || c.status === 'bloqueado');
        
        return { meusContratos, contratosClientes, pendentes, ativos, inativos };
    }, [contratos, empresaId]);

    return {
        contratos,
        contratosAgrupados,
        carregando,
        isAdmin,
        empresaId,
        refetch,

        // Filters/Sorting State
        filtroTexto,
        setFiltroTexto,
        filtroStatus,
        setFiltroStatus,
        ordenacao,
        setOrdenacao,

        // Mutations
        handleDeleteContract,
        handleBlockContract,
        handleReactivateContract,
    };
}