import { useState, useCallback } from 'react';
import { showError, showSuccess } from '@/utils/toast';
import { TransacaoComId, ParcelaCandidato } from '@/types/extrato';
import { buscarParcelasCandidatas, confirmarMapeamento, buscarTransacoesPendentes } from './useMapeamentoInverso';
import { useOwner } from '@/hooks/use-owner';
import { useSessao } from '@/hooks/use-sessao';

export function useMapeamentoParcelas() {
    const { ownerId, ownerType } = useOwner();
    const { role } = useSessao();
    const isAdmin = role === 'Admin';

    const [transacoesPendentes, setTransacoesPendentes] = useState<TransacaoComId[]>([]);
    const [transacaoAtual, setTransacaoAtual] = useState<TransacaoComId | null>(null);
    const [candidatosAtuais, setCandidatosAtuais] = useState<ParcelaCandidato[]>([]);
    const [modalMapeamentoOpen, setModalMapeamentoOpen] = useState(false);
    const [carregandoCandidatos, setCarregandoCandidatos] = useState(false);
    const [indiceAtual, setIndiceAtual] = useState(1);
    const [historicoMapeamento, setHistoricoMapeamento] = useState<TransacaoComId[]>([]);

    const fetchPendentes = useCallback(async () => {
        if (!ownerId) return;
        const pendentes = await buscarTransacoesPendentes(ownerId);
        setTransacoesPendentes(pendentes);
    }, [ownerId]);

    const iniciarMapeamento = useCallback(async () => {
        if (transacoesPendentes.length === 0) return;

        const primeira = transacoesPendentes[0];
        setTransacaoAtual(primeira);
        setIndiceAtual(1);
        setCarregandoCandidatos(true);
        setModalMapeamentoOpen(true);

        try {
            const candidatos = await buscarParcelasCandidatas(primeira, ownerId!, ownerType);
            setCandidatosAtuais(candidatos);
        } catch (error) {
            console.error('Erro ao buscar candidatos:', error);
            setCandidatosAtuais([]);
        } finally {
            setCarregandoCandidatos(false);
        }
    }, [transacoesPendentes, ownerId, ownerType]);

    const handleConfirmarMapeamento = useCallback(async (parcelaId: string) => {
        if (!transacaoAtual || !ownerId) return;

        const tipo = transacaoAtual.tipo === 'Entrada' ? 'CR' : 'CP';
        const result = await confirmarMapeamento(transacaoAtual.id, parcelaId, tipo, isAdmin, ownerId);

        if (result.needsAccountSelection) {
            showError(`Saldo insuficiente na conta "${result.contaAtualNome}".`);
            return;
        }

        if (!result.success) {
            showError('Erro ao mapear: ' + result.error);
            return;
        }

        showSuccess('Mapeamento confirmado e parcela quitada!');
        
        const novasPendentes = transacoesPendentes.filter(t => t.id !== transacaoAtual.id);
        setTransacoesPendentes(novasPendentes);

        if (novasPendentes.length > 0) {
            const proxima = novasPendentes[0];
            setTransacaoAtual(proxima);
            setIndiceAtual(prev => prev + 1);
            setCarregandoCandidatos(true);
            
            try {
                const candidatos = await buscarParcelasCandidatas(proxima, ownerId!, ownerType);
                setCandidatosAtuais(candidatos);
            } catch (error) {
                setCandidatosAtuais([]);
            } finally {
                setCarregandoCandidatos(false);
            }
        } else {
            setModalMapeamentoOpen(false);
            showSuccess('Todas as transações foram mapeadas!');
        }
    }, [transacaoAtual, transacoesPendentes, ownerId, isAdmin, ownerType]);

    const handlePularTransacao = useCallback(async () => {
        const restantes = transacoesPendentes.filter(t => t.id !== transacaoAtual?.id);
        setTransacoesPendentes(restantes);

        if (restantes.length > 0) {
            if (transacaoAtual) {
                setHistoricoMapeamento([...historicoMapeamento, transacaoAtual]);
            }
            const proxima = restantes[0];
            setTransacaoAtual(proxima);
            setIndiceAtual(prev => prev + 1);
            setCarregandoCandidatos(true);
            
            try {
                const candidatos = await buscarParcelasCandidatas(proxima, ownerId!, ownerType);
                setCandidatosAtuais(candidatos);
            } catch (error) {
                setCandidatosAtuais([]);
            } finally {
                setCarregandoCandidatos(false);
            }
        } else {
            setModalMapeamentoOpen(false);
        }
    }, [transacoesPendentes, transacaoAtual, ownerId, historicoMapeamento, ownerType]);

    const handleVoltarTransacao = useCallback(async () => {
        if (historicoMapeamento.length === 0) return;

        const anterior = historicoMapeamento[historicoMapeamento.length - 1];
        setHistoricoMapeamento(historicoMapeamento.slice(0, -1));
        
        setTransacaoAtual(anterior);
        setIndiceAtual(prev => Math.max(1, prev - 1));
        setTransacoesPendentes([anterior, ...transacoesPendentes]);
        setCarregandoCandidatos(true);

        try {
            const candidatos = await buscarParcelasCandidatas(anterior, ownerId!, ownerType);
            setCandidatosAtuais(candidatos);
        } catch (error) {
            setCandidatosAtuais([]);
        } finally {
            setCarregandoCandidatos(false);
        }
    }, [historicoMapeamento, transacoesPendentes, ownerId, ownerType]);

    return {
        transacoesPendentes,
        transacaoAtual,
        candidatosAtuais,
        modalMapeamentoOpen,
        carregandoCandidatos,
        indiceAtual,
        historicoMapeamento,
        fetchPendentes,
        iniciarMapeamento,
        handleConfirmarMapeamento,
        handlePularTransacao,
        handleVoltarTransacao,
        setModalMapeamentoOpen,
    };
}