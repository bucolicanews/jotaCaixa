export interface PlanoContas {
  id: string;
  proprietario_id: string;
  Conta: string; // Novo nome
  Descricao: string; // Novo nome
  codigo_reduzido: string | null;
  Analitica: 'Sim' | 'Não'; // Novo nome e tipo
  criado_em: string;
  atualizado_em: string;
}

export interface ContaCSV {
  Conta: string;
  'Código Reduzido': string;
  Descrição: string;
  Analítica: 'Sim' | 'Não';
}