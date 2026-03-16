import { Cliente } from './cliente';

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
  historico_id?: string | null;
  id_conta_patrimonial?: string | null;
  id_conta_resultado?: string | null;
}

export interface Parcela {
  id: string;
  conta_receber_id: string;
  numero_parcela: number;
  valor_parcela: number;
  valor_pago: number;
  valor_juros?: number; // ADICIONADO
  valor_multa?: number; // ADICIONADO
  data_vencimento: string;
  status: 'aberta' | 'parcial' | 'paga' | 'reprogramada' | 'cancelada' | 'bloqueada';
}

export interface ParcelaDetalhada extends Parcela {
  contas_receber: {
    descricao: string;
    clientes: {
      nome: string;
    } | null;
  } | null;
}

export interface ContaReceberComProgresso extends ContaReceber {
    parcelas_pagas?: number;
    parcelas_total?: number;
    contrato_gerado_id?: string | null;
}

export interface ExtendedParcelaDetalhada extends ParcelaDetalhada {
    data_pagamento?: string | null;
    ciente_cliente?: boolean | null;
    forma_pagamento?: string | null;
    conta_nome?: string | null;
    valor_recebido?: number | null;
    valor_original?: number | null;
    valor_juros?: number | undefined;
    valor_multa?: number | null;
    valor_atualizado?: number | null;
    pagbank_charge_id?: string | null;
    pagbank_boleto_barcode?: string | null;
    pagbank_transaction_id?: string | null;
    contas_receber: {
        id: string;
        descricao: string;
        cliente_id: string | null;
        origem: ContaReceber['origem'];
        contrato_gerado_id?: string | null;
        clientes: { nome: string; razao_social?: string | null; telefone?: string; email?: string; } | null;
        id_conta_patrimonial?: string | null;
        id_conta_resultado?: string | null;
        historico_id?: string | null;
        plano_contas_patrimonial?: { Conta: string, Descricao: string } | null;
        plano_contas_resultado?: { Conta: string, Descricao: string } | null;
        historicos?: { codigo: string | null, descricao: string } | null;
    } | null;
}

export interface AdminRecebimento {
    id: string;
    data_recebimento: string;
    valor_recebido: number;
    forma_pagamento: string;
    cliente_id: string;
    conta_id: string;
    parcela_id?: string | null;
    tipo_recebimento?: string | null;
    codigo_transacao?: string | null;
    pagbank_charge_id?: string | null;
    saldo_contas: { nome: string } | null;
    historico_id?: string | null;
    historicos?: { descricao: string } | null;
    id_conta_resultado?: string | null;
    admin_parcelas_receber: {
        numero_parcela: number;
        valor_parcela: number;
        admin_contas_receber: {
            id: string;
            descricao: string;
            origem: ContaReceber['origem'];
            contrato_gerado_id?: string | null;
            cliente_id: string;
        } | null;
    } | null;
}