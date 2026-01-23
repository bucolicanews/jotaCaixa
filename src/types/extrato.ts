export interface ExtratoBase {
  id: string;
  empresa_id: string;
  id_saldo_contas: string;
  data: string;
  descricao: string;
  valor: number;
  tipo: 'Entrada' | 'Saida';
  identificacao?: string;
  conciliado: boolean;
  conta_contabil_id?: string;
  mapeado_parcela_id?: string;
  mapeado_tipo?: 'CP' | 'CR';
  created_at?: string;
}

export interface ExtratoMapeado extends ExtratoBase {
  mapeado_parcela_id: string;
  mapeado_tipo: 'CP' | 'CR';
  saldo_contas?: { nome: string };
  plano_contas?: { Conta: string; Descricao: string };
  parcela_info?: {
    numero_parcela: number;
    valor_parcela: number;
    fornecedor_cliente: string;
    descricao: string;
  };
}

export interface ExtratoNaoMapeado extends ExtratoBase {
  mapeado_parcela_id: null;
  saldo_contas?: { nome: string };
}

export interface ParcelaSugestao {
  id: string;
  numero_parcela: number;
  valor_parcela: number;
  data_vencimento: string;
  fornecedor_cliente: string;
  descricao: string;
  tipo: 'CP' | 'CR';
  score: number;
}

export interface ParcelaMatching {
  id: string;
  numero_parcela: number;
  numeroParcela: number; // alias
  valor_parcela: number;
  valor: number; // alias
  data_vencimento: string;
  dataVencimento: string; // alias
  clienteNome: string;
  fornecedor_cliente?: string;
  descricao: string;
  tipo: 'CP' | 'CR';
  status: string;
  matchScore?: number;
  tipoMatch?: 'VALOR_EXATO_DATA_EXATA' | 'VALOR_EXATO' | 'DATA_EXATA' | 'APROXIMADO';
}

export interface TransacaoExtratoCompleta extends ExtratoBase {
  id: string;
  saldo_contas?: { nome: string };
}
