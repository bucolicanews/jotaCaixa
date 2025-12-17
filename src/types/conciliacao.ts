export interface MapeamentoConciliacao {
    data: string;
    descricao: string;
    valor: string;
    identificacao?: string; // NOVO CAMPO
}

export interface ConfiguracaoConciliacao {
    id: string;
    proprietario_id: string;
    id_saldo_contas: string;
    nome_configuracao: string;
    mapeamento: MapeamentoConciliacao;
    coluna_tipo_transacao?: string | null;
    valor_credito?: string | null;
    criado_em: string;
}

export interface TransacaoExtrato {
    data: string;
    descricao: string;
    valor: number;
    tipo: 'Entrada' | 'Saida';
    identificacao?: string; // NOVO CAMPO
    conciliada?: boolean;
    conta_contabil_id?: string | null;
    isDuplicated?: boolean; // NOVO: Indica se é duplicada
    motivoDuplicidade?: string | null; // NOVO: Motivo da duplicidade
}

export interface ConciliacaoRegra {
    id: string;
    proprietario_id: string;
    descricao_extrato: string;
    conta_contabil_id: string;
    tipo_lancamento: 'Entrada' | 'Saida';
}

export interface ConciliacaoHistorico {
    id: string;
    empresa_id: string;
    usuario_id: string;
    nome_arquivo: string;
    extrato_json: TransacaoExtrato[];
    criado_em: string;
    saldo_contas: { nome: string } | null;
}