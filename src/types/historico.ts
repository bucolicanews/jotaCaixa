export interface Historico {
  id: string;
  proprietario_id: string;
  descricao: string;
  codigo: string | null; // NOVO CAMPO
  criado_em: string;
}

export interface HistoricoCSV {
  Descricao: string; // Alterado para Descricao (sem acento)
  Código?: string; // Adicionando Código (com acento) para leitura do CSV
}