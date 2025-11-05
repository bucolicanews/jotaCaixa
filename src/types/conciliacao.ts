export interface MapeamentoConciliacao {
    data: string;
    descricao: string;
    valor: string;
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
    conciliada?: boolean; // Novo: Indica se já foi mapeada
    conta_contabil_id?: string | null; // Novo: ID da conta mapeada
}

export interface ConciliacaoRegra {
    id: string;
    proprietario_id: string;
    descricao_extrato: string;
    conta_contabil_id: string;
    tipo_lancamento: 'Entrada' | 'Saida';
}