import { CreateTransferRequest, CreateTransferResponse } from './types.ts';
import { PagBankConfig } from '../../../src/types/pagbank.ts';

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

  async createTransfer(request: CreateTransferRequest): Promise<CreateTransferResponse> {
    const url = `${this.baseUrl}/transfers`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PagBank API error: ${response.status} - ${errorText}`);
    }

    return await response.json();
  }

  async getTransfer(transferId: string): Promise<CreateTransferResponse> {
    const url = `${this.baseUrl}/transfers/${transferId}`;
    
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

  async cancelTransfer(transferId: string): Promise<void> {
    const url = `${this.baseUrl}/transfers/${transferId}`;
    
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
