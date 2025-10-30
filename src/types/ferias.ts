export interface Ferias {
    id: string;
    funcionario_id: string;
    empresa_id: string;
    data_inicio: string; // Formato ISO 'yyyy-MM-dd'
    data_fim: string; // Formato ISO 'yyyy-MM-dd'
    status: 'agendada' | 'concluida' | 'cancelada';
    created_at: string;
}