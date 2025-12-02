export interface RegistroPonto {
  id: string;
  funcionario_id: string;
  empresa_id: string;
  horario_registro: string; // ISO string
  tipo: 'Entrada' | 'Saida' | 'Falta' | 'Abono' | 'Compensacao' | 'Extra100';
  maps_url: string;
  selfie_url: string;
  atestado_url?: string | null;
  observacao?: string | null;
}

export interface Ferias {
  id: string;
  data_inicio: string;
  data_fim: string;
  periodo_referencia: string;
  status: 'agendada' | 'concluida' | 'cancelada'; // Adicionado para compatibilidade com GerenciarFerias
}