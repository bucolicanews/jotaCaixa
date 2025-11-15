import { useState, useEffect, useCallback } from 'react';
import { parseISO, addYears, isBefore, isAfter, startOfMonth, endOfMonth } from 'date-fns';
import { RegistroPonto } from '@/types/ponto';
import { supabase } from '@/integrations/supabase/client';

interface PeriodoAquisitivo {
    data_inicio_aquisitivo: Date;
    data_fim_aquisitivo: Date;
    data_limite_concessivo: Date;
    dias_direito: number;
    faltas_injustificadas: number;
    status: string;
}

interface FeriasCLTData {
    periodoAquisitivo: PeriodoAquisitivo | null;
    ultimaFeriasFim: Date | null; // NOVO: Data final da última férias gozada
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
 * @param funcionarioId ID do funcionário.
 * @param dataInicioContrato Data de início do contrato (para calcular o período aquisitivo).
 * @param mesReferencia Mês atual sendo visualizado (para calcular faltas mensais).
 * @param todosRegistrosDoFuncionario Todos os registros de ponto do funcionário.
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

    const calcularFaltas = useCallback(() => {
        if (!dataInicioContrato || !funcionarioId) {
            setCarregando(false);
            return;
        }
        
        setCarregando(true);

        const inicioContrato = parseISO(dataInicioContrato + 'T00:00:00');
        const hoje = new Date();
        
        // 1. Determinar o Período Aquisitivo Atual
        let inicioAquisitivo = inicioContrato;
        let fimAquisitivo = addYears(inicioContrato, 1);
        
        // Avança o período aquisitivo até o período atual
        while (isBefore(fimAquisitivo, hoje)) {
            inicioAquisitivo = fimAquisitivo;
            fimAquisitivo = addYears(inicioAquisitivo, 1);
        }
        
        const dataLimiteConcessivo = addYears(fimAquisitivo, 1);

        // 2. Filtrar Faltas Injustificadas no Período Aquisitivo
        let faltasAcumuladas = 0;
        let faltasMes = 0;
        
        const inicioMes = startOfMonth(mesReferencia);
        const fimMes = endOfMonth(mesReferencia);

        for (const registro of todosRegistrosDoFuncionario) {
            const dataRegistro = parseISO(registro.horario_registro);
            
            // Verifica se é uma Falta Injustificada
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
        
        // 3. Determinar Dias de Direito
        const diasDireito = getDiasDireito(faltasAcumuladas);

        // 4. Atualizar Estados
        setPeriodoAquisitivo({
            data_inicio_aquisitivo: inicioAquisitivo,
            data_fim_aquisitivo: fimAquisitivo,
            data_limite_concessivo: dataLimiteConcessivo,
            dias_direito: diasDireito,
            faltas_injustificadas: faltasAcumuladas,
            status: isBefore(hoje, fimAquisitivo) ? 'Em Andamento' : 'Concessivo Aberto',
        });
        
        setFaltasInjustificadasMes(faltasMes);
        setFaltasInjustificadasAcumuladas(faltasAcumuladas);
        setDiasDeFeriasDireito(diasDireito);
        setCarregando(false);

    }, [funcionarioId, dataInicioContrato, mesReferencia, todosRegistrosDoFuncionario, refreshKey]);
    
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
        calcularFaltas();
        fetchUltimaFerias();
    }, [calcularFaltas, fetchUltimaFerias]);

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