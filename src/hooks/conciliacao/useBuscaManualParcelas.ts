import { useState, useCallback } from 'react';
import { buscarParcelasPorFiltros } from './useMapeamentoInverso';

export function useBuscaManualParcelas() {
    const [modalBuscaManualOpen, setModalBuscaManualOpen] = useState(false);

    const handleAbrirBuscaManual = useCallback(() => {
        setModalBuscaManualOpen(true);
    }, []);

    const handleFecharBuscaManual = useCallback(() => {
        setModalBuscaManualOpen(false);
    }, []);

    const handleBuscarTodasParcelas = useCallback(() => {
        setModalBuscaManualOpen(true);
    }, []);

    return {
        modalBuscaManualOpen,
        handleAbrirBuscaManual,
        handleFecharBuscaManual,
        handleBuscarTodasParcelas,
        setModalBuscaManualOpen,
    };
}