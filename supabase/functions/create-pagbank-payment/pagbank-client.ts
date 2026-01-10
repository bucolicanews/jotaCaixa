import { CreateChargeRequest, CreateChargeResponse, PagBankConfig } from './types.ts';

export class PagBankClient {
  private baseUrl: string;
  private token: string;

  constructor(config: PagBankConfig) {
    this.baseUrl = config.ambiente === 'producao' 
      ? 'https://api.pagseguro.com'
      : 'https://sandbox.api.pagseguro.com';
    
    const token = config.ambiente === 'producao' 
      ? config.token_producao 
      : config.token_sandbox;
    
    if (!token) {
      throw new Error(`Token ${config.ambiente} não configurado`);
    }
    
    this.token = token;
  }

  async createCharge(request: CreateChargeRequest): Promise<CreateChargeResponse> {
    // Para PIX, usamos o endpoint /orders ao invés de /charges
    const url = `${this.baseUrl}/orders`;
    
    console.log('PagBankClient - URL:', url);
    console.log('PagBankClient - Request:', JSON.stringify(request, null, 2));
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
      },
      body: JSON.stringify(request),
    });

    const responseText = await response.text();
    console.log('PagBankClient - Response status:', response.status);
    console.log('PagBankClient - Response body:', responseText);

    if (!response.ok) {
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

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PagBank API error: ${response.status} - ${errorText}`);
    }

    return await response.json();
  }

  async cancelCharge(chargeId: string): Promise<void> {
    const url = `${this.baseUrl}/orders/${chargeId}`;
    
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PagBank API error: ${response.status} - ${errorText}`);
    }
  }
}
