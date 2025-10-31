import { ContratoTag } from "@/types/contratos";

// Mapeamento de campos de perfil/cliente para tags de contrato
export const CAMPOS_CLIENTE_MAPA: { field: string, label: string, tag: string }[] = [
    { field: 'nome', label: 'Nome Fantasia / Pessoal', tag: '{{CLIENTE_NOME}}' },
    { field: 'razao_social', label: 'Razão Social', tag: '{{CLIENTE_RAZAO_SOCIAL}}' },
    { field: 'documento', label: 'Documento (CPF/CNPJ)', tag: '{{CLIENTE_DOCUMENTO}}' },
    { field: 'email', label: 'Email', tag: '{{CLIENTE_EMAIL}}' },
    { field: 'telefone', label: 'Telefone Principal', tag: '{{CLIENTE_TELEFONE}}' },
    { field: 'telefone_fixo', label: 'Telefone Fixo', tag: '{{CLIENTE_TELEFONE_FIXO}}' },
    { field: 'cep', label: 'CEP', tag: '{{CLIENTE_CEP}}' },
    { field: 'endereco', label: 'Logradouro/Rua', tag: '{{CLIENTE_ENDERECO}}' },
    { field: 'numero', label: 'Número', tag: '{{CLIENTE_NUMERO}}' },
    { field: 'complemento', label: 'Complemento', tag: '{{CLIENTE_COMPLEMENTO}}' },
    { field: 'bairro', label: 'Bairro', tag: '{{CLIENTE_BAIRRO}}' },
    { field: 'cidade', label: 'Cidade', tag: '{{CLIENTE_CIDADE}}' },
    { field: 'estado', label: 'Estado (UF)', tag: '{{CLIENTE_ESTADO}}' },
    // Adicionando mapeamentos para CPF e RG que estavam faltando
    { field: 'cpf', label: 'CPF/CNPJ', tag: '{{CLIENTE_CPF_CNPJ}}' },
    { field: 'rg', label: 'RG', tag: '{{CLIENTE_RG}}' },
];

export const CAMPOS_USUARIO_MAPA: { field: string, label: string, tag: string }[] = [
    { field: 'nome', label: 'Nome Completo', tag: '{{USUARIO_NOME}}' },
    { field: 'cpf', label: 'CPF', tag: '{{USUARIO_CPF}}' },
    { field: 'rg', label: 'RG', tag: '{{USUARIO_RG}}' },
    { field: 'nome_mae', label: 'Nome da Mãe', tag: '{{USUARIO_NOME_MAE}}' },
    { field: 'nome_pai', label: 'Nome do Pai', tag: '{{USUARIO_NOME_PAI}}' },
    { field: 'telefone', label: 'Telefone', tag: '{{USUARIO_TELEFONE}}' },
    { field: 'cep', label: 'CEP', tag: '{{USUARIO_CEP}}' },
    { field: 'endereco', label: 'Logradouro/Rua', tag: '{{USUARIO_ENDERECO}}' },
    { field: 'numero', label: 'Número', tag: '{{USUARIO_NUMERO}}' },
    { field: 'complemento', label: 'Complemento', tag: '{{USUARIO_COMPLEMENTO}}' },
    { field: 'bairro', label: 'Bairro', tag: '{{USUARIO_BAIRRO}}' },
    { field: 'cidade', label: 'Cidade', tag: '{{USUARIO_CIDADE}}' },
    { field: 'estado', label: 'Estado (UF)', tag: '{{USUARIO_ESTADO}}' },
];

// Tags obrigatórias de Contas a Receber (já são tags padrão, mas listamos aqui para referência)
export const TAGS_CONTAS_RECEBER_OBRIGATORIAS: ContratoTag[] = [
    { id: 'sys-valor-total', nome_tag: '{{VALOR_TOTAL_CONTRATO}}', descricao: 'Valor total do contrato (formatado em R$).', origem_dado: 'contas_receber.valor_total', criado_em: '' },
    { id: 'sys-valor-parcela', nome_tag: '{{VALOR_PARCELA}}', descricao: 'Valor de cada parcela (formatado em R$).', origem_dado: 'contas_receber.valor_parcela', criado_em: '' },
    { id: 'sys-numero-parcelas', nome_tag: '{{NUMERO_PARCELAS}}', descricao: 'Número total de parcelas/repetições.', origem_dado: 'contas_receber.numero_parcelas', criado_em: '' },
    { id: 'sys-primeiro-vencimento', nome_tag: '{{PRIMEIRO_VENCIMENTO}}', descricao: 'Data do primeiro vencimento (formatada).', origem_dado: 'contas_receber.data_vencimento', criado_em: '' },
    { id: 'sys-data-emissao', nome_tag: '{{DATA_EMISSAO}}', descricao: 'Data de emissão do contrato (hoje).', origem_dado: 'contas_receber.data_emissao', criado_em: '' },
];