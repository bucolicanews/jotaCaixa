export interface PeriodoAquisitivo {
    inicio_aquisitivo: Date;
    fim_aquisitivo: Date;
    limite_concessivo: Date;
    dias_direito: number;
    faltas_injustificadas: number;
    status: 'Em Aberto' | 'Vencida' | 'Vencida em Dobro' | 'Gozada' | 'Em Andamento';
}

export interface FeriasCLTData {
    periodos: PeriodoAquisitivo[];
    periodoAtual: PeriodoAquisitivo | null;
    ultimaFeriasFim: Date | null;
    diasDeFeriasDireito: number;
    faltasInjustificadasAcumuladas: number;
    carregando: boolean;
}