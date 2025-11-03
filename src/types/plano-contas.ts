export interface PlanoContas {
  id: string;
  proprietario_id: string; // Renomeado
  codigo_conta: string;
  nome_conta: string;
  codigo_reduzido: string | null; // Novo campo
  tipo: 'Analítica' | 'Sintética'; // Baseado na coluna 'Analítica' do CSV
  criado_em: string;
  atualizado_em: string;
}

export interface ContaCSV {
  Conta: string;
  'Código Reduzido': string; // Novo campo
  Descrição: string;
  Analítica: 'Sim' | 'Não';
}