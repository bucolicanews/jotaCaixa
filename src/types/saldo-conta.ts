export interface SaldoConta {
  id: string;
  proprietario_id: string;
  nome: string; // Nome da Conta/Caixa
  conta_contabil_id: string | null; // Referência ao Plano de Contas
  tipo_saldo: 'Credito' | 'Debito' | 'Receita' | 'Despesa'; // Tipo de saldo (Ativo/Passivo)
  saldo_inicial: number;
  criado_em: string;
  atualizado_em: string;
}

// Tipo para a conta com o nome do plano de contas
export interface SaldoContaDetalhada extends SaldoConta {
    plano_contas: {
        id: string; // ADICIONADO
        Conta: string;
        Descricao: string;
        is_conta_caixa_banco?: boolean; // ADICIONADO
        is_conta_patrimonial?: boolean; // ADICIONADO
        is_caixa?: boolean;
        is_banco?: boolean;
    } | null;
}