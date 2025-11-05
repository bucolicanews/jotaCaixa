export interface PlanoContas {
  id: string;
  proprietario_id: string;
  Conta: string; // Código da Conta
  Descricao: string; // Nome da Conta
  codigo_reduzido: string | null;
  Analitica: 'Sim' | 'Não'; // Sim ou Não
  is_conta_saldo: boolean; // NOVO CAMPO
  is_conta_resultado: boolean; // NOVO CAMPO
  criado_em: string;
  atualizado_em: string;
}

export interface ContaCSV {
  Conta: string;
  'Código reduzido': string; // Corrigido para o cabeçalho exato
  Descrição: string; // Corrigido para o cabeçalho exato
  Analítica: 'Sim' | 'Não'; // Corrigido para o cabeçalho exato
}

// Interface para dados importados via JSON (mesmos campos finais)
export interface ContaJSON {
  Conta: string;
  'Código reduzido': string;
  Descrição: string;
  Analítica: 'Sim' | 'Não';
}