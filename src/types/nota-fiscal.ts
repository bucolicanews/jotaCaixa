export interface NotaFiscal {
  id: string;
  proprietario_id: string;
  parcela_id: string;
  status: 'Pendente Emissão' | 'Nota Emitida' | 'Enviada Cliente' | 'Enviada com Sucesso' | 'Erro Envio';
  numero_nota: string | null;
  valor: number;
  data_emissao: string | null;
  anexo_url: string | null;
  enviado_whatsapp: boolean;
  enviado_email: boolean;
  created_at: string;
  updated_at: string;
  editada: boolean; // NOVO CAMPO
}

export interface NFConfig {
  id: string;
  proprietario_id: string;
  webhook_n8n_url: string | null;
  template_whatsapp: string | null;
  template_email: string | null;
  created_at: string;
  updated_at: string;
}

export interface ParcelaNF {
    id: string;
    valor_parcela: number;
    data_pagamento: string;
    data_vencimento: string;
    descricao_conta: string;
    cliente_id: string | null;
    cliente_nome: string;
    cliente_telefone: string | null;
    cliente_email: string | null;
    cliente_id_grupo: string | null;
}