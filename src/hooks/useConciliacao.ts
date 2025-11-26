import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSessao } from './use-sessao';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { SaldoConta } from '@/types/saldo-conta';
import { ConfiguracaoConciliacao, TransacaoExtrato, ConciliacaoRegra, ConciliacaoHistorico } from '@/types/conciliacao';
import { PlanoContas } from '@/types/plano-contas';
import Papa, { ParseResult } from 'papaparse';
import { format, parseISO } from 'date-fns';
import { formatDDMMYYYYToISO, normalizeString } from '@/utils/formatters'; // Importando normalizeString

interface ConciliacaoHook {
    // State
    loading: boolean;
    isSaving: boolean;
    isDeletingHistorico: boolean;
    activeTab: string;
    contas: SaldoConta[];
    configs: ConfiguracaoConciliacao[];
    contasContabeis: PlanoContas[];
    historico: ConciliacaoHistorico[];
    contaSelecionadaId: string | null;
    configSelecionada: ConfiguracaoConciliacao | null;
    file: File | null;
    transacoes: TransacaoExtrato[];
    transacoesSelecionadas: number[];
    contaContabilLote: string | null;
    historicoSelecionado: ConciliacaoHistorico | null;
    historicoDetalhesOpen: boolean;
    proprietarioDaConfiguracao: string | undefined | null;

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

// Função auxiliar para calcular um hash simples do conteúdo do CSV (ignorando a primeira linha)
const calculateContentHash = (csvContent: string): string => {
    const lines = csvContent.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    if (lines.length <= 1) return ''; // Ignora cabeçalho
    
    // Concatena todas as linhas de dados (a partir da segunda linha)
    const dataContent = lines.slice(1).join('|');
    
    // Em um ambiente real, usaríamos uma biblioteca de hash (ex: crypto.subtle.digest).
    // Aqui, usamos uma concatenação simples como identificador de conteúdo.
    return dataContent.substring(0, 255); // Limita o tamanho do hash para o campo TEXT
};

export function useConciliacao(): ConciliacaoHook {
    const { usuario } = useSessao();
    
    // --- Estados ---
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeletingHistorico, setIsDeletingHistorico] = useState(false);
    const [activeTab, setActiveTab] = useState('conciliacao');
    
    const [contas, setContas] = useState<SaldoConta[]>([]);
    const [configs, setConfigs] = useState<ConfiguracaoConciliacao[]>([]);
    const [contasContabeis, setContasContabeis] = useState<PlanoContas[]>([]);
    const [historico, setHistorico] = useState<ConciliacaoHistorico[]>([]);
    
    const [contaSelecionadaId, setContaSelecionadaId] = useState<string | null>(null);
    const [configSelecionada, setConfigSelecionada] = useState<ConfiguracaoConciliacao | null>(null);
    const [file, setFile] = useState<File | null>(null);
    const [transacoes, setTransacoes] = useState<TransacaoExtrato[]>([]);
    const [regras, setRegras] = useState<ConciliacaoRegra[]>([]);
    
    const [transacoesSelecionadas, setTransacoesSelecionadas] = useState<number[]>([]);
    const [contaContabilLote, setContaContabilLote] = useState<string | null>(null);
    
    const [historicoDetalhesOpen, setHistoricoDetalhesOpen] = useState(false);
    const [historicoSelecionado, setHistoricoSelecionado] = useState<ConciliacaoHistorico | null>(null);

    const contaSelecionada = useMemo(() => contas.find(c => c.id === contaSelecionadaId), [contas, contaSelecionadaId]);
    const proprietarioDaConfiguracao = contaSelecionada?.proprietario_id;

    // --- Funções de Busca de Dados ---

    const fetchContas = useCallback(async () => {
        if (!usuario?.id) return;
        setLoading(true);
        const { data, error } = await supabase.from('saldo_contas').select('*, conta_contabil_id').eq('proprietario_id', usuario.id);
        if (error) showError('Erro ao carregar contas: ' + error.message);
        else setContas(data as SaldoConta[]);
        setLoading(false);
    }, [usuario]);

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
            .select('id, Conta, Descricao, Analitica, is_conta_saldo, is_conta_resultado')
            .eq('proprietario_id', proprietarioDaConfiguracao)
            .eq('Analitica', 'Sim')
            .eq('is_conta_resultado', true)
            .order('Conta');
            
        if (error) {
            showError('Erro ao carregar Plano de Contas: ' + error.message);
            setContasContabeis([]);
        } else {
            const filteredContas = (data as PlanoContas[]).filter(c => 
                c.id !== contaSelecionada.conta_contabil_id
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
                t.descricao.toLowerCase().includes(r.descricao_extrato.toLowerCase()) && r.tipo_lancamento === t.tipo
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
        setTransacoesSelecionadas([]);
        setContaContabilLote(null);
        setFile(null);
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
        setFile(null);
    }, [configs]);

    const handleFileChange = useCallback((newFile: File | null) => {
        setFile(newFile);
        setTransacoes([]);
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

    // --- Lógica de Processamento de Arquivo ---

    const checkFileDuplicity = useCallback(async (contentHash: string, empresaId: string): Promise<boolean> => {
        const { data, error } = await supabase
            .from('conciliacoes')
            .select('id')
            .eq('empresa_id', empresaId)
            .eq('extrato_hash', contentHash) // Verifica pelo hash do conteúdo
            .limit(1);
            
        if (error) {
            console.error('Erro ao verificar duplicidade de conteúdo:', error);
            return false; 
        }
        
        return data && data.length > 0;
    }, []);
    
    // NOVO: Função para buscar extratos existentes na nova tabela
    const fetchExistingExtratos = useCallback(async (contaId: string, empresaId: string) => {
        const { data, error } = await supabase
            .from('extratos')
            .select('data, descricao, valor, tipo')
            .eq('empresa_id', empresaId)
            .eq('id_saldo_contas', contaId);
            
        if (error) {
            console.error('Erro ao buscar extratos existentes:', error);
            return new Set<string>();
        }
        
        // Cria um Set de chaves únicas (Data YYYY-MM-DD | Descrição Normalizada | Valor (com sinal, 2 casas) | Tipo)
        return new Set(data.map(e => {
            const formattedDate = format(parseISO(e.data), 'yyyy-MM-dd');
            const normalizedDesc = normalizeString(e.descricao);
            // Usamos o valor original (com sinal) para a verificação de unicidade
            return `${formattedDate}|${normalizedDesc}|${Number(e.valor).toFixed(2)}|${e.tipo}`;
        }));
    }, []);

    const handleParseFile = useCallback(async () => {
        if (!file || !configSelecionada || !contaSelecionadaId || !proprietarioDaConfiguracao) {
            showError('Selecione a conta, a configuração e o arquivo.');
            return;
        }
        const config = configSelecionada;
        
        setLoading(true);
        
        // 1. Ler o conteúdo do arquivo para calcular o hash
        const fileContent = await file.text();
        const contentHash = calculateContentHash(fileContent);
        
        if (!contentHash) {
            showError('O arquivo está vazio ou não contém dados válidos.');
            setLoading(false);
            return;
        }
        
        // 2. Verificar Duplicidade de Conteúdo (do arquivo completo)
        const isDuplicatedContent = await checkFileDuplicity(contentHash, proprietarioDaConfiguracao);
        if (isDuplicatedContent) {
            showError(`O conteúdo deste extrato já foi importado anteriormente.`);
            setLoading(false);
            return;
        }

        // 3. Buscar extratos existentes na nova tabela 'extratos'
        const existingExtratosSet = await fetchExistingExtratos(contaSelecionadaId, proprietarioDaConfiguracao);
        
        // 4. Processar o CSV
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            dynamicTyping: true,
            complete: (results: ParseResult<any>) => {
                const rawTransacoes: TransacaoExtrato[] = results.data.map((row: any) => {
                    const valorStr = String(row[config.mapeamento.valor] || '0').replace(',', '.');
                    let valor = parseFloat(valorStr);
                    
                    if (config.coluna_tipo_transacao && row[config.coluna_tipo_transacao] !== config.valor_credito) {
                        valor = -Math.abs(valor);
                    }
                    
                    const identificacao = config.mapeamento.identificacao 
                        ? String(row[config.mapeamento.identificacao] || '') 
                        : undefined;
                        
                    const tipo = (valor >= 0 ? 'Entrada' : 'Saida') as 'Entrada' | 'Saida';
                    const dataMovimentacao = row[config.mapeamento.data];
                    
                    let formattedDate: string | null = null;
                    
                    // Tenta formatar a data do CSV (DD/MM/YYYY) para YYYY-MM-DD
                    formattedDate = formatDDMMYYYYToISO(dataMovimentacao);
                    
                    if (!formattedDate) {
                        console.error('Falha ao formatar data do CSV:', dataMovimentacao);
                        formattedDate = dataMovimentacao; 
                    }
                    
                    const normalizedDesc = normalizeString(row[config.mapeamento.descricao]);
                    
                    // Chave de comparação para a transação atual (usando a data formatada YYYY-MM-DD e valor com sinal)
                    const uniqueKey = `${formattedDate}|${normalizedDesc}|${Number(valor).toFixed(2)}|${tipo}`;
                    
                    let isDuplicated = false;
                    let motivoDuplicidade: string | null = null;
                    
                    // Verifica duplicidade contra a tabela 'extratos'
                    if (existingExtratosSet.has(uniqueKey)) {
                        isDuplicated = true;
                        motivoDuplicidade = 'Transação já existe na tabela de extratos.';
                    }

                    return {
                        data: dataMovimentacao,
                        descricao: row[config.mapeamento.descricao],
                        valor: valor,
                        tipo: tipo,
                        identificacao: identificacao,
                        isDuplicated: isDuplicated,
                        motivoDuplicidade: motivoDuplicidade,
                    };
                }).filter(t => t.data && t.descricao);
                
                const transacoesValidas = rawTransacoes.filter(t => !t.isDuplicated);
                const transacoesRejeitadas = rawTransacoes.filter(t => t.isDuplicated);
                
                const transacoesMapeadas = applyRegras(transacoesValidas);
                
                setTransacoes([...transacoesMapeadas, ...transacoesRejeitadas]);
                setTransacoesSelecionadas([]);
                setContaContabilLote(null);
                
                showSuccess(`${transacoesValidas.length} transações válidas importadas. ${transacoesRejeitadas.length} duplicadas rejeitadas.`);
            },
            error: (err) => {
                showError('Erro ao processar o arquivo CSV: ' + err.message);
            }
        });
        setLoading(false);
    }, [file, configSelecionada, contaSelecionadaId, proprietarioDaConfiguracao, applyRegras, checkFileDuplicity, fetchExistingExtratos]);

    // --- Lógica de Salvamento ---

    const handleSaveConciliacao = useCallback(async () => {
        if (!contaSelecionadaId || !proprietarioDaConfiguracao || !file) {
            showError('Conta bancária, proprietário ou arquivo não definidos.');
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
            const lancamentosPayload = transacoesParaSalvar.map(t => {
                const formattedDate = formatDDMMYYYYToISO(t.data);
                
                return {
                    proprietario_id: proprietarioDaConfiguracao, // ALTERADO: empresa_id -> proprietario_id
                    data_movimentacao: formattedDate || t.data,
                    descricao: t.descricao,
                    valor: Math.abs(t.valor), // Valor absoluto para lancamentos
                    tipo: t.tipo,
                    conta_bancaria_id: contaSelecionadaId,
                    conta_contabil_id: t.conta_contabil_id,
                    conciliado: true,
                    origem: 'conciliacao_extrato',
                    documento: t.identificacao || null,
                };
            });
            
            // Prepara o payload para a tabela 'extratos' (para controle de duplicidade futura)
            const extratosPayload = transacoesParaSalvar.map(t => {
                const formattedDate = formatDDMMYYYYToISO(t.data);
                
                return {
                    empresa_id: proprietarioDaConfiguracao,
                    id_saldo_contas: contaSelecionadaId,
                    data: formattedDate || t.data,
                    descricao: t.descricao,
                    valor: t.valor, // Valor original (com sinal) para extratos
                    tipo: t.tipo,
                    identificacao: t.identificacao || null,
                    conciliado: true,
                    conta_contabil_id: t.conta_contabil_id,
                };
            });
            
            // 1. Inserir Lançamentos (Movimentação de Saldo)
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
            const fileContent = await file.text();
            const contentHash = calculateContentHash(fileContent);
            
            const historicoPayload = {
                empresa_id: proprietarioDaConfiguracao,
                usuario_id: usuario?.id,
                id_saldo_contas: contaSelecionadaId,
                nome_arquivo: file.name,
                extrato_json: transacoesParaSalvar,
                extrato_hash: contentHash, // Salva o hash do conteúdo
            };
            
            const { error: historicoError } = await supabase
                .from('conciliacoes')
                .insert(historicoPayload);
                
            if (historicoError) throw historicoError;

            showSuccess(`${lancamentosPayload.length} lançamentos conciliados e salvos com sucesso!`);
            handleReset();
            fetchHistorico();
            
        } catch (error: any) {
            showError('Falha ao salvar conciliação: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    }, [contaSelecionadaId, proprietarioDaConfiguracao, file, transacoes, usuario?.id, fetchHistorico, handleReset]);

    const handleDeleteHistorico = useCallback(async () => {
        if (!usuario?.id) return;
        
        setIsDeletingHistorico(true);
        
        try {
            const { error } = await supabase
                .from('conciliacoes')
                .delete()
                .eq('empresa_id', usuario.id);
                
            if (error) throw error;
            
            showSuccess(`Histórico de ${historico.length} conciliações removido com sucesso.`);
            fetchHistorico();
        } catch (error: any) {
            showError('Falha ao limpar histórico: ' + error.message);
        } finally {
            setIsDeletingHistorico(false);
        }
    }, [usuario?.id, historico.length, fetchHistorico]);

    return {
        // State
        loading,
        isSaving,
        isDeletingHistorico,
        activeTab,
        contas,
        configs,
        contasContabeis,
        historico,
        contaSelecionadaId,
        configSelecionada,
        file,
        transacoes,
        transacoesSelecionadas,
        contaContabilLote,
        historicoSelecionado,
        historicoDetalhesOpen,
        proprietarioDaConfiguracao,

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

