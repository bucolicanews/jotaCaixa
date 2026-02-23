import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { ConciliacaoHistorico } from '@/types/conciliacao';
import { useOwner } from '@/hooks/use-owner';

export function useHistoricoConciliacao() {
    const { ownerId } = useOwner();
    const [historico, setHistorico] = useState<ConciliacaoHistorico[]>([]);
    const [isDeletingHistorico, setIsDeletingHistorico] = useState(false);
    const [historicoDetalhesOpen, setHistoricoDetalhesOpen] = useState(false);
    const [historicoSelecionado, setHistoricoSelecionado] = useState<ConciliacaoHistorico | null>(null);

    const fetchHistorico = useCallback(async () => {
        if (!ownerId) return;
        
        const { data, error } = await supabase
            .from('conciliacoes')
            .select(`
                *,
                saldo_contas:id_saldo_contas ( nome )
            `)
            .eq('empresa_id', ownerId)
            .order('criado_em', { ascending: false });
            
        if (error) {
            showError('Erro ao carregar histórico de conciliações: ' + error.message);
            setHistorico([]);
        } else {
            setHistorico(data as ConciliacaoHistorico[]);
        }
    }, [ownerId]);

    const handleDeleteHistorico = useCallback(async () => {
        if (!ownerId) return;
        
        setIsDeletingHistorico(true);
        
        try {
            const { error } = await supabase.from('conciliacoes').delete().eq('empresa_id', ownerId);
            if (error) throw error;
            
            showSuccess('Histórico de conciliações limpo com sucesso.');
            fetchHistorico();
        } catch (error: any) {
            showError('Falha ao limpar histórico: ' + error.message);
        } finally {
            setIsDeletingHistorico(false);
        }
    }, [ownerId, fetchHistorico]);

    const handleViewHistoricoDetails = useCallback((h: ConciliacaoHistorico) => {
        setHistoricoSelecionado(h);
        setHistoricoDetalhesOpen(true);
    }, []);
    
    const handleSetHistoricoDetalhesOpen = useCallback((open: boolean) => {
        setHistoricoDetalhesOpen(open);
        if (!open) setHistoricoSelecionado(null);
    }, []);

    return {
        historico,
        isDeletingHistorico,
        historicoSelecionado,
        historicoDetalhesOpen,
        fetchHistorico,
        handleDeleteHistorico,
        handleViewHistoricoDetails,
        setHistoricoDetalhesOpen: handleSetHistoricoDetalhesOpen,
    };
}