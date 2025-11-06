export interface ContratoTag {
  id: string;
  nome_tag: string;
  descricao: string;
  origem_dado: string | null;
  criado_em: string;
}

export interface ContratoModelo {
  id: string;
  titulo: string;
  conteudo_template: string;
  empresa_id: string | null;
  criado_em: string;
  updated_at: string; // Adicionado para resolver TS2339
}

export interface ContratoGerado {
  id: string;
  modelo_id: string;
  cliente_id: string;
  empresa_id: string;
  status: 'rascunho' | 'pendente_assinatura' | 'ativo' | 'cancelado' | 'concluido';
  valor_total: number;
  data_inicio: string;
  numero_parcelas: number;
  dia_vencimento_parcela: number | null;
  valores_tags_preenchidos: Record<string, any> | null;
  conteudo_renderizado: string | null;
  link_assinatura_externo: string | null;
  documento_assinado_url: string | null;
  criado_em: string;
  updated_at: string;
  
  // NOVOS CAMPOS DE ASSINATURA
  assinatura_nome?: string | null;
  assinatura_selfie_url?: string | null;
}