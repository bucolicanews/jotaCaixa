import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { PlanoContas } from '@/types/plano-contas';
import { useSessao } from './use-sessao';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { useDebounce } from './use-debounce';

type FiltroTipoConta = 'todos' | 'ativo' | 'passivo' | 'receita' | 'despesa';
type FiltroAnalitica = 'todos' | 'Sim' | 'Não';

interface PlanoContasDataHook {
    contas: PlanoContas[];
    carregando: boolean;
    proprietarioId: string | null;
    mascaraAtiva: string | null;
    refetch: () => void;
    
    // Filters State
    filtroTexto: string;
    setFiltroTexto: (text: string) => void;
    filtroTipoConta: FiltroTipoConta;
    setFiltroTipoConta: (type: FiltroTipoConta) => void;
    filtroAnalitica: FiltroAnalitica;
    setFiltroAnalitica: (type: FiltroAnalitica) => void;

    // Mutations
    handleDelete: (id: string) => Promise<void>;
    handleSaveSuccess: () => void;
}

export function usePlanoContasData(): PlanoContasDataHook {
    const { usuario, perfil, role, carregando: carregandoSessao } = useSessao();
    const [contas, setContas] = useState<PlanoContas[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [mascaraAtiva, setMascaraAtiva] = useState<string | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    // Filters State
    const [filtroTexto, setFiltroTexto] = useState('');
    const filtroTextoDebounced = useDebounce(filtroTexto, 500);
    const [filtroTipoConta, setFiltroTipoConta] = useState<FiltroTipoConta>('todos');
    const [filtroAnalitica, setFiltroAnalitica] = useState<FiltroAnalitica>('todos');

    const getProprietarioId = useCallback(() => {
        if (role === 'Admin') return usuario?.id || null;
        if (role === 'Cliente') return (perfil as ClienteProfile)?.id || null;
        if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id || null;
        return null;
    }, [usuario, perfil, role]);
    
    const proprietarioId = getProprietarioId();

    const refetch = useCallback(() => {
        setRefreshKey(prev => prev + 1);
    }, []);
    
    const handleSaveSuccess = useCallback(() => {
        refetch();
    }, [refetch]);

    const fetchMascara = useCallback(async (id: string) => {
        const { data } = await supabase
            .from('configuracao_plano_contas')
            .select('mascara_codigo')
            .eq('proprietario_id', id)
            .limit(1)
            .maybeSingle();
        setMascaraAtiva(data?.mascara_codigo || null);
    }, []);

    const buscarPlanoContas = useCallback(async (id: string) => {
        setCarregando(true);
        let query = supabase
            .from('plano_contas')
            .select('*')
            .eq('proprietario_id', id);

        if (filtroTextoDebounced) {
            const searchTerm = `%${filtroTextoDebounced}%`;
            query = query.or(
                `Conta.ilike.${searchTerm},codigo_reduzido.ilike.${searchTerm},Descricao.ilike.${searchTerm}`
            );
        }

        if (filtroTipoConta !== 'todos') {
            let prefix = '';
            if (filtroTipoConta === 'ativo') prefix = '1';
            if (filtroTipoConta === 'passivo') prefix = '2';
            if (filtroTipoConta === 'receita') prefix = '3';
            if (filtroTipoConta === 'despesa') prefix = '4';
            query = query.like('Conta', `${prefix}.%`);
        }

        if (filtroAnalitica !== 'todos') {
            query = query.eq('Analitica', filtroAnalitica);
        }

        query = query.order('Conta', { ascending: true });

        const { data, error } = await query;

        if (error) {
            showError('Erro ao carregar Plano de Contas: ' + error.message);
            setContas([]);
        } else {
            setContas(data as PlanoContas[]);
        }
        setCarregando(false);
    }, [filtroTextoDebounced, filtroTipoConta, filtroAnalitica, refreshKey]);

    useEffect(() => {
        if (!carregandoSessao && proprietarioId) {
            fetchMascara(proprietarioId);
            buscarPlanoContas(proprietarioId);
        } else if (!carregandoSessao) {
            setCarregando(false);
        }
    }, [carregandoSessao, proprietarioId, buscarPlanoContas, fetchMascara]);
    
    const handleDelete = useCallback(async (id: string) => {
        if (!window.confirm('Tem certeza que deseja excluir esta conta?')) return;

        try {
            // 1. Anular referências em tabelas dependentes
            await supabase.from('saldo_contas').update({ conta_contabil_id: null }).eq('conta_contabil_id', id);
            await supabase.from('lancamentos').update({ conta_contabil_id: null }).eq('conta_contabil_id', id);
            await supabase.from('configuracao_contas_receber').update({ conta_contabil_id: null }).eq('conta_contabil_id', id);
            await supabase.from('configuracao_contas_pagar').update({ conta_contabil_id: null }).eq('conta_contabil_id', id);
            await supabase.from('configuracoes_stripe').update({ conta_sintetica_id: null }).eq('conta_sintetica_id', id);
            await supabase.from('configuracoes_stripe').update({ conta_receber_id: null }).eq('conta_receber_id', id);
            
            // 2. Deletar a conta
            const { error } = await supabase
                .from('plano_contas')
                .delete()
                .eq('id', id);

            if (error) throw error;

            showSuccess('Conta excluída com sucesso.');
            refetch();
        } catch (error: any) {
            showError('Erro ao excluir conta: ' + error.message);
        }
    }, [refetch]);

    return {
        contas,
        carregando,
        proprietarioId,
        mascaraAtiva,
        refetch,
        
        filtroTexto,
        setFiltroTexto,
        filtroTipoConta,
        setFiltroTipoConta,
        filtroAnalitica,
        setFiltroAnalitica,

        handleDelete,
        handleSaveSuccess,
    };
}