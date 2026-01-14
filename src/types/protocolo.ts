export interface Protocolo {
  id: string;
  cliente_id: string;
  numero_protocolo: string;
  status: 'Criado' | 'Impresso' | 'Trânsito' | 'Entregue' | 'Cancelado' | 'Problema';
  img_protocolo: string | null;
  nome_resp_recebimento: string | null;
  created_at: string;
  admin_id: string;
  criado_por: string;
  data_criacao: string;
  data_impressao: string | null;
  data_recebimento: string | null;
  usuario_criador_nome: string | null;
  anexos: string[] | null;
  titulo: string | null;
  descricao: string | null;
  link_tarefa: string | null;
  // Relationship
  tbl_clientes: {
    nome: string;
    razao_social: string;
  } | null;
}

export interface ProtocoloFile {
  id: string;
  protocolo_id: string;
  file_name: string;
  file_url: string;
  created_at: string;
}