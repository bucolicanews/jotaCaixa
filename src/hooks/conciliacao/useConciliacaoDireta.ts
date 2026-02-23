import { useState, useCallback } from 'react';
import { showError, showSuccess } from '@/utils/toast';
import { conciliarTransacaoDireta, DadosCategorizacao } from './useMapeamentoInverso';
import { useSessao } from '@/hooks/use-sessao';
import { useOwner } from '@/hooks/use-owner';

export function useConciliacaoDireta(
    transacaoAtual: any,
    transacoesPendentes: any[],
    setTransacoesPendentes: (updater: (prev: any[]) => any[]) => void,
    setTransacaoAtual: (transacao: any) => void,
    setIndiceAtual: (updater: (prev: number) => number) => void,
    setCarregandoCandidatos: (loading: boolean) => void,
    setCandidatosAtuais: (candidatos: any[]) => void,
    setModalMapeamentoOpen: (open: boolean) => void
) {
    const { role } = useSessao();
    const { ownerId, ownerType } = useOwner();
    const isAdmin = role === 'Admin';
    const [modalCategorizacaoDiretaOpen, setModalCategorizacaoDiretaOpen] = useState(false);

    const handleAbrirCategorizacaoDireta = useCallback(() => {
        setModalCategorizacaoDiretaOpen(true);
    }, []);

    const handleFecharCategorizacaoDireta = useCallback(() => {
        setModalCategorizacaoDiretaOpen(false);
    }, []);

    const handleConfirmarCategorizacaoDireta = useCallback(async (dados: DadosCategorizacao) => {
        if (!transacaoAtual || !ownerId) return;

        const result = await conciliarTransacaoDireta(
            transacaoAtual.id,
            dados,
            isAdmin,
            ownerId
        );

        if (!result.success) {
            showError(result.error || 'Erro ao conciliar transação');
            return;
        }

        showSuccess('Transação conciliada diretamente com sucesso!');
        
        const novasPendentes = transacoesPendentes.filter(t => t.id !== transacaoAtual.id);
        setTransacoesPendentes(() => novasPendentes);

        if (novasPendentes.length > 0) {
            const proxima = novasPendentes[0];
            setTransacaoAtual(proxima);
            setIndiceAtual(prev => prev + 1);
            setModalCategorizacaoDiretaOpen(false);
            setModalMapeamentoOpen(true);
        } else {
            setModalCategorizacaoDiretaOpen(false);
            setModalMapeamentoOpen(false);
            showSuccess('Todas as transações foram processadas!');
        }
    }, [transacaoAtual, transacoesPendentes, ownerId, isAdmin, ownerType, setTransacoesPendentes, setTransacaoAtual, setIndiceAtual, setCarregandoCandidatos, setCandidatosAtuais, setModalMapeamentoOpen]);

    return {
        modalCategorizacaoDiretaOpen,
        handleAbrirCategorizacaoDireta,
        handleFecharCategorizacaoDireta,
        handleConfirmarCategorizacaoDireta,
        setModalCategorizacaoDiretaOpen,
    };
}