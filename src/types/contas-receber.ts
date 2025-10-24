import { Cliente } from './cliente';

export interface ContaReceber {
  id: string;
  empresa_id: string;
  cliente_id?: string | null;
  nome_cliente_avulso?: string | null;
  origem: 'manual' | 'contrato';
  descricao: string;
  valor_total: number;
  data_emissao: string;
  data_vencimento: string;
  status: 'aberta' | 'parcial' | 'recebida' | 'cancelada';
  tipo_receita: 'única' | 'recorrente';
  intervalo_recorrencia?: 'mensal' | 'bimestral' | 'anual' | null;
  contrato_id?: string | null;
  observacoes?: string | null;
  created_at: string;
  updated_at: string;
  clientes?: Cliente | null;
}