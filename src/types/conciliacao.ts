export interface ConfiguracaoBanco {
  id: string;
  empresa_id: string;
  nome_banco: string;
  mapeamento: Record<string, string>; // { Coluna_Arquivo: Campo_Interno }
  coluna_tipo_transacao: string | null;
  valor_credito: string | null;
  criado_em: string;
}

export interface ExtratoRow {
  id: string; // ID temporário para o frontend
  data_movimentacao: string;
  descricao: string;
  valor: number;
  tipo: 'Entrada' | 'Saida';
  identificacao_original: string;
  conciliado: boolean;
}