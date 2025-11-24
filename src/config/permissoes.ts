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
  { key: 'importar', label: 'Importar', path: '/importar' },
  { key: 'relatorios', label: 'Relatórios', path: '/relatorios' },
  { key: 'configuracoes', label: 'Configurações', path: '/configuracoes' },
  { key: 'ponto_eletronico', label: 'Ponto Eletrônico (Bater Ponto)', path: '/ponto-eletronico' },
  { key: 'folha_ponto', label: 'Acompanhar Ponto (Gestor)', path: '/folha-ponto' },
  { key: 'visualizar_proprio_ponto', label: 'Usuário pode ver seu Ponto', path: '/perfil' },
  { key: 'cadastrar_usuarios', label: 'Cadastrar Usuários', path: '/gerenciar-usuarios' },
  { key: 'contratos', label: 'Contratos (Gerenciamento)', path: '/contratos' },
  { key: 'gestao_suporte', label: 'Gestão de Suporte (Atendimento)', path: '/admin/suporte' },
];