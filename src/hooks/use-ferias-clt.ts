import { useState, useEffect, useCallback } from 'react';
import { FeriasCLTData, PeriodoAquisitivo } from '@/types/ferias';
import { supabase } from '@/integrations/supabase/client';
import { parseISO, addYears, isBefore, startOfDay, endOfDay, isSameDay, isWithinInterval } from 'date-fns';
import { RegistroPonto } from '@/types/ponto';

// Constantes CLT
const DIAS_DIREITO_MAX = 30;
const FALTAS_DIREITO_MAP: Record<number, number> = {
    5: 24, // 6 a 14 faltas = 24 dias
    15: 18, // 15 a 23 faltas = 18 dias
    24: 12, // 24 a 32 faltas = 12 dias
    33: 0,  // Acima de 32 faltas = 0 dias
};

/**
 * Função para calcular os dias de direito com base nas faltas injustificadas.
 */
const calcularDiasDireito = (faltas: number): number => {
    if (faltas <= 5) return DIAS_DIREITO_MAX;
    if (faltas <= 14) return FALTAS_DIREITO_MAP[5];
    if (faltas <= 23) return FALTAS_DIREITO_MAP[15];
    if (faltas <= 32) return FALTAS_DIREITO_MAP[24];
    return FALTAS_DIREITO_MAP[33];
};

/**
 * Função principal para calcular todos os períodos aquisitivos e o status atual.
 */
const calcularPeriodos = (
    dataInicioContrato: string,
    mesReferencia: Date,
    registros: RegistroPonto[],
    feriasGozadas: any[]
): { periodos: PeriodoAquisitivo[], periodoAtual: PeriodoAquisitivo | null, ultimaFeriasFim: Date | null, diasDeFeriasDireito: number, faltasInjustificadasAcumuladas: number } => {
    
    const inicioContrato = startOfDay(parseISO(dataInicioContrato));
    const hoje = startOfDay(mesReferencia);
    
    let currentInicio = inicioContrato;
    let periodos: PeriodoAquisitivo[] = [];
    let ultimaFeriasFim: Date | null = null;
    
    // 1. Determinar a última férias gozada
    const gozadas = feriasGozadas.map(f => ({
        inicio: startOfDay(parseISO(f.data_inicio)),
        fim: endOfDay(parseISO(f.data_fim)),
    })).sort((a, b) => b.fim.getTime() - a.fim.getTime());
    
    if (gozadas.length > 0) {
        ultimaFeriasFim = gozadas[0].fim;
    }

    // 2. Iterar e calcular períodos aquisitivos
    while (isBefore(currentInicio, hoje) || isSameDay(currentInicio, hoje)) {
        const fimAquisitivo = addYears(currentInicio, 1);
        const limiteConcessivo = addYears(fimAquisitivo, 1);
        
        // Filtra registros de falta injustificada dentro do período aquisitivo
        const faltasInjustificadas = registros.filter(r => {
            const dataRegistro = startOfDay(parseISO(r.horario_registro));
            const isFalta = r.tipo === 'Falta' && !r.atestado_url;
            
            return isFalta && isWithinInterval(dataRegistro, { start: currentInicio, end: fimAquisitivo });
        }).length;
        
        const diasDireito = calcularDiasDireito(faltasInjustificadas);
        
        let status: PeriodoAquisitivo['status'] = 'Em Andamento';
        
        // Verifica se o período já foi gozado
        const foiGozada = gozadas.some(f => 
            isWithinInterval(f.inicio, { start: currentInicio, end: fimAquisitivo })
        );
        
        if (foiGozada) {
            status = 'Gozada';
        } else if (isBefore(limiteConcessivo, hoje)) {
            // Vencido em dobro (se o limite concessivo passou)
            status = 'Vencida em Dobro';
        } else if (isBefore(fimAquisitivo, hoje)) {
            // Período aquisitivo completo, mas ainda dentro do concessivo
            status = 'Em Aberto';
        }
        
        const periodo: PeriodoAquisitivo = {
            inicio_aquisitivo: currentInicio,
            fim_aquisitivo: fimAquisitivo,
            limite_concessivo: limiteConcessivo,
            dias_direito: diasDireito,
            faltas_injustificadas: faltasInjustificadas,
            status: status,
        };
        
        periodos.push(periodo);
        
        // Se o período aquisitivo finalizou no passado, avança para o próximo
        if (isBefore(fimAquisitivo, hoje)) {
            currentInicio = fimAquisitivo;
        } else {
            break; // Se o período atual ainda não terminou, para o loop
        }
    }
    
    // O período atual é o último período calculado
    const periodoAtual = periodos[periodos.length - 1] || null;
    
    // Faltas acumuladas (apenas do período atual, se estiver em andamento)
    const faltasAcumuladas = periodoAtual?.status === 'Em Andamento' ? periodoAtual.faltas_injustificadas : 0;

    return {
        periodos,
        periodoAtual,
        ultimaFeriasFim,
        diasDeFeriasDireito: periodoAtual?.dias_direito || 0,
        faltasInjustificadasAcumuladas: faltasAcumuladas,
    };
};

/**
 * Função para buscar todos os registros de ponto (faltas/abonos) desde o início do contrato.
 */
const fetchAllAbsenceRecords = async (userId: string, dataInicioContrato: string, isFuncionarioAdmin: boolean): Promise<{ registros: RegistroPonto[], feriasGozadas: any[] }> => {
    const tabelaRegistros = isFuncionarioAdmin ? 'admin_registros_ponto' : 'registros_ponto';
    const tabelaFerias = isFuncionarioAdmin ? 'admin_ferias_user' : 'ferias';
    
    // Busca todos os registros de ponto (Falta/Abono) desde o início do contrato
    const { data: registros, error: regError } = await supabase
        .from(tabelaRegistros)
        .select('id, horario_registro, tipo, atestado_url')
        .eq('funcionario_id', userId)
        .in('tipo', ['Falta', 'Abono'])
        .gte('horario_registro', dataInicioContrato);

    if (regError) {
        console.error('Erro ao buscar registros de ponto para CLT:', regError);
        return { registros: [], feriasGozadas: [] };
    }
    
    // Busca todos os registros de férias gozadas
    const { data: feriasGozadas, error: feriasError } = await supabase
        .from(tabelaFerias)
        .select('data_inicio, data_fim')
        .eq('funcionario_id', userId);
        
    if (feriasError) {
        console.error('Erro ao buscar férias gozadas:', feriasError);
    }

    return { registros: registros as RegistroPonto[], feriasGozadas: feriasGozadas || [] };
};


export const useFeriasCLT = (
    userId: string,
    dataInicioContrato: string | null | undefined,
    mesReferencia: Date,
    isFuncionarioAdmin: boolean
): FeriasCLTData => {
    const [data, setData] = useState<Omit<FeriasCLTData, 'carregando'>>({
        periodos: [],
        periodoAtual: null,
        ultimaFeriasFim: null,
        diasDeFeriasDireito: 0,
        faltasInjustificadasAcumuladas: 0,
    });
    const [carregando, setCarregando] = useState(true);

    const loadData = useCallback(async () => {
        if (!userId || !dataInicioContrato) {
            setCarregando(false);
            return;
        }

        setCarregando(true);
        try {
            const { registros, feriasGozadas } = await fetchAllAbsenceRecords(userId, dataInicioContrato, isFuncionarioAdmin);
            
            const calculated = calcularPeriodos(dataInicioContrato, mesReferencia, registros, feriasGozadas);
            
            setData(calculated);
        } catch (error) {
            console.error('Erro ao carregar dados de férias CLT:', error);
            setData({
                periodos: [],
                periodoAtual: null,
                ultimaFeriasFim: null,
                diasDeFeriasDireito: 0,
                faltasInjustificadasAcumuladas: 0,
            });
        } finally {
            setCarregando(false);
        }
    }, [userId, dataInicioContrato, mesReferencia, isFuncionarioAdmin]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    return {
        ...data,
        carregando,
    };
};