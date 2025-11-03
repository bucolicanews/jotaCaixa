export interface PlanoContas {
  id: string;
  proprietario_id: string;
  Conta: string; // Código da Conta
  Descricao: string; // Nome da Conta
  codigo_reduzido: string | null;
  Analitica: 'Sim' | 'Não'; // Sim ou Não
  criado_em: string;
  atualizado_em: string;
}

export interface ContaCSV {
  Conta: string;
  'Código Reduzido': string;
  Descrição: string;
  Analítica: 'Sim' | 'Não';
}