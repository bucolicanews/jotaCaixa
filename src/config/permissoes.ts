export interface Permissao {
  key: string;
  label: string;
  path: string;
  grupo: 'financeiro' | 'contabilidade' | 'folha' | 'rh' | 'geral' | 'emissao_nf';
}

export interface GrupoPermissao {
  key: string;
  label: string;
  permissoes: Permissao[];
}

export const PERMISSOES_DISPONIVEIS: Permissao[] = [
  // FINANCEIRO
  { key: 'contratos', label: 'Contratos', path: '/contratos', grupo: 'financeiro' },
  { key: 'contas_pagar', label: 'Contas a Pagar', path: '/contas-pagar', grupo: 'financeiro' },
  { key: 'contas_receber', label: 'Contas a Receber', path: '/contas-receber', grupo: 'financeiro' },
  { key: 'emissao_nf', label: 'Emissão NF', path: '/emissao-notas', grupo: 'emissao_nf' }, // NOVO
  { key: 'bancos', label: 'Fluxo de Caixa / Bancos', path: '/bancos', grupo: 'financeiro' },
  { key: 'conciliacao', label: 'Conciliacao', path: '/conciliacao', grupo: 'financeiro' },
  { key: 'extratos', label: 'Extratos', path: '/extratos', grupo: 'financeiro' },
  
  // CONTABILIDADE
  { key: 'lancamentos', label: 'Novo Lancamento', path: '/lancamentos', grupo: 'contabilidade' },
  { key: 'balanco', label: 'Balanco Patrimonial', path: '/relatorios/balanco', grupo: 'contabilidade' },
  { key: 'contas_patrimoniais', label: 'Contas Patrimoniais', path: '/contas-patrimoniais', grupo: 'contabilidade' },
  { key: 'dre', label: 'DRE', path: '/relatorios/dre', grupo: 'contabilidade' },
  { key: 'balancete', label: 'Balancete', path: '/relatorios/balancete', grupo: 'contabilidade' },
  { key: 'razao', label: 'Razao', path: '/relatorios/razao', grupo: 'contabilidade' },
  { key: 'historicos', label: 'Gerenciar Historicos', path: '/historicos', grupo: 'contabilidade' },
  { key: 'plano_contas', label: 'Plano de Contas', path: '/plano-contas', grupo: 'contabilidade' },
  { key: 'configuracoes', label: 'Configuracoes', path: '/configuracoes', grupo: 'contabilidade' },
  { key: 'exportar', label: 'Exportar Dados', path: '/exportar', grupo: 'contabilidade' },
  { key: 'importar', label: 'Importar Dados', path: '/importar', grupo: 'contabilidade' },
  { key: 'relatorios', label: 'Relatorios', path: '/relatorios', grupo: 'contabilidade' },
  
  // FOLHA (Funcionario)
  { key: 'ponto_eletronico', label: 'Meu Ponto (Bater Ponto)', path: '/ponto-eletronico', grupo: 'folha' },
  { key: 'visualizar_proprio_ponto', label: 'Acompanhar Meu Ponto', path: '/folha-ponto?mode=self', grupo: 'folha' },
  
  // RH (Gestor)
  { key: 'cadastrar_usuarios', label: 'Cadastrar Usuarios', path: '/gerenciar-usuarios', grupo: 'rh' },
  { key: 'folha_ponto', label: 'Acompanhar Ponto (Gestor)', path: '/folha-ponto', grupo: 'rh' },
  
  // GERAL
  { key: 'documentos_societarios', label: 'Documentos Societarios', path: '/documentos-societarios', grupo: 'geral' },
  { key: 'protocolos', label: 'Protocolos', path: '/protocolos', grupo: 'geral' },
  { key: 'gestao_suporte', label: 'Gestao de Suporte', path: '/admin/suporte', grupo: 'geral' },
  { key: 'gerenciar_clientes', label: 'Gerenciar Clientes', path: '/clientes', grupo: 'geral' },
];

export const GRUPOS_PERMISSOES: GrupoPermissao[] = [
  {
    key: 'financeiro',
    label: 'Financeiro',
    permissoes: PERMISSOES_DISPONIVEIS.filter(p => p.grupo === 'financeiro'),
  },
  {
    key: 'emissao_nf',
    label: 'Emissão NF',
    permissoes: PERMISSOES_DISPONIVEIS.filter(p => p.grupo === 'emissao_nf'),
  },
  {
    key: 'contabilidade',
    label: 'Contabilidade',
    permissoes: PERMISSOES_DISPONIVEIS.filter(p => p.grupo === 'contabilidade'),
  },
  {
    key: 'folha',
    label: 'Folha (Funcionario)',
    permissoes: PERMISSOES_DISPONIVEIS.filter(p => p.grupo === 'folha'),
  },
  {
    key: 'rh',
    label: 'RH (Gestor)',
    permissoes: PERMISSOES_DISPONIVEIS.filter(p => p.grupo === 'rh'),
  },
  {
    key: 'geral',
    label: 'Geral',
    permissoes: PERMISSOES_DISPONIVEIS.filter(p => p.grupo === 'geral'),
  },
];