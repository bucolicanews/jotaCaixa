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
    const url = `${this.baseUrl}/orders`;
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token.substring(0, 8)}...`,
        'Accept': 'application/json'
    };

    console.log('[create-pagbank-payment] 📤 REQUEST RAW');
    console.log('URL:', url);
    console.log('HEADERS:', JSON.stringify(headers, null, 2));
    console.log('BODY:', JSON.stringify(request, null, 2));
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...headers,
        'Authorization': `Bearer ${this.token}` // Token real para a requisição
      },
      body: JSON.stringify(request),
    });

    const responseText = await response.text();
    console.log('[create-pagbank-payment] 📥 RESPONSE RAW');
    console.log('STATUS:', response.status);
    console.log('BODY:', responseText);

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

    const responseText = await response.text();
    console.log('[create-pagbank-payment] 📥 GET CHARGE RAW RESPONSE');
    console.log('STATUS:', response.status);
    console.log('BODY:', responseText);

    if (!response.ok) {
      throw new Error(`PagBank API error: ${response.status} - ${responseText}`);
    }

    return JSON.parse(responseText);
  }
}