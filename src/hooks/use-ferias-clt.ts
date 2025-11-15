import { useState, useEffect, useCallback } from 'react';
import { parseISO, addYears, isBefore, isAfter, startOfMonth, endOfMonth, subYears } from 'date-fns';
import { RegistroPonto } from '@/types/ponto';
import { supabase } from '@/integrations/supabase/client';

interface PeriodoAquisitivo {
    data_inicio_aquisitivo: Date;
    data_fim_aquisitivo: Date;
    data_limite_concessivo: Date;
    dias_direito: number;
    faltas_injustificadas: number;
    status: string;
    isVencidoEmDobro: boolean; // NOVO CAMPO
}

interface FeriasCLTData {
    periodoAquisitivo: PeriodoAquisitivo | null;
    ultimaFeriasFim: Date | null;
    faltasInjustificadasMes: number;
    faltasInjustificadasAcumuladas: number;
    diasDeFeriasDireito: number;
    carregando: boolean;
    refetch: () => void;
}

// Regra CLT para dias de férias
const getDiasDireito = (faltas: number): number => {
    if (faltas > 32) return 0;
    if (faltas >= 24) return 12;
    if (faltas >= 15) return 18;
    if (faltas >= 6) return 24;
    return 30;
};

/**
 * Hook para calcular o direito a férias de um funcionário.
 */
export function useFeriasCLT(
    funcionarioId: string | undefined,
    dataInicioContrato: string | null | undefined,
    mesReferencia: Date,
    todosRegistrosDoFuncionario: RegistroPonto[]
): FeriasCLTData {
    const [periodoAquisitivo, setPeriodoAquisitivo] = useState<PeriodoAquisitivo | null>(null);
    const [ultimaFeriasFim, setUltimaFeriasFim] = useState<Date | null>(null);
    const [faltasInjustificadasMes, setFaltasInjustificadasMes] = useState(0);
    const [faltasInjustificadasAcumuladas, setFaltasInjustificadasAcumuladas] = useState(0);
    const [diasDeFeriasDireito, setDiasDeFeriasDireito] = useState(30);
    const [carregando, setCarregando] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);

    const refetch = useCallback(() => setRefreshKey(k => k + 1), []);
    
    // Função para buscar todas as férias gozadas (para verificar a dobra)
    const fetchFeriasGozadas = useCallback(async (id: string) => {
        const { data } = await supabase
            .from('ferias')
            .select('data_inicio, data_fim')
            .eq('funcionario_id', id)
            .order('data_fim', { ascending: false });
        return data || [];
    }, []);

    const calcularFaltasEDobra = useCallback(async () => {
        if (!dataInicioContrato || !funcionarioId) {
            setCarregando(false);
            return;
        }
        
        setCarregando(true);

        const inicioContrato = parseISO(dataInicioContrato + 'T00:00:00');
        const hoje = new Date();
        
        // 1. Determinar o Período Aquisitivo ATUAL
        let inicioAquisitivo = inicioContrato;
        let fimAquisitivo = addYears(inicioContrato, 1);
        
        while (isBefore(fimAquisitivo, hoje)) {
            inicioAquisitivo = fimAquisitivo;
            fimAquisitivo = addYears(inicioAquisitivo, 1);
        }
        
        const dataLimiteConcessivo = addYears(fimAquisitivo, 1);
        
        // 2. Determinar o Período Aquisitivo ANTERIOR
        // const inicioAquisitivoAnterior = subYears(inicioAquisitivo, 1); // Removido
        const fimAquisitivoAnterior = subYears(fimAquisitivo, 1);
        const limiteConcessivoAnterior = addYears(fimAquisitivoAnterior, 1);
        
        // 3. Verificar a Dobra de Férias (Regra CLT)
        let isVencidoEmDobro = false;
        
        if (isAfter(hoje, limiteConcessivoAnterior)) {
            // O período concessivo anterior expirou.
            
            // Buscar todas as férias gozadas
            const feriasGozadas = await fetchFeriasGozadas(funcionarioId);
            
            // Verificar se alguma férias foi gozada DENTRO do período concessivo anterior
            const gozadaNoPeriodo = feriasGozadas.some(f => {
                const dataFim = parseISO(f.data_fim + 'T00:00:00');
                return isAfter(dataFim, fimAquisitivoAnterior) && isBefore(dataFim, limiteConcessivoAnterior);
            });
            
            if (!gozadaNoPeriodo) {
                isVencidoEmDobro = true;
            }
        }

        // 4. Filtrar Faltas Injustificadas no Período Aquisitivo ATUAL
        let faltasAcumuladas = 0;
        let faltasMes = 0;
        
        const inicioMes = startOfMonth(mesReferencia);
        const fimMes = endOfMonth(mesReferencia);

        for (const registro of todosRegistrosDoFuncionario) {
            const dataRegistro = parseISO(registro.horario_registro);
            
            const isFalta = registro.tipo === 'Falta';
            const isJustificada = registro.atestado_url || registro.observacao?.includes('Falta Justificada');
            
            if (isFalta && !isJustificada) {
                // 2.1. Conta faltas no período aquisitivo
                if (isAfter(dataRegistro, inicioAquisitivo) && isBefore(dataRegistro, fimAquisitivo)) {
                    faltasAcumuladas++;
                }
                
                // 2.2. Conta faltas no mês de referência
                if (isAfter(dataRegistro, inicioMes) && isBefore(dataRegistro, fimMes)) {
                    faltasMes++;
                }
            }
        }
        
        // 5. Determinar Dias de Direito (30 ou 60 se em dobro)
        let diasDireito = getDiasDireito(faltasAcumuladas);
        if (isVencidoEmDobro) {
            diasDireito = 60; // Férias em dobro
        }

        // 6. Atualizar Estados
        setPeriodoAquisitivo({
            data_inicio_aquisitivo: inicioAquisitivo,
            data_fim_aquisitivo: fimAquisitivo,
            data_limite_concessivo: dataLimiteConcessivo,
            dias_direito: diasDireito,
            faltas_injustificadas: faltasAcumuladas,
            status: isVencidoEmDobro ? 'Vencido em Dobro' : (isBefore(hoje, fimAquisitivo) ? 'Em Andamento' : 'Concessivo Aberto'),
            isVencidoEmDobro: isVencidoEmDobro,
        });
        
        setFaltasInjustificadasMes(faltasMes);
        setFaltasInjustificadasAcumuladas(faltasAcumuladas);
        setDiasDeFeriasDireito(diasDireito);
        setCarregando(false);

    }, [funcionarioId, dataInicioContrato, mesReferencia, todosRegistrosDoFuncionario, refreshKey, fetchFeriasGozadas]);
    
    const fetchUltimaFerias = useCallback(async () => {
        if (!funcionarioId) return;
        
        // Busca a última data de fim de férias gozada (status 'concluida' ou 'paga')
        // Nota: A tabela 'ferias' não tem status, então buscamos a última data_fim
        const { data, error } = await supabase
            .from('ferias')
            .select('data_fim')
            .eq('funcionario_id', funcionarioId)
            .order('data_fim', { ascending: false })
            .limit(1);
            
        if (error) {
            console.error('Erro ao buscar última férias:', error);
            setUltimaFeriasFim(null);
            return;
        }
        
        if (data && data.length > 0) {
            const lastDate = parseISO(data[0].data_fim + 'T00:00:00');
            setUltimaFeriasFim(lastDate);
        } else {
            setUltimaFeriasFim(null);
        }
    }, [funcionarioId, refreshKey]);

    useEffect(() => {
        calcularFaltasEDobra();
        fetchUltimaFerias();
    }, [calcularFaltasEDobra, fetchUltimaFerias]);

    return {
        periodoAquisitivo,
        ultimaFeriasFim,
        faltasInjustificadasMes,
        faltasInjustificadasAcumuladas,
        diasDeFeriasDireito,
        carregando,
        refetch,
    };
}