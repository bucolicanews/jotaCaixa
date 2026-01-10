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
  phones?: Array<{
    country: string;
    area: string;
    number: string;
    type: string;
  }>;
}

export interface PagBankItem {
  reference_id?: string;
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
  charges?: Array<{
    reference_id: string;
    description: string;
    amount: {
      value: number;
      currency: string;
    };
    payment_method: {
      type: string;
      installments?: number;
      capture?: boolean;
      card?: {
        number: string;
        exp_month: string;
        exp_year: string;
        security_code: string;
        holder: {
          name: string;
        };
      };
      boleto?: {
        due_date: string;
        instruction_lines: {
          line_1: string;
          line_2: string;
        };
        holder: {
          name: string;
          tax_id: string;
          email: string;
          address: {
            street: string;
            number: string;
            locality: string;
            city: string;
            region_code: string;
            country: string;
            postal_code: string;
          };
        };
      };
    };
  }>;
}

export interface CreateChargeResponse {
  id: string;
  reference_id: string;
  status?: string;
  created_at: string;
  amount?: {
    value: number;
    currency: string;
  };
  links?: Array<{
    rel: string;
    href: string;
    media?: string;
    type?: string;
  }>;
  qr_codes?: Array<{
    id: string;
    text: string;
    expiration_date?: string;
    amount?: {
      value: number;
    };
    links: Array<{
      rel: string;
      href: string;
      media: string;
      type?: string;
    }>;
  }>;
  charges?: Array<{
    id: string;
    reference_id: string;
    status: string;
    amount: {
      value: number;
      currency: string;
      summary: {
        total: number;
        paid: number;
        refunded: number;
      };
    };
    payment_method: {
      type: string;
      boleto?: {
        id: string;
        barcode: string;
        formatted_barcode: string;
        due_date: string;
      };
    };
    links: Array<{
      rel: string;
      href: string;
      media: string;
      type: string;
    }>;
  }>;
}
