import { supabase } from '@/integrations/supabase/client';
import { SetupStatus, SetupStepKey } from '@/types/setup';
import { PostgrestFilterBuilder } from '@supabase/postgrest-js';

export const SETUP_STEPS_META: Record<
  SetupStepKey,
  { label: string; description: string; link: string }
> = {
  plano_contas: {
    label: 'Plano de Contas',
    description: 'Cadastre ou importe o plano de contas do cliente.',
    link: '/plano-contas',
  },
  historicos: {
    label: 'Históricos',
    description: 'Importe ou cadastre históricos financeiros em Configurações > Históricos.',
    link: '/historicos',
  },
  config_cp: {
    label: 'Configurações – Contas a Pagar (3.1)',
    description: 'Mapeie as contas contábeis em Configurações > Contas a Pagar.',
    link: '/configuracoes',
  },
  config_cr: {
    label: 'Configurações – Contas a Receber (3.2)',
    description: 'Defina as contas padrão em Configurações > Contas a Receber.',
    link: '/configuracoes',
  },
  config_contratos: {
    label: 'Configurações – Contratos (3.3)',
    description: 'Configure links e contas contábeis na aba Contratos.',
    link: '/configuracoes',
  },
  plano_contas_caixa: {
    label: 'Plano de Contas – Caixa',
    description: 'Marque ao menos uma conta analítica com o switch "Caixa?".',
    link: '/plano-contas',
  },
  plano_contas_banco: {
    label: 'Plano de Contas – Banco',
    description: 'Marque ao menos uma conta analítica com o switch "Banco?".',
    link: '/plano-contas',
  },
  plano_contas_cliente: {
    label: 'Plano de Contas – Clientes a Receber',
    description: 'Marque uma conta patrimonial para clientes (toggle “Clientes a Receber”).',
    link: '/plano-contas',
  },
  plano_contas_fornecedor: {
    label: 'Plano de Contas – Fornecedores a Pagar',
    description: 'Marque uma conta patrimonial para fornecedores (toggle “Fornecedores a Pagar”).',
    link: '/plano-contas',
  },
  plano_contas_capital_social: {
    label: 'Plano de Contas – Capital Social',
    description: 'Marque uma conta patrimonial do grupo Capital Social.',
    link: '/plano-contas',
  },
  plano_contas_receita: {
    label: 'Plano de Contas – Receita',
    description: 'Marque ao menos uma conta de resultado como Receita.',
    link: '/plano-contas',
  },
  plano_contas_despesa: {
    label: 'Plano de Contas – Despesa',
    description: 'Marque ao menos uma conta de resultado como Despesa/Custo.',
    link: '/plano-contas',
  },
};

type RequirementChecker = (ownerId: string) => Promise<boolean>;

const tableCheck =
  (table: string, ownerField: string): RequirementChecker =>
  async (ownerId: string) => {
    const { count, error } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq(ownerField, ownerId);

    if (error) {
      console.error(`[setup-status] erro ao consultar ${table}:`, error);
      return false;
    }

    return (count ?? 0) > 0;
  };

type QueryBuilder = PostgrestFilterBuilder<any, any, any>;

const planoContaCheck =
  (applyFilters: (query: QueryBuilder) => QueryBuilder): RequirementChecker =>
  async (ownerId: string) => {
    let query = supabase
      .from('plano_contas')
      .select('id', { count: 'exact', head: true })
      .eq('proprietario_id', ownerId)
      .eq('Analitica', 'Sim');

    query = applyFilters(query);

    const { count, error } = await query;

    if (error) {
      console.error('[setup-status] erro ao consultar plano_contas:', error);
      return false;
    }

    return (count ?? 0) > 0;
  };

const REQUIREMENTS: Record<SetupStepKey, RequirementChecker> = {
  plano_contas: tableCheck('plano_contas', 'proprietario_id'),
  historicos: tableCheck('historicos', 'proprietario_id'),
  
  // REMOVIDO: config_cp, config_cr, config_contratos (assumimos que map_default_configs cuida disso)
  config_cp: tableCheck('configuracao_contas_pagar', 'proprietario_id'),
  config_cr: tableCheck('configuracao_contas_receber', 'proprietario_id'),
  config_contratos: tableCheck('configuracao_contratos', 'proprietario_id'),
  
  // MARCAÇÕES ESSENCIAIS (Ainda necessárias)
  plano_contas_caixa: planoContaCheck((query) => query.eq('is_caixa', true)),
  plano_contas_banco: planoContaCheck((query) => query.eq('is_banco', true)),
  plano_contas_cliente: planoContaCheck((query) => query.eq('is_a_receber', true)),
  plano_contas_fornecedor: planoContaCheck((query) => query.eq('is_a_pagar', true)),
  plano_contas_capital_social: planoContaCheck((query) =>
    query
      .eq('is_conta_patrimonial', true)
      .or('Descricao.ilike.%capital%,Conta.ilike.3.1.00.0001'),
  ),
  plano_contas_receita: planoContaCheck((query) =>
    query
      .eq('is_conta_resultado', true)
      .or('Descricao.ilike.%receita%,Conta.ilike.4.%'),
  ),
  plano_contas_despesa: planoContaCheck((query) =>
    query
      .eq('is_conta_resultado', true)
      .or('Descricao.ilike.%despesa%,Descricao.ilike.%custo%,Conta.ilike.5.%,Conta.ilike.6.%'),
  ),
};

// Definindo os passos que são realmente obrigatórios para o fluxo de onboarding
const ONBOARDING_STEPS: SetupStepKey[] = [
    'plano_contas',
    'historicos',
    'plano_contas_caixa',
    'plano_contas_banco',
    'plano_contas_cliente',
    'plano_contas_fornecedor',
    'plano_contas_capital_social',
    'plano_contas_receita',
    'plano_contas_despesa',
    // Mantemos as configs CR/CP/Contratos no checklist, mas elas devem ser preenchidas
    // automaticamente pelo RPC map_default_configs (chamado no reset/onboarding).
    // Se o RPC falhar, elas aparecerão aqui.
    'config_cr',
    'config_cp',
    'config_contratos',
];

const checkFirstLaunchCompleted = async (ownerId: string): Promise<boolean> => {
  const { count, error } = await supabase
    .from('lancamentos')
    .select('id', { count: 'exact', head: true })
    .eq('proprietario_id', ownerId)
    .gt('valor', 0);

  if (error) {
    console.error('[setup-status] erro ao consultar lançamentos:', error);
    return false;
  }

  return (count ?? 0) > 0;
};

export const fetchSetupStatus = async (
  ownerId: string | null,
): Promise<SetupStatus> => {
  if (!ownerId) {
    return {
      isComplete: false,
      missingSteps: ONBOARDING_STEPS,
    };
  }

  const checks = await Promise.all(
    ONBOARDING_STEPS.map(async (step) => {
      const ok = await REQUIREMENTS[step](ownerId);
      return { step, ok };
    }),
  );

  const missingSteps = checks
    .filter((result) => !result.ok)
    .map((result) => result.step);
  const firstLaunchCompleted = await checkFirstLaunchCompleted(ownerId);

  return {
    isComplete: missingSteps.length === 0,
    missingSteps,
    firstLaunchCompleted,
    checkedAt: new Date().toISOString(),
  };
};