export interface WebhookPayload {
  id: string;
  reference_id: string;
  status: string;
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
    status: string;
    amount: {
      value: number;
      fees: number;
    };
  }>;
}
