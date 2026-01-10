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
  recipient?: {
    name: string;
    tax_id: string;
    bank_account: BankAccount;
  };
}

export interface TransferError {
  error_messages: Array<{
    code: string;
    description: string;
    parameter_name?: string;
  }>;
}

export interface RequestBody {
  parcela_pagar_id: string;
  recipient: {
    name: string;
    tax_id: string;
    bank_account: BankAccount;
  };
}
