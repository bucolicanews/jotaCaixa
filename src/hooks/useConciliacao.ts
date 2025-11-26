import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSessao } from './use-sessao';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { SaldoContaDetalhada } from '@/types/saldo-conta';
import { ConfiguracaoConciliacao, TransacaoExtrato, ConciliacaoRegra, ConciliacaoHistorico } from '@/types/conciliacao';
import { PlanoContas } from '@/types/plano-contas';
import Papa, { ParseResult } from 'papaparse';
import { format, parseISO, parse, isValid, endOfDay } from 'date-fns';
import { formatDDMMYYYYToISO, normalizeString, calculateContentHash } from '@/utils/formatters';
import useSaldoContaCalculado from './use-saldo-conta-calculado';

interface ConciliacaoHook {
    // State
    loading: boolean;
    isSaving: boolean;
    isDeletingHistorico: boolean;
    activeTab: string;
    contas: SaldoContaDetalhada[];
    configs: ConfiguracaoConciliacao[];
    contasContabeis: PlanoContas[];
    historico: ConciliacaoHistorico[];
    contaSelecionadaId: string | null;
    configSelecionada: ConfiguracaoConciliacao | null;
    file: File | null;
    transacoes: TransacaoExtrato[];
    transacoesRejeitadas: TransacaoExtrato[]; // NOVO ESTADO
    transacoesSelecionadas: number[];
    contaContabilLote: string | null;
    historicoSelecionado: ConciliacaoHistorico | null;
    historicoDetalhesOpen: boolean;
    proprietarioDaConfiguracao: string | undefined | null;
    fileHash: string | null; // ADICIONADO

    // Handlers
    setActiveTab: (tab: string) => void;
    handleReset: (keepAccountId?: boolean) => void;
    handleSelectAccount: (id: string) => void;
    handleSelectConfig: (id: string) => void;
    handleFileChange: (file: File | null) => void;
    handleParseFile: () => Promise<void>;
    handleContaContabilChange: (index: number, contaContabilId: string) => void;
    handleToggleSelection: (index: number, checked: boolean) => void;
    handleSelectAll: (checked: boolean) => void;
    handleContaContabilLoteChange: (id: string) => void;
    handleApplyLote: () => void;
    handleSaveConciliacao: () => Promise<void>;
    handleDeleteHistorico: () => Promise<void>;
    handleViewHistoricoDetails: (h: ConciliacaoHistorico) => void;
    setHistoricoDetalhesOpen: (open: boolean) => void;
    fetchConfigs: () => Promise<void>;
}

export function useConciliacao(): ConciliacaoHook {
    const { usuario } = useSessao();
    
    // --- Estados ---
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeletingHistorico, setIsDeletingHistorico] = useState(false);
    const [activeTab, setActiveTab] = useState('conciliacao');
    
    // Hook para buscar saldos de contas (Ativo/Passivo) - AGORA FILTRA APENAS BANCOS
    const { contas: contasCalculadas, carregando: loadingContas } = useSaldoContaCalculado(
        'todos', 
        'todos', 
        '', 
        'bancos',
        true // NOVO: Filtra apenas contas marcadas como Banco
    );
    
    const [configs, setConfigs] = useState<ConfiguracaoConciliacao[]>([]);
    const [contasContabeis, setContasContabeis] = useState<PlanoContas[]>([]);
    const [historico, setHistorico] = useState<ConciliacaoHistorico[]>([]);
    
    const [contaSelecionadaId, setContaSelecionadaId] = useState<string | null>(null);
    const [configSelecionada, setConfigSelecionada] = useState<ConfiguracaoConciliacao | null>(null);
    const [file, setFile] = useState<File | null>(null);
    const [transacoes, setTransacoes] = useState<TransacaoExtrato[]>([]);
    const [transacoesRejeitadas, setTransacoesRejeitadas] = useState<TransacaoExtrato[]>([]); // NOVO ESTADO
    const [regras, setRegras] = useState<ConciliacaoRegra[]>([]);
    
    const [transacoesSelecionadas, setTransacoesSelecionadas] = useState<number[]>([]);
    const [contaContabilLote, setContaContabilLote] = useState<string | null>(null);
    
    const [historicoDetalhesOpen, setHistoricoDetalhesOpen] = useState(false);
    const [historicoSelecionado, setHistoricoSelecionado] = useState<ConciliacaoHistorico | null>(null);
    const [fileHash, setFileHash] = useState<string | null>(null); // ADICIONADO

    const contaSelecionada = useMemo(() => contasCalculadas.find(c => c.id === contaSelecionadaId), [contasCalculadas, contaSelecionadaId]);
    const proprietarioDaConfiguracao = contaSelecionada?.proprietario_id || usuario?.id; // Usando usuario.id como fallback

    // --- Funções de Busca de Dados ---

    const fetchContas = useCallback(async () => {
        // A busca de contas agora é feita pelo useSaldoContaCalculado
        setLoading(loadingContas);
    }, [loadingContas]);

    const fetchConfigs = useCallback(async () => {
        if (!contaSelecionadaId) return;
        const { data, error } = await supabase.from('configuracao_conciliacao').select('*').eq('id_saldo_contas', contaSelecionadaId);
        if (error) showError('Erro ao carregar configurações: ' + error.message);
        else setConfigs(data as ConfiguracaoConciliacao[]);
    }, [contaSelecionadaId]);
    
    const fetchContasContabeis = useCallback(async () => {
        if (!proprietarioDaConfiguracao || !contaSelecionada) return;
        
        const { data, error } = await supabase
            .from('plano_contas')
            .select('id, Conta, Descricao, Analitica, is_conta_caixa_banco, is_conta_patrimonial, is_conta_resultado')
            .eq('proprietario_id', proprietarioDaConfiguracao)
            .eq('Analitica', 'Sim')
            .eq('is_conta_resultado', true)
            .order('Conta', { ascending: true });
            
        if (error) {
            showError('Erro ao carregar Plano de Contas: ' + error.message);
            setContasContabeis([]);
        } else {
            const filteredContas = (data as PlanoContas[]).filter(c => 
                c.id !== contaSelecionada.plano_contas?.id // Filtra a conta de Ativo/Caixa
            );
            setContasContabeis(filteredContas);
        }
    }, [proprietarioDaConfiguracao, contaSelecionada]);
    
    const fetchRegras = useCallback(async () => {
        if (!proprietarioDaConfiguracao) return;
        const { data, error } = await supabase
            .from('conciliacao_regras')
            .select('*')
            .eq('proprietario_id', proprietarioDaConfiguracao);
        if (error) console.error('Erro ao carregar regras de conciliação:', error);
        else setRegras(data as ConciliacaoRegra[]);
    }, [proprietarioDaConfiguracao]);
    
    const fetchHistorico = useCallback(async () => {
        if (!usuario?.id) return;
        
        const { data, error } = await supabase
            .from('conciliacoes')
            .select(`
                *,
                saldo_contas:id_saldo_contas ( nome )
            `)
            .eq('empresa_id', usuario.id)
            .order('criado_em', { ascending: false });
            
        if (error) {
            showError('Erro ao carregar histórico de conciliações: ' + error.message);
            setHistorico([]);
        } else {
            setHistorico(data as ConciliacaoHistorico[]);
        }
    }, [usuario]);

    // --- Efeitos ---
    useEffect(() => {
        fetchContas();
        fetchHistorico();
    }, [fetchContas, fetchHistorico]);
    
    useEffect(() => {
        if (contaSelecionadaId) {
            fetchContasContabeis();
            fetchRegras();
        }
    }, [contaSelecionadaId, fetchContasContabeis, fetchRegras]);

    useEffect(() => {
        // Este efeito é importante para resetar configs quando a conta muda
        fetchConfigs();
        setConfigSelecionada(null);
    }, [contaSelecionadaId, fetchConfigs]);

    // --- Lógica de Mapeamento e Processamento ---

    const applyRegras = useCallback((rawTransacoes: TransacaoExtrato[]): TransacaoExtrato[] => {
        return rawTransacoes.map(t => {
            if (t.isDuplicated) return t;
            
            const regra = regras.find(r => 
                normalizeString(String(t.descricao)).includes(r.descricao_extrato.toLowerCase()) && r.tipo_lancamento === t.tipo
            );
            
            if (regra) {
                return { ...t, conciliada: true, conta_contabil_id: regra.conta_contabil_id };
            }
            return { ...t, conciliada: false, conta_contabil_id: null };
        });
    }, [regras]);

    // --- Handlers de Estado ---

    const handleReset = useCallback((keepAccountId: boolean = false) => {
        if (!keepAccountId) {
            setContaSelecionadaId(null);
        }
        setConfigSelecionada(null);
        setTransacoes([]);
        setTransacoesRejeitadas([]); // NOVO RESET
        setTransacoesSelecionadas([]);
        setContaContabilLote(null);
        setFile(null);
        setFileHash(null); // NOVO RESET
        setActiveTab('conciliacao');
    }, []);

    const handleSelectAccount = useCallback((id: string) => {
        setContaSelecionadaId(id);
        handleReset(true); // Mantém o ID da conta, mas limpa o resto
        fetchConfigs(); // Garante que as configs sejam carregadas
    }, [handleReset, fetchConfigs]);

    const handleSelectConfig = useCallback((id: string) => {
        setConfigSelecionada(configs.find(c => c.id === id) || null);
        setTransacoes([]);
        setTransacoesRejeitadas([]); // NOVO RESET
        setFile(null);
        setFileHash(null); // Limpa o hash ao mudar a config
    }, [configs]);

    const handleFileChange = useCallback((newFile: File | null) => {
        setFile(newFile);
        setTransacoes([]);
        setTransacoesRejeitadas([]); // NOVO RESET
        setFileHash(null); // Limpa o hash ao mudar o arquivo
    }, []);
    
    const handleContaContabilChange = useCallback((index: number, contaContabilId: string) => {
        setTransacoes(prev => prev.map((t, i) => 
            i === index ? { ...t, conta_contabil_id: contaContabilId, conciliada: true } : t
        ));
    }, []);
    
    const handleToggleSelection = useCallback((index: number, checked: boolean) => {
        setTransacoesSelecionadas(prev => {
            if (checked) {
                return [...prev, index];
            } else {
                return prev.filter(i => i !== index);
            }
        });
    }, []);
    
    const handleSelectAll = useCallback((checked: boolean) => {
        const validIndexes = transacoes
            .map((t, i) => ({ t, i }))
            .filter(({ t }) => !t.isDuplicated)
            .map(({ i }) => i);
            
        if (checked) {
            setTransacoesSelecionadas(validIndexes);
        } else {
            setTransacoesSelecionadas([]);
        }
    }, [transacoes]);
    
    const handleContaContabilLoteChange = useCallback((id: string) => {
        setContaContabilLote(id);
    }, []);
    
    const handleApplyLote = useCallback(() => {
        if (!contaContabilLote || transacoesSelecionadas.length === 0) {
            showError('Selecione uma conta contábil e pelo menos uma transação.');
            return;
        }
        
        setTransacoes(prev => prev.map((t, i) => {
            if (transacoesSelecionadas.includes(i)) {
                return { ...t, conta_contabil_id: contaContabilLote, conciliada: true };
            }
            return t;
        }));
        
        setTransacoesSelecionadas([]);
        setContaContabilLote(null);
        showSuccess(`${transacoesSelecionadas.length} transações mapeadas em lote.`);
    }, [contaContabilLote, transacoesSelecionadas]);
    
    const handleViewHistoricoDetails = useCallback((h: ConciliacaoHistorico) => {
        setHistoricoSelecionado(h);
        setHistoricoDetalhesOpen(true);
    }, []);
    
    const handleSetHistoricoDetalhesOpen = useCallback((open: boolean) => {
        setHistoricoDetalhesOpen(open);
        if (!open) setHistoricoSelecionado(null);
    }, []);
    
    const handleDeleteHistorico = useCallback(async () => {
        if (!usuario?.id) return;
        setIsDeletingHistorico(true);
        
        try {
            // Deleta todos os registros de histórico para o usuário logado
            const { error } = await supabase
                .from('conciliacoes')
                .delete()
                .eq('empresa_id', usuario.id);
                
            if (error) throw error;
            
            showSuccess('Histórico de conciliações limpo com sucesso.');
            fetchHistorico();
        } catch (error: any) {
            showError('Falha ao limpar histórico: ' + error.message);
        } finally {
            setIsDeletingHistorico(false);
        }
    }, [usuario, fetchHistorico]);


    // --- Lógica de Processamento de Arquivo ---

    // NOVO: Função para buscar extratos existentes na nova tabela (para duplicidade de transação)
    const fetchExistingExtratos = useCallback(async (contaId: string, empresaId: string) => {
        
        const existingKeys = new Set<string>();
        
        const { data, error } = await supabase
            .from('extratos')
            .select('data, descricao, valor, tipo')
            .eq('empresa_id', empresaId)
            .eq('id_saldo_contas', contaId);
            
        if (error) {
            console.error('Erro ao buscar extratos existentes:', error);
            return existingKeys;
        }
        
        // Cria um Set de chaves únicas (Data YYYY-MM-DD | Descrição Normalizada | Valor (2 casas) | Tipo)
        (data || []).forEach(e => {
            const formattedDate = formatDDMMYYYYToISO(e.data);
            const normalizedDesc = normalizeString(e.descricao);
            const uniqueKey = `${formattedDate}|${normalizedDesc}|${Number(e.valor).toFixed(2)}|${e.tipo}`;
            existingKeys.add(uniqueKey);
        });
        
        return existingKeys;
    }, []);


    const handleParseFile = useCallback(async () => {
        if (!file || !configSelecionada || !contaSelecionadaId || !proprietarioDaConfiguracao) {
            showError('Selecione a conta, a configuração e o arquivo.');
            return;
        }
        const config = configSelecionada;
        
        // helper local para formatar datas com vários fallbacks
        const safeFormatDate = (dateStr: string | undefined | null): string | null => {
            if (!dateStr && dateStr !== '') return null;
            // 1) tentativa padrão (utilitário que você já tem)
            const candidate1 = formatDDMMYYYYToISO(dateStr as string);
            if (candidate1) return candidate1;
            // 2) parse ISO direto
            try {
                const parsedIso = parseISO(dateStr as string);
                if (isValid(parsedIso)) return format(parsedIso, 'yyyy-MM-dd');
            } catch (e) {}
            // 3) parse dd/MM/yyyy
            try {
                const parsedBR = parse(dateStr as string, 'dd/MM/yyyy', new Date());
                if (isValid(parsedBR)) return format(parsedBR, 'yyyy-MM-dd');
            } catch (e) {}
            // 4) fallback para tentativa livre: aceitar strings já no formato yyyy-MM-dd
            try {
                const parsedLoose = parse(dateStr as string, 'yyyy-MM-dd', new Date());
                if (isValid(parsedLoose)) return format(parsedLoose, 'yyyy-MM-dd');
            } catch (e) {}
            // nada válido
            return null;
        };

        setLoading(true);
        
        try {
            // 1. Ler o conteúdo do arquivo para calcular o hash
            const fileContent = await file.text();
            const contentHash = calculateContentHash(fileContent);
            
            if (!contentHash) {
                showError('O arquivo está vazio ou não contém dados válidos.');
                setLoading(false);
                return;
            }
            
            // NOVO CHECK: Verificar se o hash do arquivo já foi importado
            const { count: hashCount, error: hashError } = await supabase
                .from('conciliacoes')
                .select('id', { count: 'exact', head: true })
                .eq('empresa_id', proprietarioDaConfiguracao)
                .eq('extrato_hash', contentHash);
                
            if (hashError) {
                setLoading(false);
                throw hashError;
            }
            
            if ((hashCount || 0) > 0) {
                showError('Este arquivo já foi importado anteriormente (Bloqueio por Hash).');
                setLoading(false);
                return;
            }
            
            setFileHash(contentHash); // SALVA O HASH AQUI

            // 2. Buscar chaves de transação existentes (para duplicidade)
            const existingExtratosSet = await fetchExistingExtratos(contaSelecionadaId, proprietarioDaConfiguracao);
            
            // 3. Processar o CSV
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                dynamicTyping: true,
                complete: (results: ParseResult<any>) => {
                    try {
                        const rawTransacoes: TransacaoExtrato[] = results.data.map((row: any) => {
                            // valor vindo do CSV *sempre* tratado como texto primeiro e convertido
                            const rawValorStr = String(row[config.mapeamento.valor] ?? '0').replace(/\s+/g, '').replace(',', '.');
                            const parsedValor = Number(parseFloat(rawValorStr || '0'));
                            let valor = isNaN(parsedValor) ? 0 : parsedValor;
                            
                            // Lógica para determinar o sinal do valor (mantemos valor numérico real)
                            if (config.coluna_tipo_transacao && row[config.coluna_tipo_transacao] !== config.valor_credito) {
                                valor = -Math.abs(valor);
                            }
                            
                            const identificacao = config.mapeamento.identificacao 
                                ? String(row[config.mapeamento.identificacao] || '') 
                                : undefined;
                                
                            const tipo = (valor >= 0 ? 'Entrada' : 'Saida') as 'Entrada' | 'Saida';
                            const dataMovimentacaoRaw = row[config.mapeamento.data];
                            
                            let formattedDate: string | null = safeFormatDate(dataMovimentacaoRaw);
                            if (!formattedDate) {
                                // Garantir que haja algum valor (manter a original se não formatável)
                                console.error('Falha ao formatar data do CSV:', dataMovimentacaoRaw);
                                formattedDate = String(dataMovimentacaoRaw || '');
                            }
                            
                            const descricaoRaw = row[config.mapeamento.descricao] ?? '';
                            const normalizedDesc = normalizeString(String(descricaoRaw));
                            
                            // Chave de comparação para a transação atual (usando a data formatada YYYY-MM-DD e valor com sinal, 2 casas)
                            const uniqueKey = `${formattedDate}|${normalizedDesc}|${Number(valor).toFixed(2)}|${tipo}`;
                            
                            let isDuplicated = false;
                            let motivoDuplicidade: string | null = null;
                            
                            // Verifica duplicidade de transação (CHAVE ÚNICA)
                            if (existingExtratosSet.has(uniqueKey)) {
                                isDuplicated = true;
                                motivoDuplicidade = 'Transação já existe na tabela de extratos.';
                            }
                            
                            return {
                                data: dataMovimentacaoRaw,
                                descricao: String(descricaoRaw),
                                valor: valor,
                                tipo: tipo,
                                identificacao: identificacao,
                                isDuplicated: isDuplicated,
                                motivoDuplicidade: motivoDuplicidade,
                            } as TransacaoExtrato;
                        }).filter(t => t.data && t.descricao);
                        
                        const transacoesValidas = rawTransacoes.filter(t => !t.isDuplicated);
                        const transacoesRejeitadasLocal = rawTransacoes.filter(t => t.isDuplicated);
                        
                        // Normaliza descrição ANTES de aplicar regras (evita falso negativo)
                        const transacoesValidasNormalizadas = transacoesValidas.map(t => ({
                            ...t,
                            descricao: t.descricao,
                        }));
                        
                        const transacoesMapeadas = applyRegras(transacoesValidasNormalizadas);
                        
                        setTransacoes(transacoesMapeadas); // APENAS AS VÁLIDAS E MAPEADAS
                        setTransacoesRejeitadas(transacoesRejeitadasLocal); // APENAS AS REJEITADAS
                        setTransacoesSelecionadas([]);
                        setContaContabilLote(null);
                        
                        let successMessage = `${transacoesValidas.length} transações válidas importadas.`;
                        
                        if (transacoesRejeitadasLocal.length > 0) {
                            successMessage += ` ${transacoesRejeitadasLocal.length} rejeitadas (Duplicidade de transação).`;
                        }
                        
                        showSuccess(successMessage);
                    } catch (innerErr: any) {
                        console.error('Erro ao processar resultado do CSV:', innerErr);
                        showError('Erro ao processar o arquivo CSV: ' + (innerErr?.message || String(innerErr)));
                    } finally {
                        setLoading(false);
                    }
                },
                error: (err) => {
                    console.error('Papa.parse error:', err);
                    setLoading(false);
                    showError('Erro ao processar o arquivo CSV: ' + err.message);
                }
            });
        } catch (err: any) {
            console.error('Erro em handleParseFile:', err);
            setLoading(false);
            showError('Erro ao processar o arquivo: ' + (err?.message || String(err)));
        }
    }, [file, configSelecionada, contaSelecionadaId, proprietarioDaConfiguracao, applyRegras, fetchExistingExtratos]);

    // --- Lógica de Salvamento ---

    const handleSaveConciliacao = useCallback(async () => {
        if (!contaSelecionadaId || !proprietarioDaConfiguracao || !file || !fileHash) { // USANDO fileHash
            showError('Conta bancária, proprietário, arquivo ou hash não definidos.');
            return;
        }
        
        // 1. Buscar a conta contábil do saldo_contas (Ativo/Caixa)
        const contaAtivoCaixaId = contaSelecionada?.plano_contas?.id;
        
        if (!contaAtivoCaixaId) {
            showError('A conta bancária selecionada não está vinculada a um Plano de Contas (Ativo).');
            return;
        }
        
        const transacoesParaSalvar = transacoes.filter(t => t.conta_contabil_id && !t.isDuplicated);
        
        if (transacoesParaSalvar.length === 0) {
            showError('Nenhuma transação mapeada para salvar.');
            return;
        }
        
        setIsSaving(true);
        
        try {
            // Prepara o payload para a tabela 'lancamentos'
            const lancamentosPayload = transacoesParaSalvar.flatMap(t => {
                const formattedDate = (() => {
                    const candidate = formatDDMMYYYYToISO(t.data);
                    return candidate || String(t.data);
                })();
                const valor = Math.abs(Number(t.valor));
                
                // Transação 1: Movimentação de Caixa/Banco (Ativo)
                const lancamentoAtivo: any = {
                    proprietario_id: proprietarioDaConfiguracao,
                    data_movimentacao: formattedDate,
                    descricao: t.descricao,
                    valor: valor,
                    tipo: t.tipo, // Usa o tipo original (Entrada/Saida)
                    conta_bancaria_id: contaSelecionadaId,
                    conta_contabil_id: contaAtivoCaixaId, // Conta de Ativo/Caixa
                    conciliado: true,
                    origem: 'conciliacao_extrato',
                    documento: t.identificacao || null,
                };
                
                // Transação 2: Partida Dobrada (Resultado - Receita/Despesa)
                let tipoResultado: 'Entrada' | 'Saida';
                
                if (t.tipo === 'Entrada') {
                    // Entrada (Receita): D: Ativo, C: Receita -> Receita é Credora, então C = 'Saida'
                    tipoResultado = 'Saida';
                } else {
                    // Saída (Despesa): D: Despesa, C: Ativo -> Despesa é Credora, então D = 'Entrada'
                    tipoResultado = 'Entrada';
                }
                
                const lancamentoResultado: any = {
                    proprietario_id: proprietarioDaConfiguracao,
                    data_movimentacao: formattedDate,
                    descricao: t.descricao,
                    valor: valor,
                    tipo: tipoResultado, // Tipo ajustado para a conta de Resultado
                    conta_bancaria_id: null, // Não é conta bancária
                    conta_contabil_id: t.conta_contabil_id, // Conta de Resultado (Receita/Despesa)
                    conciliado: true,
                    origem: 'conciliacao_extrato',
                    documento: t.identificacao || null,
                };
                
                // CRÍTICO: Adiciona a referência cruzada (conta_resultado_id)
                // O lançamento de Ativo aponta para o ID do lançamento de Resultado
                // O lançamento de Resultado aponta para o ID do lançamento de Ativo
                const idAtivo = crypto.randomUUID();
                const idResultado = crypto.randomUUID();
                
                lancamentoAtivo.id = idAtivo;
                lancamentoAtivo.conta_resultado_id = idResultado;
                
                lancamentoResultado.id = idResultado;
                lancamentoResultado.conta_resultado_id = idAtivo;
                
                return [lancamentoAtivo, lancamentoResultado];
            });
            
            // Prepara o payload para a tabela 'extratos' (para controle de duplicidade futura)
            const extratosPayload = transacoesParaSalvar.map(t => {
                const formattedDate = formatDDMMYYYYToISO(t.data) || String(t.data);
                
                return {
                    empresa_id: proprietarioDaConfiguracao,
                    id_saldo_contas: contaSelecionadaId,
                    data: formattedDate,
                    descricao: t.descricao,
                    // salva como número com 2 casas (coerente com comparação feita em fetchExistingExtratos)
                    valor: Number(Number(t.valor).toFixed(2)),
                    tipo: t.tipo,
                    identificacao: t.identificacao || null,
                    conciliado: true,
                    conta_contabil_id: t.conta_contabil_id,
                };
            });
            
            // 1. Inserir Lançamentos (Movimentação de Saldo e Partida Dobrada)
            const { error: lancamentoError } = await supabase
                .from('lancamentos')
                .insert(lancamentosPayload);
                
            if (lancamentoError) throw lancamentoError;
            
            // 2. Inserir Extratos (Controle de Duplicidade)
            const { error: extratoError } = await supabase
                .from('extratos')
                .insert(extratosPayload);
                
            if (extratoError) throw extratoError;
            
            // 3. Inserir/Atualizar Regras de Mapeamento (se necessário)
            const regrasParaSalvar = transacoesParaSalvar
                .filter(t => !t.conciliada)
                .map(t => ({
                    proprietario_id: proprietarioDaConfiguracao,
                    descricao_extrato: t.descricao,
                    conta_contabil_id: t.conta_contabil_id,
                    tipo_lancamento: t.tipo,
                }));
                
            if (regrasParaSalvar.length > 0) {
                const { error: regraError } = await supabase
                    .from('conciliacao_regras')
                    .upsert(regrasParaSalvar, { onConflict: 'proprietario_id, descricao_extrato, tipo_lancamento' });
                
                if (regraError) console.error('Aviso: Falha ao salvar regras de mapeamento:', regraError);
            }
            
            // 4. Salvar o registro de conciliação (Histórico)
            const historicoPayload = {
                empresa_id: proprietarioDaConfiguracao,
                usuario_id: usuario?.id,
                id_saldo_contas: contaSelecionadaId,
                nome_arquivo: file.name,
                extrato_json: transacoesParaSalvar,
                extrato_hash: fileHash, // USANDO O HASH ARMAZENADO
            };
            
            const { error: historicoError } = await supabase
                .from('conciliacoes')
                .insert(historicoPayload);
                
            if (historicoError) throw historicoError;

            showSuccess(`${lancamentosPayload.length / 2} transações conciliadas e salvas com sucesso!`);
            handleReset();
            fetchHistorico();
            
        } catch (error: any) {
            showError('Falha ao salvar conciliação: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    }, [contaSelecionadaId, proprietarioDaConfiguracao, file, fileHash, transacoes, usuario?.id, fetchHistorico, handleReset, contaSelecionada?.plano_contas?.id]);


    return {
        // State
        loading: loading || loadingContas,
        isSaving,
        isDeletingHistorico,
        activeTab,
        contas: contasCalculadas,
        configs,
        contasContabeis,
        historico,
        contaSelecionadaId,
        configSelecionada,
        file,
        transacoes,
        transacoesRejeitadas, // RETORNANDO O NOVO ESTADO
        transacoesSelecionadas,
        contaContabilLote,
        historicoSelecionado,
        historicoDetalhesOpen,
        proprietarioDaConfiguracao,
        fileHash, // RETORNANDO O HASH

        // Handlers
        setActiveTab,
        handleReset,
        handleSelectAccount,
        handleSelectConfig,
        handleFileChange,
        handleParseFile,
        handleContaContabilChange,
        handleToggleSelection,
        handleSelectAll,
        handleContaContabilLoteChange,
        handleApplyLote,
        handleSaveConciliacao,
        handleDeleteHistorico,
        handleViewHistoricoDetails,
        setHistoricoDetalhesOpen: handleSetHistoricoDetalhesOpen,
        fetchConfigs,
    };
}