import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RegistroPonto, Ferias } from '@/types/ponto';
import { parseISO, addYears, isBefore, isAfter, subDays, isWithinInterval, startOfMonth, endOfMonth, isSameDay, addDays } from 'date-fns';
import { showError } from '@/utils/toast';

interface AcquisitionPeriod {
    inicio_aquisitivo: Date;
    fim_aquisitivo: Date;
    limite_concessivo: Date;
    status: 'Em Andamento' | 'Em Aberto' | 'Gozada' | 'Vencida em Dobro';
    dias_direito: number;
    faltas_injustificadas: number;
    ferias_gozadas: Ferias[];
}

interface FeriasCLTData {
    periodos: AcquisitionPeriod[];
    periodoAtual: AcquisitionPeriod | null;
    carregando: boolean;
    refetch: () => void;
    // Campos mantidos para compatibilidade com FolhaPonto.tsx
    ultimaFeriasFim: Date | null;
    faltasInjustificadasMes: number;
    faltasInjustificadasAcumuladas: number;
    diasDeFeriasDireito: number;
}

// Regra CLT para dias de férias
const getDiasDireito = (faltas: number): number => {
    if (faltas > 32) return 0;
    if (faltas >= 24) return 12;
    if (faltas >= 15) return 18;
    if (faltas >= 6) return 24;
    return 30;
};

const calculatePeriods = (
    inicioContrato: Date, 
    allFaltas: RegistroPonto[], 
    allFerias: Ferias[]
): AcquisitionPeriod[] => {
    const periods: AcquisitionPeriod[] = [];
    let currentStart = inicioContrato;
    const today = new Date();

    // Iterate through all possible periods until the current one starts
    // We iterate until the start of the next period is after today
    while (isBefore(currentStart, today) || isSameDay(currentStart, today)) {
        const fimAquisitivo = subDays(addYears(currentStart, 1), 1);
        const limiteConcessivo = addYears(fimAquisitivo, 1);

        // 1. Calculate Faltas Injustificadas within this acquisition period
        const faltas = allFaltas.filter(f => {
            const dataRegistro = parseISO(f.horario_registro);
            // A falta é injustificada se for do tipo 'Falta' e não tiver atestado
            const isFaltaInjustificada = f.tipo === 'Falta' && !f.atestado_url && !f.observacao?.includes('Falta Justificada');
            
            return isFaltaInjustificada && 
                   isAfter(dataRegistro, currentStart) && 
                   isBefore(dataRegistro, fimAquisitivo);
        }).length;
        
        const diasDireito = getDiasDireito(faltas);

        // 2. Check for vacations taken within the concessive period
        const feriasGozadas = allFerias.filter(f => {
            const dataInicioFerias = parseISO(f.data_inicio + 'T00:00:00');
            const dataFimFerias = parseISO(f.data_fim + 'T00:00:00');
            
            // Vacation must be taken within the concessive period (fimAquisitivo + 1 day to limiteConcessivo)
            const startConcessive = addDays(fimAquisitivo, 1);
            
            return isWithinInterval(dataInicioFerias, { start: startConcessive, end: limiteConcessivo }) ||
                   isWithinInterval(dataFimFerias, { start: startConcessive, end: limiteConcessivo });
        });

        // 3. Determine Status
        let status: AcquisitionPeriod['status'];
        
        if (isAfter(today, limiteConcessivo)) {
            // Concessive period expired
            if (feriasGozadas.length === 0) {
                status = 'Vencida em Dobro';
            } else {
                status = 'Gozada';
            }
        } else if (isAfter(today, fimAquisitivo)) {
            // Acquisition period ended, concessive period is open
            if (feriasGozadas.length > 0) {
                status = 'Gozada'; 
            } else {
                status = 'Em Aberto';
            }
        } else {
            // Acquisition period is still running
            status = 'Em Andamento';
        }

        periods.push({
            inicio_aquisitivo: currentStart,
            fim_aquisitivo: fimAquisitivo,
            limite_concessivo: limiteConcessivo,
            status,
            dias_direito: diasDireito,
            faltas_injustificadas: faltas,
            ferias_gozadas: feriasGozadas,
        });

        // Move to the next period
        currentStart = addDays(fimAquisitivo, 1);
    }

    return periods.reverse(); // Show most recent first
};


export function useFeriasCLT(
    funcionarioId: string | undefined,
    dataInicioContrato: string | null | undefined,
    mesReferencia: Date,
    todosRegistrosDoFuncionario: RegistroPonto[]
): FeriasCLTData {
    const [periodos, setPeriodos] = useState<AcquisitionPeriod[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);

    const refetch = useCallback(() => setRefreshKey(k => k + 1), []);
    
    // Fetch ALL ferias records for the employee
    const fetchAllFerias = useCallback(async (id: string) => {
        // Tabela 'ferias' é usada para clientes, 'admin_ferias_user' para admin users.
        // Consolidamos os registros de férias de ambas as tabelas.
        
        const { data: feriasCliente } = await supabase
            .from('ferias')
            .select('id, data_inicio, data_fim, periodo_referencia')
            .eq('funcionario_id', id)
            .order('data_fim', { ascending: false });
            
        const { data: feriasAdmin } = await supabase
            .from('admin_ferias_user')
            .select('id, data_inicio, data_fim, periodo_referencia')
            .eq('funcionario_id', id)
            .order('data_fim', { ascending: false });
            
        const allFerias = [...(feriasCliente || []), ...(feriasAdmin || [])];
        
        // Ordena novamente por data_fim
        allFerias.sort((a, b) => parseISO(b.data_fim).getTime() - parseISO(a.data_fim).getTime());
        
        return allFerias as Ferias[];
    }, []);

    const calcularPeriodos = useCallback(async () => {
        // SAÍDA RÁPIDA: Se não houver dados essenciais, define carregando como false e retorna.
        if (!dataInicioContrato || !funcionarioId) {
            setPeriodos([]);
            setCarregando(false);
            return;
        }
        
        setCarregando(true);

        try {
            const inicioContrato = parseISO(dataInicioContrato + 'T00:00:00');
            const allFerias = await fetchAllFerias(funcionarioId);
            
            const calculatedPeriods = calculatePeriods(inicioContrato, todosRegistrosDoFuncionario, allFerias);
            
            setPeriodos(calculatedPeriods);

        } catch (error: any) {
            console.error('Erro ao calcular períodos CLT:', error);
            showError('Falha ao carregar dados CLT: ' + (error?.message || error));
            setPeriodos([]);
        } finally {
            setCarregando(false);
        }
    }, [funcionarioId, dataInicioContrato, todosRegistrosDoFuncionario, refreshKey, fetchAllFerias]);

    useEffect(() => {
        calcularPeriodos();
    }, [calcularPeriodos]);
    
    // The current period is the one that is 'Em Andamento' or 'Em Aberto'
    const periodoAtual = periodos.find(p => p.status === 'Em Andamento' || p.status === 'Em Aberto') || null;
    
    // Compatibility fields
    const ultimaFeriasFim = periodos.find(p => p.ferias_gozadas.length > 0)?.ferias_gozadas[0]?.data_fim 
        ? parseISO(periodos.find(p => p.ferias_gozadas.length > 0)?.ferias_gozadas[0]?.data_fim + 'T00:00:00') 
        : null;
        
    const faltasInjustificadasAcumuladas = periodoAtual?.faltas_injustificadas || 0;
    const diasDeFeriasDireito = periodoAtual?.dias_direito || 30;
    
    // Faltas no mês de referência (recalculado aqui para compatibilidade)
    const inicioMes = startOfMonth(mesReferencia);
    const fimMes = endOfMonth(mesReferencia);
    const faltasInjustificadasMes = todosRegistrosDoFuncionario.filter(f => {
        const dataRegistro = parseISO(f.horario_registro);
        const isFaltaInjustificada = f.tipo === 'Falta' && !f.atestado_url && !f.observacao?.includes('Falta Justificada');
        return isFaltaInjustificada && isAfter(dataRegistro, inicioMes) && isBefore(dataRegistro, fimMes);
    }).length;


    return {
        periodos,
        periodoAtual,
        carregando,
        refetch,
        // Compatibility fields
        ultimaFeriasFim,
        faltasInjustificadasMes,
        faltasInjustificadasAcumuladas,
        diasDeFeriasDireito,
    };
}