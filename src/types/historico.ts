export interface Historico {
  id: string;
  proprietario_id: string;
  descricao: string;
  criado_em: string;
}

export interface HistoricoCSV {
  Descricao: string; // Alterado para Descricao (sem acento)
}