export interface RegistroPonto {
  id: string;
  funcionario_id: string;
  empresa_id: string;
  horario_registro: string; // ISO string
  tipo: 'Entrada' | 'Saida' | 'Falta' | 'Abono';
  maps_url: string;
  selfie_url: string;
  atestado_url?: string | null;
  observacao?: string | null;
}