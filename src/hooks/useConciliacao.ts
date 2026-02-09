import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSessao } from './use-sessao';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { SaldoConta } from '@/types/saldo-conta';
import { ConfiguracaoConciliacao, TransacaoExtrato, ConciliacaoRegra, ConciliacaoHistorico } from '@/types/conciliacao';
import { PlanoContas } from '@/types/plano-contas';
import Papa, { ParseResult } from 'papaparse';
import { format, parseISO, parse, isValid } from 'date-fns';
import { formatDDMMYYYYToISO, normalizeString, calculateContentHash } from '@/utils/formatters';
import useSaldoContaCalculado from './use-saldo-conta-calculado';
import { useOwner } from './use-owner';

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

export function useConciliacao(isBancoOnly: boolean = false): ConciliacaoHook {
    const { usuario } = useSessao();
    const { ownerId } = useOwner();
    
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeletingHistorico, setIsDeletingHistorico] = useState(false);
    const [activeTab, setActiveTab] = useState('conciliacao');
    
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

    const [fileHash, setFileHash] = useState<string | null>(null);

    const { contas, carregando: carregandoContas } = useSaldoContaCalculado(
        'todos', 
        'todos', 
        '', 
        'bancos', 
        isBancoOnly
    );
    
    const contaSelecionada = useMemo(() => contas.find(c => c.id === contaSelecionadaId), [contas, contaSelecionadaId]);
    const proprietarioDaConfiguracao = contaSelecionada?.proprietario_id;

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
            .select('id, Conta, Descricao, Analitica, is_conta_resultado')
            .eq('proprietario_id', proprietarioDaConfiguracao)
            .eq('Analitica', 'Sim')
            .eq('is_conta_resultado', true)
            .order('Conta');
            
        if (error) {
            showError('Erro ao carregar Plano de Contas: ' + error.message);
            setContasContabeis([]);
        } else {
            setContasContabeis(data as PlanoContas[]);
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
        if (!ownerId) return;
        
        const { data, error } = await supabase
            .from('conciliacoes')
            .select(`
                *,
                saldo_contas:id_saldo_contas ( nome )
            `)
            .eq('empresa_id', ownerId)
            .order('criado_em', { ascending: false });
            
        if (error) {
            showError('Erro ao carregar histórico de conciliações: ' + error.message);
            setHistorico([]);
        } else {
            setHistorico(data as ConciliacaoHistorico[]);
        }
    }, [ownerId]);

    useEffect(() => {
        setLoading(carregandoContas);
        fetchHistorico();
    }, [carregandoContas, fetchHistorico]);
    
    useEffect(() => {
        if (contaSelecionadaId) {
            fetchContasContabeis();
            fetchRegras();
        }
    }, [contaSelecionadaId, fetchContasContabeis, fetchRegras]);

    useEffect(() => {
        fetchConfigs();
        setConfigSelecionada(null);
    }, [contaSelecionadaId, fetchConfigs]);

    const applyRegras = useCallback((rawTransacoes: TransacaoExtrato[]): TransacaoExtrato[] => {
        return rawTransacoes.map(t => {
            if (t.isDuplicated) return t;
            
            const regra = regras.find(r => 
                normalizeString(t.descricao).includes(r.descricao_extrato.toLowerCase()) && r.tipo_lancamento === t.tipo
            );
            
            if (regra) {
                return { ...t, conciliada: true, conta_contabil_id: regra.conta_contabil_id };
            }
            return { ...t, conciliada: false, conta_contabil_id: null };
        });
    }, [regras]);

    const handleReset = useCallback((keepAccountId: boolean = false) => {
        if (!keepAccountId) {
            setContaSelecionadaId(null);
        }
        setConfigSelecionada(null);
        setTransacoes([]);
        setTransacoesSelecionadas([]);
        setContaContabilLote(null);
        setFile(null);
        setFileHash(null);
        setActiveTab('conciliacao');
    }, []);

    const handleSelectAccount = useCallback((id: string) => {
        setContaSelecionadaId(id);
        handleReset(true);
        fetchConfigs();
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
        
        const safeFormatDate = (dateStr: string | undefined | null): string | null => {
            if (!dateStr) return null;
            const candidate1 = formatDDMMYYYYToISO(dateStr as string);
            if (candidate1) return candidate1;
            try {
                const parsedIso = parseISO(dateStr as string);
                if (isValid(parsedIso)) return format(parsedIso, 'yyyy-MM-dd');
            } catch (e) {}
            try {
                const parsedBR = parse(dateStr as string, 'dd/MM/yyyy', new Date());
                if (isValid(parsedBR)) return format(parsedBR, 'yyyy-MM-dd');
            } catch (e) {}
            try {
                const parsedLoose = parse(dateStr as string, 'yyyy-MM-dd', new Date());
                if (isValid(parsedLoose)) return format(parsedLoose, 'yyyy-MM-dd');
            } catch (e) {}
            return null;
        };

        setLoading(true);
        
        try {
            const fileContent = await file.text();
            
            // Pré-processamento do conteúdo do CSV para remover linhas indesejadas
            const lines = fileContent.split('\n');
            const headerRow = lines.find(line => line.trim().toLowerCase().startsWith('data;'));
            if (!headerRow) {
                throw new Error("Cabeçalho do CSV (iniciando com 'Data;') não encontrado.");
            }
            const cleanedLines = [headerRow.trim()]; // Começa com o cabeçalho limpo
            lines.slice(1).forEach(line => {
                const trimmedLine = line.trim();
                // Mantém apenas linhas que começam com um formato de data (dd/mm/yyyy)
                if (/^\d{2}\/\d{2}\/\d{4}/.test(trimmedLine)) {
                    cleanedLines.push(trimmedLine);
                }
            });
            const cleanedCsvContent = cleanedLines.join('\n');

            const contentHash = calculateContentHash(cleanedCsvContent);
            
            if (!contentHash) {
                showError('O arquivo está vazio ou não contém dados válidos.');
                setLoading(false);
                return;
            }
            
            const { count: hashCount } = await supabase
                .from('conciliacoes')
                .select('id', { count: 'exact', head: true })
                .eq('empresa_id', proprietarioDaConfiguracao)
                .eq('extrato_hash', contentHash);
            
            if ((hashCount || 0) > 0) {
                showError('Este arquivo já foi importado anteriormente.');
                setLoading(false);
                return;
            }
            
            setFileHash(contentHash);

            const existingExtratosSet = await fetchExistingExtratos(contaSelecionadaId, proprietarioDaConfiguracao);
            
            Papa.parse(cleanedCsvContent, {
                header: true,
                skipEmptyLines: 'greedy',
                delimiter: ";",
                complete: (results: ParseResult<any>) => {
                    try {
                        const rawTransacoes: TransacaoExtrato[] = results.data.map((row: any) => {
                            const dataOriginal = row[config.mapeamento.data];
                            const descricaoOriginal = row[config.mapeamento.descricao];

                            if (!dataOriginal || !descricaoOriginal || String(descricaoOriginal).trim().toLowerCase() === 'saldo anterior') {
                                return null;
                            }

                            let valor = 0;
                            let tipo: 'Entrada' | 'Saida' = 'Entrada';
                            const hasCreditoDebito = config.mapeamento.credito && config.mapeamento.debito;

                            if (hasCreditoDebito) {
                                const creditoStr = String(row[config.mapeamento.credito!] ?? '0').replace(/\s+/g, '').replace(/\./g, '').replace(',', '.');
                                const debitoStr = String(row[config.mapeamento.debito!] ?? '0').replace(/\s+/g, '').replace(/\./g, '').replace(',', '.');
                                const creditoVal = parseFloat(creditoStr);
                                const debitoVal = parseFloat(debitoStr);

                                if (!isNaN(creditoVal) && creditoVal !== 0) {
                                    valor = Math.abs(creditoVal);
                                    tipo = 'Entrada';
                                } else if (!isNaN(debitoVal) && debitoVal !== 0) {
                                    valor = -Math.abs(debitoVal);
                                    tipo = 'Saida';
                                } else {
                                    return null;
                                }
                            } else {
                                const rawValorStr = String(row[config.mapeamento.valor] ?? '0').replace(/\s+/g, '').replace(',', '.');
                                const parsedValor = Number(parseFloat(rawValorStr || '0'));
                                valor = isNaN(parsedValor) ? 0 : parsedValor;
                                
                                if (config.coluna_tipo_transacao && row[config.coluna_tipo_transacao] !== config.valor_credito) {
                                    valor = -Math.abs(valor);
                                }
                                tipo = (valor >= 0 ? 'Entrada' : 'Saida');
                            }

                            if (valor === 0) return null;

                            const identificacao = config.mapeamento.identificacao ? String(row[config.mapeamento.identificacao] || '') : undefined;
                            const formattedDate = safeFormatDate(dataOriginal);
                            const normalizedDesc = normalizeString(String(descricaoOriginal));
                            const uniqueKey = `${formattedDate}|${normalizedDesc}|${Number(valor).toFixed(2)}|${tipo}`;
                            
                            return {
                                data: dataOriginal,
                                descricao: String(descricaoOriginal),
                                valor: valor,
                                tipo: tipo,
                                identificacao: identificacao,
                                isDuplicated: existingExtratosSet.has(uniqueKey),
                                motivoDuplicidade: existingExtratosSet.has(uniqueKey) ? 'Transação já existe no banco de dados.' : null,
                            } as TransacaoExtrato;
                        }).filter((t): t is TransacaoExtrato => t !== null);
                        
                        const transacoesValidas = rawTransacoes.filter(t => !t.isDuplicated);
                        const transacoesMapeadas = applyRegras(transacoesValidas);
                        const transacoesCompletas = [...transacoesMapeadas, ...rawTransacoes.filter(t => t.isDuplicated)];
                        
                        setTransacoes(() => transacoesCompletas);
                        
                        let successMessage = `${transacoesValidas.length} transações válidas importadas.`;
                        if (rawTransacoes.filter(t => t.isDuplicated).length > 0) {
                            successMessage += ` ${rawTransacoes.filter(t => t.isDuplicated).length} rejeitadas por duplicidade.`;
                        }
                        showSuccess(successMessage);
                    } catch (innerErr: any) {
                        showError('Erro ao processar o arquivo CSV: ' + (innerErr?.message || String(innerErr)));
                    } finally {
                        setLoading(false);
                    }
                },
                error: (err) => {
                    setLoading(false);
                    showError('Erro ao processar o arquivo CSV: ' + err.message);
                }
            });
        } catch (err: any) {
            setLoading(false);
            showError('Erro ao processar o arquivo: ' + (err?.message || String(err)));
        }
    }, [file, configSelecionada, contaSelecionadaId, proprietarioDaConfiguracao, regras, fetchExistingExtratos, applyRegras]);

    const handleSaveConciliacao = useCallback(async () => {
        if (!contaSelecionadaId || !proprietarioDaConfiguracao || !file || !contaSelecionada || !usuarioId || !fileHash) {
            showError('Dados de sessão, conta bancária, proprietário, arquivo ou hash não definidos.');
            return;
        }
        
        const contaAtivoCaixaId = contaSelecionada.plano_contas?.id;
        
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
            const lancamentosPayload = transacoesParaSalvar.flatMap(t => {
                const formattedDate = formatDDMMYYYYToISO(t.data) || String(t.data);
                const valor = Math.abs(Number(t.valor));
                
                const lancamentoAtivo: any = {
                    proprietario_id: proprietarioDaConfiguracao,
                    data_movimentacao: formattedDate,
                    descricao: t.descricao,
                    valor: valor,
                    tipo: t.tipo,
                    conta_bancaria_id: contaSelecionadaId,
                    conta_contabil_id: contaAtivoCaixaId,
                    conciliado: true,
                    origem: 'conciliacao_extrato',
                    documento: t.identificacao || null,
                };
                
                let tipoResultado: 'Entrada' | 'Saida';
                if (t.tipo === 'Entrada') {
                    tipoResultado = 'Saida';
                } else {
                    tipoResultado = 'Entrada';
                }
                
                const lancamentoResultado: any = {
                    proprietario_id: proprietarioDaConfiguracao,
                    data_movimentacao: formattedDate,
                    descricao: t.descricao,
                    valor: valor,
                    tipo: tipoResultado,
                    conta_bancaria_id: null,
                    conta_contabil_id: t.conta_contabil_id,
                    conciliado: true,
                    origem: 'conciliacao_extrato',
                    documento: t.identificacao || null,
                };
                
                const idAtivo = crypto.randomUUID();
                const idResultado = crypto.randomUUID();
                
                lancamentoAtivo.id = idAtivo;
                lancamentoAtivo.conta_resultado_id = idResultado;
                
                lancamentoResultado.id = idResultado;
                lancamentoResultado.conta_resultado_id = idAtivo;
                
                return [lancamentoAtivo, lancamentoResultado];
            });
            
            const extratosPayload = transacoesParaSalvar.map(t => {
                const formattedDate = formatDDMMYYYYToISO(t.data) || String(t.data);
                return {
                    empresa_id: proprietarioDaConfiguracao,
                    id_saldo_contas: contaSelecionadaId,
                    data: formattedDate,
                    descricao: t.descricao,
                    valor: Number(Number(t.valor).toFixed(2)), 
                    tipo: t.tipo,
                    identificacao: t.identificacao || null,
                    conciliado: true,
                    conta_contabil_id: t.conta_contabil_id,
                };
            });
            
            const { error: lancamentoError } = await supabase.from('lancamentos').insert(lancamentosPayload);
            if (lancamentoError) throw lancamentoError;
            
            const { error: extratoError } = await supabase.from('extratos').insert(extratosPayload);
            if (extratoError) throw extratoError;
            
            const regrasParaSalvar = transacoesParaSalvar
                .filter(t => !t.conciliada)
                .map(t => ({
                    proprietario_id: proprietarioDaConfiguracao,
                    descricao_extrato: t.descricao,
                    conta_contabil_id: t.conta_contabil_id,
                    tipo_lancamento: t.tipo,
                }));
                
            if (regrasParaSalvar.length > 0) {
                await supabase.from('conciliacao_regras').upsert(regrasParaSalvar, { onConflict: 'proprietario_id, descricao_extrato, tipo_lancamento' });
            }
            
            const historicoPayload = {
                empresa_id: proprietarioDaConfiguracao,
                usuario_id: usuarioId,
                id_saldo_contas: contaSelecionadaId,
                nome_arquivo: file.name,
                extrato_json: transacoesParaSalvar,
                extrato_hash: fileHash,
            };
            
            const { error: historicoError } = await supabase.from('conciliacoes').insert(historicoPayload);
            if (historicoError) throw historicoError;

            showSuccess(`${lancamentosPayload.length / 2} transações conciliadas e salvas com sucesso!`);
            handleReset();
            fetchHistorico();
            
        } catch (error: any) {
            showError('Falha ao salvar conciliação: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    }, [contaSelecionadaId, proprietarioDaConfiguracao, file, fileHash, transacoes, usuarioId, fetchHistorico, handleReset, contaSelecionada?.plano_contas?.id]);

    const handleDeleteHistorico = useCallback(async () => {
        if (!usuarioId) return;
        
        setIsDeletingHistorico(true);
        
        try {
            const { error } = await supabase.from('conciliacoes').delete().eq('empresa_id', usuarioId);
            if (error) throw error;
            
            showSuccess('Histórico de conciliações limpo com sucesso.');
            fetchHistorico();
        } catch (error: any) {
            showError('Falha ao limpar histórico: ' + error.message);
        } finally {
            setIsDeletingHistorico(false);
        }
    }, [usuarioId, fetchHistorico]);

    return {
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