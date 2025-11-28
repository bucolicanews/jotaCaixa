export interface ModeloSocietario {
  id: string;
  proprietario_id: string;
  titulo: string;
  conteudo_template: string;
  tipo_documento: string | null;
  criado_em: string;
  // tipo_conteudo removido
}
export type DocumentoSocietarioModelo = ModeloSocietario;

export interface BlocoSocietario {
  id: string;
  proprietario_id: string;
  titulo: string;
  conteudo: string;
  tipo_bloco: string | null;
  criado_em: string;
}

export interface DocumentoSocietarioGerado {
  id: string;
  modelo_id: string | null;
  cliente_id: string | null;
  proprietario_id: string;
  status: 'rascunho' | 'finalizado' | 'arquivado' | 'ativo';
  valores_tags_preenchidos: Record<string, any> | null;
  conteudo_renderizado: string | null;
  data_registro: string;
  criado_em: string;
}