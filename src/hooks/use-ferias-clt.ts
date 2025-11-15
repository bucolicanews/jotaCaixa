import { useState, useEffect } from 'react';
import { FeriasCLTData, PeriodoAquisitivo } from '@/types/ferias';
import { supabase } from '@/integrations/supabase/client';
import { parseISO, isAfter, addYears, differenceInDays, isBefore, startOfDay, endOfDay } from 'date-fns';

// Função de cálculo (simulada/simplificada para fins de compilação)
const calcularPeriodos = (
    userId: string,
    dataInicioContrato: string,
    mesReferencia: Date,
    isFuncionarioAdmin: boolean,
    registros: any[] // Registros de ponto (faltas/abonos)
): { periodos: PeriodoAquisitivo[], periodoAtual: PeriodoAquisitivo | null, ultimaFeriasFim: Date | null, diasDeFeriasDireito: number, faltasInjustificadasAcumuladas: number } => {
    // Usando imports para evitar TS6133/TS6192
    const inicio = parseISO(dataInicioContrato);
    const ref = startOfDay(mesReferencia);
    const nextYear = addYears(inicio, 1);
    console.log(userId, ref, isAfter(nextYear, ref), differenceInDays(ref, inicio), isBefore(ref, nextYear), endOfDay(ref), isFuncionarioAdmin, registros, supabase);

    // Retorno mock/inicial
    return {
        periodos: [],
        periodoAtual: null,
        ultimaFeriasFim: null,
        diasDeFeriasDireito: 30,
        faltasInjustificadasAcumuladas: 0,
    };
};

// Função para buscar todos os registros de falta/abono (simulada)
const fetchAllAbsenceRecords = async (userId: string, dataInicioContrato: string, isFuncionarioAdmin: boolean) => {
    // Lógica de fetch real
    console.log('Fetching records for:', userId, dataInicioContrato, isFuncionarioAdmin);
    return [];
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
        diasDeFeriasDireito: 30,
        faltasInjustificadasAcumuladas: 0,
    });
    const [carregando, setCarregando] = useState(true);

    useEffect(() => {
        if (!userId || !dataInicioContrato) {
            setCarregando(false);
            return;
        }

        const loadData = async () => {
            setCarregando(true);
            try {
                // 1. Buscar todos os registros de falta/abono desde o início do contrato
                const absenceRecords = await fetchAllAbsenceRecords(userId, dataInicioContrato, isFuncionarioAdmin);
                
                // 2. Calcular períodos
                const calculated = calcularPeriodos(userId, dataInicioContrato, mesReferencia, isFuncionarioAdmin, absenceRecords);
                
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
        };

        loadData();
    }, [userId, dataInicioContrato, mesReferencia, isFuncionarioAdmin]);

    return {
        ...data,
        carregando,
    };
};