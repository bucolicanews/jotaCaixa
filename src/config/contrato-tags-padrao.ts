import { ContratoTag } from "@/types/contratos";

export interface TagPadrao extends Omit<ContratoTag, 'id' | 'criado_em' | 'empresa_id'> {
    categoria: 'Contratante' | 'Contratado' | 'Financeiro' | 'Avulsa';
    origem_dado: string; // Ex: tbl_clientes.nome, clientes.nome, manual
}

export const TAGS_PADRAO: TagPadrao[] = [
    // --- DADOS DO CONTRATANTE (EMPRESA LOGADA) ---
    { nome_tag: '{{contratante_nome}}', descricao: 'Nome/Razão Social da Empresa Contratante', origem_dado: 'tbl_clientes.nome', categoria: 'Contratante' },
    { nome_tag: '{{contratante_documento}}', descricao: 'CNPJ/CPF da Empresa Contratante', origem_dado: 'tbl_clientes.documento', categoria: 'Contratante' },
    { nome_tag: '{{contratante_endereco}}', descricao: 'Endereço completo da Empresa Contratante', origem_dado: 'tbl_clientes.endereco', categoria: 'Contratante' },
    
    // --- DADOS DO CONTRATADO (CLIENTE) ---
    { nome_tag: '{{contratado_nome}}', descricao: 'Nome/Razão Social do Cliente Contratado', origem_dado: 'clientes.nome', categoria: 'Contratado' },
    { nome_tag: '{{contratado_documento}}', descricao: 'CNPJ/CPF do Cliente Contratado', origem_dado: 'clientes.documento', categoria: 'Contratado' },
    { nome_tag: '{{contratado_email}}', descricao: 'Email do Cliente Contratado', origem_dado: 'clientes.email', categoria: 'Contratado' },
    
    // --- DADOS FINANCEIROS / CONTRATO ---
    { nome_tag: '{{valor_total}}', descricao: 'Valor total do contrato', origem_dado: 'manual', categoria: 'Financeiro' },
    { nome_tag: '{{numero_parcelas}}', descricao: 'Número total de parcelas', origem_dado: 'manual', categoria: 'Financeiro' },
    { nome_tag: '{{valor_parcela}}', descricao: 'Valor de cada parcela', origem_dado: 'calculado', categoria: 'Financeiro' },
    { nome_tag: '{{data_inicio}}', descricao: 'Data de início do contrato', origem_dado: 'manual', categoria: 'Financeiro' },
    { nome_tag: '{{dia_vencimento}}', descricao: 'Dia fixo de vencimento das parcelas', origem_dado: 'manual', categoria: 'Financeiro' },
    
    // --- DADOS AVULSOS ---
    { nome_tag: '{{data_atual}}', descricao: 'Data de emissão do contrato', origem_dado: 'sistema', categoria: 'Avulsa' },
];