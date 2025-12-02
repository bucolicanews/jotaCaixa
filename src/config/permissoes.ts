export interface Permissao {
  key: string;
  label: string;
  path: string;
}

export const PERMISSOES_DISPONIVEIS: Permissao[] = [
  { key: 'contas_pagar', label: 'Contas a Pagar', path: '/contas-pagar' },
  { key: 'contas_receber', label: 'Contas a Receber', path: '/contas-receber' },
  { key: 'bancos', label: 'Bancos / Caixas', path: '/bancos' },
  { key: 'plano_contas', label: 'Plano de Contas', path: '/plano-contas' },
  { key: 'conciliacao', label: 'Conciliação', path: '/conciliacao' },
  { key: 'importar', label: 'Importar Dados', path: '/importar' },
  { key: 'relatorios', label: 'Relatórios (Geral)', path: '/relatorios' },
  { key: 'configuracoes', label: 'Configurações', path: '/configuracoes' },
  { key: 'ponto_eletronico', label: 'Ponto Eletrônico (Bater Ponto)', path: '/ponto-eletronico' },
  { key: 'folha_ponto', label: 'Acompanhar Ponto (Gestor)', path: '/folha-ponto' },
  { key: 'visualizar_proprio_ponto', label: 'Usuário pode ver seu Ponto', path: '/perfil' },
  { key: 'cadastrar_usuarios', label: 'Cadastrar Usuários', path: '/gerenciar-usuarios' },
  { key: 'contratos', label: 'Contratos (Gerenciamento)', path: '/contratos' },
  { key: 'gestao_suporte', label: 'Gestão de Suporte (Atendimento)', path: '/admin/suporte' },
  
  // NOVAS PERMISSÕES DETALHADAS (Contabilidade/Financeiro)
  { key: 'lancamentos_manuais', label: 'Novo Lançamento (Partida Dobrada)', path: '/lancamentos' },
  { key: 'contas_patrimoniais', label: 'Contas Patrimoniais', path: '/contas-patrimoniais' },
  { key: 'balanco_patrimonial', label: 'Balanço Patrimonial', path: '/relatorios/balanco' },
  { key: 'dre', label: 'DRE', path: '/relatorios/dre' },
  { key: 'balancete', label: 'Balancete', path: '/relatorios/balancete' },
  { key: 'razao', label: 'Livro Razão', path: '/relatorios/razao' },
  { key: 'gerenciar_historicos', label: 'Gerenciar Históricos', path: '/historicos' },
  { key: 'documentos_societarios', label: 'Documentos Societários', path: '/documentos-societarios' },
];

/**
 * Permissões de acesso total para Admin Usuários (Funcionários do Admin).
 * Baseado nos requisitos do usuário.
 */
export const PERMISSOES_ADMIN_USUARIO_TOTAL: Record<string, boolean> = PERMISSOES_DISPONIVEIS.reduce((acc, p) => {
    // Exclui apenas a permissão de gerenciar planos (que é exclusiva do Admin)
    if (p.key !== 'planos') {
        acc[p.key] = true;
    }
    return acc;
}, {} as Record<string, boolean>);