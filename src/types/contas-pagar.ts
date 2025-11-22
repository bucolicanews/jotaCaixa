// import { Cliente } from './cliente'; // REMOVIDO

export interface ContaPagar {
  id: string;
  empresa_id: string | null; // Null para Admin, ID para Cliente
  fornecedor: string;
  documento: string | null;
  data_vencimento: string;
  valor: number;
  status: 'pendente' | 'pago' | 'atrasado' | 'cancelado';
  conta_contabil_id: string | null;
}

export interface AdminContaPagar {
  id: string;
  admin_id: string;
  fornecedor: string;
  documento: string | null;
  data_vencimento: string;
  valor_total: number;
  status: 'pendente' | 'pago' | 'atrasado' | 'cancelado';
  descricao: string;
  origem: 'manual' | 'contrato' | 'assinatura_recorrente';
  id_conta_patrimonial: string | null; // RENOMEADO: id_conta_contabil -> id_conta_patrimonial
  historico_id?: string | null; // ADICIONADO
  id_conta_resultado?: string | null; // NOVO CAMPO
}

export interface AdminParcelaPagar {
  id: string;
  conta_pagar_id: string;
  admin_id: string;
  numero_parcela: number;
  valor_parcela: number;
  valor_pago: number;
  data_vencimento: string;
  data_pagamento: string | null;
  status: 'aberta' | 'parcial' | 'paga' | 'reprogramada' | 'cancelada';
}

export interface AdminPagamento {
  id: string;
  parcela_id: string;
  admin_id: string;
  valor_pago: number;
  data_pagamento: string;
  forma_pagamento: string;
  conta_id: string;
  id_conta_contabil: string | null;
  historico_id?: string | null; // ADICIONADO
  id_conta_resultado?: string | null; // NOVO CAMPO: Conta de Resultado (DRE)
  
  // Relações para exibição
  saldo_contas: { nome: string } | null;
  admin_parcelas_pagar: {
    numero_parcela: number;
    admin_contas_pagar: {
      descricao: string;
      origem: AdminContaPagar['origem'];
    } | null;
  } | null;
}

// Tipos combinados para a página ContasPagar.tsx
export interface ContaPagarComProgresso extends AdminContaPagar {
    parcelas_pagas?: number;
    parcelas_total?: number;
}

export interface ExtendedParcelaPagar extends AdminParcelaPagar {
    admin_contas_pagar: {
        id: string; // CORRIGIDO: Adicionado ID
        fornecedor: string; // Adicionado para corrigir TS2339
        descricao: string;
        origem: AdminContaPagar['origem'];
        id_conta_patrimonial: string | null; // ADICIONADO
    } | null;
}