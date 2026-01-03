
export interface Protocolo {
  id: number;
  cliente_id: number;
  numero_protocolo: string;
  status: 'Impresso' | 'Trânsito' | 'Entregue' | 'Cancelado' | 'Problema';
  img_protocolo?: string;
  nome_resp_recebimento?: string;
  created_at: string;
  admin_id: string;
  // Relationship
  tbl_clientes: {
    nome: string;
    empresa: string;
  };
}

export interface ProtocoloFile {
  id: number;
  protocolo_id: number;
  file_name: string;
  file_url: string;
  created_at: string;
}
