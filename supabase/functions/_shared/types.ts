export interface PagBankConfig {
  token_sandbox: string | null;
  token_producao: string | null;
  ambiente: 'sandbox' | 'producao';
  conta_sintetica_id: string | null;
  historico_padrao_id: string | null;
  id_conta_resultado: string | null;
  conta_despesa_taxa_id: string | null;
  historico_taxa_id: string | null;
  webhook_url: string;
}

export interface PagBankCustomer {
  name: string;
  email: string;
  tax_id: string;
}

export interface PagBankItem {
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
    amount: { value: number };
    expiration_date?: string;
  }>;
}

export interface CreateChargeResponse {
  id: string;
  reference_id: string;
  status: string;
  created_at: string;
  amount?: {
    value: number;
    currency: string;
  };
  links?: Array<{
    rel: string;
    href: string;
    media?: string;
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

export interface BankAccount {
  holder: string;
  tax_id: string;
  bank: string;
  branch: string;
  account: string;
  account_digit?: string;
  type: 'CHECKING' | 'SAVINGS';
}

export interface CreateTransferRequest {
  reference_id: string;
  amount: {
    value: number;
  };
  recipient: {
    name: string;
    tax_id: string;
    bank_account: BankAccount;
  };
  description?: string;
}

export interface CreateTransferResponse {
  id: string;
  reference_id: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELED';
  created_at: string;
  amount: {
    value: number;
    currency: string;
    fees?: number;
  };
}