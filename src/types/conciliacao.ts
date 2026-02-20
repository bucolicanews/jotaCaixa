export interface MapeamentoConciliacao {
    data: string;
    descricao: string;
    valor: string;
    identificacao?: string;
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
    id?: string;
    data: string;
    descricao: string;
    valor: number;
    tipo: 'Entrada' | 'Saida';
    identificacao?: string;
    conciliada?: boolean;
    conta_contabil_id?: string | null;
    isDuplicated?: boolean;
    motivoDuplicidade?: string | null;
    // Novos campos para sugestão automática
    sugestao_parcela_id?: string | null;
    tem_sugestao?: boolean;
    nivel_confianca?: 'alta' | 'media' | 'baixa';
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

// Tipos para Matching de Parcelas
export interface ParcelaMatching {
    parcelaId: string;
    clienteNome: string;
    valor: number;
    dataVencimento: string;
    status: string;
    matchScore: number;
    tipoMatch: 'VALOR_EXATO_DATA_EXATA' | 'VALOR_EXATO' | 'DATA_EXATA' | 'APROXIMADO';
    tipo: 'CP' | 'CR';
    numeroParcela: number;
    descricao: string;
}

export interface ResultadoMatching {
    contasReceber: ParcelaMatching[];
    contasPagar: ParcelaMatching[];
    sugestoes: {
        matchExato: boolean;
        multiplasParcelasDetectadas: boolean;
    };
}

// Tipos para Validação de Mapeamento
export interface MapeamentoRequest {
    transacaoId: string;
    tipo: 'ENTRADA' | 'SAIDA';
    valorTransacao: number;
    parcelasSelecionadas: {
        parcelaId: string;
        tipo: 'CP' | 'CR';
        valorAplicar: number;
    }[];
}

export interface ResultadoValidacao {
    valido: boolean;
    erros: string[];
    avisos: string[];
    valorRestante: number;
    sugerirLancamentoAvulso: boolean;
}

// Tipos para Execução de Mapeamento
export interface ExecutarMapeamentoRequest {
    transacaoId: string;
    mapeamentos: {
        parcelaId: string;
        tipo: 'CP' | 'CR';
        valorAplicado: number;
    }[];
    valorRestante?: {
        valor: number;
        contaContabilId: string;
        descricao: string;
    };
    usuarioId: string;
}

export interface ResultadoExecucao {
    sucesso: boolean;
    transacaoConciliada: boolean;
    parcelasBaixadas: string[];
    lancamentoAvulsoId?: string;
    mensagem: string;
}