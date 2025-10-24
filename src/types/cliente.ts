export interface Cliente {
  id: string;
  empresa_id: string;
  nome: string;
  documento?: string | null;
  email?: string | null;
  telefone?: string | null;
  created_at: string;
  updated_at: string;
}