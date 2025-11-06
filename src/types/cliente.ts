export interface Cliente {
  id: string;
  proprietario_id: string;
  nome: string; // Usado como Nome Fantasia ou Nome Pessoal
  razao_social?: string | null;
  nome_fantasia?: string | null;
  documento?: string | null;
  email?: string | null;
  telefone?: string | null; // Telefone celular/principal
  telefone_fixo?: string | null;
  
  // Endereço
  cep?: string | null;
  endereco?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  
  created_at: string;
  updated_at: string;
}