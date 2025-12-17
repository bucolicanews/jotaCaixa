export type SetupStepKey =
  | 'plano_contas'
  | 'historicos'
  | 'config_cp'
  | 'config_cr'
  | 'config_contratos'
  | 'plano_contas_caixa'
  | 'plano_contas_banco'
  | 'plano_contas_cliente'
  | 'plano_contas_fornecedor'
  | 'plano_contas_capital_social'
  | 'plano_contas_receita'
  | 'plano_contas_despesa';

export interface SetupStatus {
  isComplete: boolean;
  missingSteps: SetupStepKey[];
  checkedAt?: string;
  firstLaunchCompleted?: boolean;
}
