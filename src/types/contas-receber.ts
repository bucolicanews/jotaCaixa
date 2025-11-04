import { Cliente } from './cliente';

export interface ParcelaParaPagamento {
  id: string;
  conta_receber_id: string;
  empresa_id: string;
  valor_parcela: number;
  valor_pago: number;
  cliente_id: string | null;
  numero_parcela: number; // ADICIONADO
}

export interface ContaReceber {
  id: string;
  empresa_id: string;
  cliente_id: string;
  origem: 'manual' | 'contrato' | 'assinatura_recorrente';
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
  clientes: Cliente;
}

export interface Parcela {
  id: string;
  conta_receber_id: string; // Adicionado
  numero_parcela: number;
  valor_parcela: number;
  valor_pago: number;
  data_vencimento: string;
  status: 'aberta' | 'parcial' | 'paga' | 'reprogramada' | 'cancelada';
}

export interface ParcelaDetalhada extends Parcela {
  contas_receber: {
    descricao: string;
    clientes: {
      nome: string;
    } | null;
  } | null;
}

// Tipos adicionais para ContasReceber.tsx e ContasReceberResumo.tsx
export interface ContaReceberComProgresso extends ContaReceber {
    parcelas_pagas?: number;
    parcelas_total?: number;
}

export interface ExtendedParcelaDetalhada extends ParcelaDetalhada {
    data_pagamento?: string | null;
    contas_receber: {
        descricao: string;
        cliente_id: string | null;
        origem: ContaReceber['origem'];
        clientes: { nome: string } | null;
    } | null;
}

export interface AdminRecebimento {
    id: string;
    data_recebimento: string;
    valor_recebido: number;
    forma_pagamento: string;
    cliente_id: string;
    admin_parcelas_receber: {
        numero_parcela: number;
        admin_contas_receber: {
            descricao: string;
            origem: ContaReceber['origem'];
            cliente_id: string;
        } | null;
    } | null;
}