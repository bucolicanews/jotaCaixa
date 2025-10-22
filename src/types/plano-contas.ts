export interface PlanoContas {
  id: string;
  empresa_id: string;
  codigo_conta: string;
  nome_conta: string;
  tipo: 'Analítica' | 'Sintética'; // Baseado na coluna 'Analítica' do CSV
  criado_em: string;
  atualizado_em: string;
}

export interface ContaCSV {
  Conta: string;
  Analítica: 'Sim' | 'Não';
  'C.R.': string;
  Descrição: string;
  'SPED ECD/ECF': 'Sim' | 'Não';
}