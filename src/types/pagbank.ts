export interface PagBankConfig {
  id: string;
  proprietario_id: string;
  token_sandbox: string | null;
  token_producao: string | null;
  ambiente: 'sandbox' | 'producao';
  conta_sintetica_id: string | null;
  historico_padrao_id: string | null;
  id_conta_resultado: string | null;
  conta_despesa_taxa_id: string | null;
  historico_taxa_id: string | null;
  webhook_url: string;
  webhook_secret: string | null;
  email_remetente: string | null;
  resend_api_key: string | null;
  whatsapp_template: string | null;
  aplica_juros_multa: boolean | null;
  percentual_multa: number | null;
  percentual_juros_mes: number | null;
  created_at: string;
  updated_at: string;
}

export type PagBankPaymentMethod = 'pix' | 'boleto' | 'credit_card' | 'checkout';

export type PagBankChargeStatus = 'WAITING' | 'PAID' | 'DECLINED' | 'CANCELED' | 'EXPIRED';

export type PagBankTransferStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELED';

export interface PagBankCharge {
  id: string;
  reference_id: string;
  status: PagBankChargeStatus;
  created_at: string;
  paid_at?: string;
  amount: {
    value: number;
    currency: string;
    fees?: number;
  };
  payment_method?: {
    type: string;
  };
  links?: Array<{
    rel: string;
    href: string;
    media: string;
  }>;
  qr_codes?: Array<{
    id: string;
    text: string;
    links: Array<{
      rel: string;
      href: string;
      media: string;
    }>;
  }>;
}

export interface PagBankCustomer {
  name: string;
  email: string;
  tax_id: string;
  phones?: Array<{
    country: string;
    area: string;
    number: string;
  }>;
}

export interface PagBankItem {
  reference_id: string;
  name: string;
  quantity: number;
  unit_amount: number;
}

export interface CreateChargeRequest {
  reference_id: string;
  customer: PagBankCustomer;
  items: PagBankItem[];
  notification_urls?: string[];
  qr_codes?: Array<{
    amount: {
      value: number;
    };
    expiration_date?: string;
  }>;
  payment_methods?: Array<{
    type: string;
    installments?: number;
  }>;
}

export interface CreateChargeResponse {
  id: string;
  reference_id: string;
  status: PagBankChargeStatus;
  created_at: string;
  amount: {
    value: number;
    currency: string;
  };
  links: Array<{
    rel: string;
    href: string;
    media: string;
  }>;
  qr_codes?: Array<{
    id: string;
    text: string;
    links: Array<{
      rel: string;
      href: string;
      media: string;
    }>;
  }>;
  payment_response?: {
    code: string;
    message: string;
  };
}

export interface PagBankWebhookPayload {
  id: string;
  reference_id: string;
  status: PagBankChargeStatus;
  created_at: string;
  paid_at?: string;
  amount: {
    value: number;
    currency: string;
  };
  payment_method?: {
    type: string;
  };
  charges?: Array<{
    id: string;
    status: PagBankChargeStatus;
    amount: {
      value: number;
      fees: number;
    };
  }>;
}

export interface PagBankTransactionLog {
  id: string;
  proprietario_id: string;
  transaction_type: 'payment' | 'transfer' | 'webhook' | 'sync';
  pagbank_id: string | null;
  reference_id: string | null;
  status: string | null;
  amount: number | null;
  request_payload: Record<string, unknown> | null;
  response_payload: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
}

export interface ParcelaComPagBank {
  id: string;
  conta_receber_id: string;
  numero_parcela: number;
  valor_parcela: number;
  valor_pago: number;
  data_vencimento: string;
  status: 'aberta' | 'parcial' | 'paga' | 'reprogramada' | 'cancelada' | 'bloqueada';
  pagbank_charge_id: string | null;
  pagbank_payment_link: string | null;
  pagbank_payment_method: PagBankPaymentMethod | null;
  pagbank_status: PagBankChargeStatus | null;
  pagbank_qr_code: string | null;
  pagbank_qr_code_text: string | null;
  pagbank_boleto_barcode: string | null;
  pagbank_boleto_pdf_url: string | null;
  pagbank_updated_at: string | null;
}

export interface BankAccount {
  holder: string;
  tax_id: string;
  bank: string;
  branch: string;
  account: string;
  type: 'CHECKING' | 'SAVINGS';
}

export interface CreateTransferRequest {
  reference_id: string;
  amount: {
    value: number;
  };
  recipient: {
    bank_account: BankAccount;
  };
  description?: string;
}

export interface CreateTransferResponse {
  id: string;
  reference_id: string;
  status: PagBankTransferStatus;
  created_at: string;
  amount: {
    value: number;
    currency: string;
    fees?: number;
  };
}

export interface PagBankError {
  error_messages: Array<{
    code: string;
    description: string;
    parameter_name?: string;
  }>;
}

export interface GerarLinkPagBankInput {
  parcela_id: string;
  payment_method: PagBankPaymentMethod;
  installments?: number;
}

export interface GerarLinkPagBankOutput {
  success: boolean;
  charge_id?: string;
  payment_link?: string;
  qr_code?: string;
  qr_code_text?: string;
  boleto_barcode?: string;
  boleto_pdf_url?: string;
  error?: string;
}