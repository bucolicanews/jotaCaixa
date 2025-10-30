import { ContratoTag } from "@/types/contratos";

/**
 * Tags de Contrato Padrão que são preenchidas automaticamente pelo sistema.
 * Estas tags não precisam ser cadastradas manualmente pelo usuário.
 */
export const TAGS_PADRAO: ContratoTag[] = [
  // --- Dados da Empresa (Empresa Logada) ---
  {
    id: 'sys-empresa-nome',
    nome_tag: '{{EMPRESA_NOME}}',
    descricao: 'Nome/Razão Social da Empresa Contratante.',
    origem_dado: 'tbl_clientes.nome',
    criado_em: new Date().toISOString(),
  },
  {
    id: 'sys-empresa-email',
    nome_tag: '{{EMPRESA_EMAIL}}',
    descricao: 'Email da Empresa Contratante.',
    origem_dado: 'tbl_clientes.email',
    criado_em: new Date().toISOString(),
  },
  // Adicione mais tags da empresa conforme necessário (CNPJ, Endereço, etc.)

  // --- Dados do Cliente (Cliente Selecionado) ---
  {
    id: 'sys-cliente-nome',
    nome_tag: '{{CLIENTE_NOME}}',
    descricao: 'Nome/Razão Social do Cliente Contratado.',
    origem_dado: 'clientes.nome',
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
    id: 'sys-cliente-email',
    nome_tag: '{{CLIENTE_EMAIL}}',
    descricao: 'Email do Cliente Contratado.',
    origem_dado: 'clientes.email',
    criado_em: new Date().toISOString(),
  },

  // --- Dados Financeiros e de Vencimento ---
  {
    id: 'sys-valor-total',
    nome_tag: '{{VALOR_TOTAL_CONTRATO}}',
    descricao: 'Valor total do contrato (formatado em R$).',
    origem_dado: 'contas_receber.valor_total',
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