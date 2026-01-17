import { PagBankConfig, CreateChargeRequest, CreateChargeResponse } from '../create-pagbank-payment/types.ts';

export class PagBankClient {
  private baseUrl: string;
  private token: string;

  constructor(config: PagBankConfig) {
    this.baseUrl = config.ambiente === 'producao' 
      ? 'https://api.pagseguro.com'
      : 'https://sandbox.api.pagseguro.com';
    
    const rawToken = config.ambiente === 'producao' 
      ? config.token_producao 
      : config.token_sandbox;
    
    if (!rawToken) {
      throw new Error(`Token ${config.ambiente} não configurado`);
    }
    
    this.token = rawToken.trim();
  }

  async createCharge(request: CreateChargeRequest): Promise<CreateChargeResponse> {
    const url = `${this.baseUrl}/orders`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/json'
      },
      body: JSON.stringify(request),
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error(`[PagBank Orders Error] Status ${response.status}:`, responseText);
      throw new Error(`PagBank API error: ${response.status} - ${responseText}`);
    }

    return JSON.parse(responseText);
  }

  async getCharge(chargeId: string): Promise<CreateChargeResponse> {
    const url = `${this.baseUrl}/orders/${chargeId}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
      },
    });

    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(`PagBank API error: ${response.status} - ${responseText}`);
    }

    return JSON.parse(responseText);
  }
}