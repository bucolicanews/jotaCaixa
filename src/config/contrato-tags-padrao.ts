import { ContratoTag } from "@/types/contratos";

// Tags de sistema que são preenchidas automaticamente (Empresa e Cliente)
export const TAGS_SISTEMA: ContratoTag[] = [
  // --- Dados da Empresa (Empresa Logada) ---
  {
    id: 'sys-empresa-nome',
    nome_tag: '{{EMPRESA_NOME}}',
    descricao: 'Nome/Razão Social da Empresa Contratante.',
    origem_dado: 'tbl_clientes.nome',
    criado_em: new Date().toISOString(),
  },
  {
    id: 'sys-empresa-documento',
    nome_tag: '{{EMPRESA_DOCUMENTO}}',
    descricao: 'CNPJ da Empresa Contratante.',
    origem_dado: 'tbl_clientes.documento',
    criado_em: new Date().toISOString(),
  },
  {
    id: 'sys-empresa-endereco',
    nome_tag: '{{EMPRESA_ENDERECO}}',
    descricao: 'Endereço completo da Empresa Contratante.',
    origem_dado: 'tbl_clientes.endereco_completo',
    criado_em: new Date().toISOString(),
  },
  {
    id: 'sys-empresa-email',
    nome_tag: '{{EMPRESA_EMAIL}}',
    descricao: 'Email da Empresa Contratante.',
    origem_dado: 'tbl_clientes.email',
    criado_em: new Date().toISOString(),
  },

  // --- Dados do Cliente (Cliente Selecionado) ---
  {
    id: 'sys-cliente-nome',
    nome_tag: '{{CLIENTE_NOME}}',
    descricao: 'Nome Fantasia / Nome Pessoal do Cliente Contratado.',
    origem_dado: 'clientes.nome',
    criado_em: new Date().toISOString(),
  },
  {
    id: 'sys-cliente-razao-social',
    nome_tag: '{{CLIENTE_RAZAO_SOCIAL}}',
    descricao: 'Razão Social do Cliente Contratado.',
    origem_dado: 'clientes.razao_social',
    criado_em: new Date().toISOString(),
  },
  {
    id: 'sys-cliente-documento',
    nome_tag: '{{CLIENTE_DOCUMENTO}}',
    descricao: 'CPF ou CNPJ do Cliente Contratado.',
    origem_dado: 'clientes.documento',
    criado_em: new Date().toISOString(),
  },
  {
    id: 'sys-cliente-endereco',
    nome_tag: '{{CLIENTE_ENDERECO}}',
    descricao: 'Logradouro e Número do Cliente Contratado.',
    origem_dado: 'clientes.endereco',
    criado_em: new Date().toISOString(),
  },
  {
    id: 'sys-cliente-bairro',
    nome_tag: '{{CLIENTE_BAIRRO}}',
    descricao: 'Bairro do Cliente Contratado.',
    origem_dado: 'clientes.bairro',
    criado_em: new Date().toISOString(),
  },
  {
    id: 'sys-cliente-cidade',
    nome_tag: '{{CLIENTE_CIDADE}}',
    descricao: 'Cidade do Cliente Contratado.',
    origem_dado: 'clientes.cidade',
    criado_em: new Date().toISOString(),
  },
  {
    id: 'sys-cliente-estado',
    nome_tag: '{{CLIENTE_ESTADO}}',
    descricao: 'Estado (UF) do Cliente Contratado.',
    origem_dado: 'clientes.estado',
    criado_em: new Date().toISOString(),
  },
  {
    id: 'sys-cliente-email',
    nome_tag: '{{CLIENTE_EMAIL}}',
    descricao: 'Email do Cliente Contratado.',
    origem_dado: 'clientes.email',
    criado_em: new Date().toISOString(),
  },
];

/**
 * Tags Financeiras Obrigatórias (Contas a Receber)
 */
export const TAGS_FINANCEIRAS_OBRIGATORIAS: ContratoTag[] = [
  {
    id: 'sys-valor-total',
    nome_tag: '{{VALOR_TOTAL_CONTRATO}}',
    descricao: 'Valor total do contrato (formatado em R$).',
    origem_dado: 'contas_receber.valor_total',
    criado_em: new Date().toISOString(),
  },
  {
    id: 'sys-valor-parcela',
    nome_tag: '{{VALOR_PARCELA}}',
    descricao: 'Valor de cada parcela (formatado em R$).',
    origem_dado: 'contas_receber.valor_parcela',
    criado_em: new Date().toISOString(),
  },
  {
    id: 'sys-numero-parcelas',
    nome_tag: '{{NUMERO_PARCELAS}}',
    descricao: 'Número total de parcelas/repetições.',
    origem_dado: 'contas_receber.numero_parcelas',
    criado_em: new Date().toISOString(),
  },
  {
    id: 'sys-primeiro-vencimento',
    nome_tag: '{{PRIMEIRO_VENCIMENTO}}',
    descricao: 'Data do primeiro vencimento (formatada).',
    origem_dado: 'contas_receber.data_vencimento',
    criado_em: new Date().toISOString(),
  },
  {
    id: 'sys-data-emissao',
    nome_tag: '{{DATA_EMISSAO}}',
    descricao: 'Data de emissão do contrato (hoje).',
    origem_dado: 'contas_receber.data_emissao',
    criado_em: new Date().toISOString(),
  },
];

// TAGS_PADRAO agora é a combinação de todas as tags de sistema e financeiras
export const TAGS_PADRAO: ContratoTag[] = [...TAGS_SISTEMA, ...TAGS_FINANCEIRAS_OBRIGATORIAS];