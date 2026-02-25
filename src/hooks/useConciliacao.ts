import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSessao } from './use-sessao';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess, showInfo } from '@/utils/toast';
import { SaldoConta } from '@/types/saldo-conta';
import { ConfiguracaoConciliacao, TransacaoExtrato, ConciliacaoRegra, ConciliacaoHistorico } from '@/types/conciliacao';
import { PlanoContas } from '@/types/plano-contas';
import Papa, { ParseResult } from 'papaparse';
import { format, parseISO, parse, isValid } from 'date-fns';
import { formatDDMMYYYYToISO, normalizeString, calculateContentHash } from '@/utils/formatters';
import useSaldoContaCalculado from './use-saldo-conta-calculado';
import { useOwner } from './use-owner';
import { buscarParcelasCandidatas } from './conciliacao/useMapeamentoParcelas';

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
    handleMapeamentoConcluido: (_transacao: TransacaoExtrato, index: number) => void;
}

export function useConciliacao(isBancoOnly: boolean = false): ConciliacaoHook {
    const { usuario, role, perfil } = useSessao();
    const { ownerId, ownerType } = useOwner();
    const usuarioId = usuario?.id;
    
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

    const { contas, carregando: carregandoSessao } = useSaldoContaCalculado(
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
            .select('id, Conta, Descricao, Analitica, is_conta_resultado, is_caixa, is_banco')
            .eq('proprietario_id', proprietarioDaConfiguracao)
            .eq('Analitica', 'Sim')
            .or('is_conta_resultado.eq.true,is_caixa.eq.true,is_banco.eq.true')
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
        setLoading(carregandoSessao);
        fetchHistorico();
    }, [carregandoSessao, fetchHistorico]);
    
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
        const isAdmin = ownerType === 'Admin' || ownerType === 'AdminUsuario';
        
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

        const parseValue = (val: any): number => {
            if (typeof val === 'number') return val;
            let s = String(val || '0').trim();
            s = s.replace(/[R$\s]/g, '');
            
            if (s.includes(',') && s.includes('.')) {
                s = s.replace(/\./g, '').replace(',', '.');
            } else if (s.includes(',')) {
                s = s.replace(',', '.');
            }
            
            return parseFloat(s) || 0;
        };

        setLoading(true);
        
        try {
            const fileContent = await file.text();
            const lines = fileContent.split('\n');
            const headerIndex = lines.findIndex(line => {
                const l = line.toLowerCase();
                return l.includes('data') && (l.includes('valor') || l.includes('descri') || l.includes('transa'));
            });

            if (headerIndex === -1) {
                throw new Error("Cabeçalho do CSV não encontrado. Certifique-se de que o arquivo contém as colunas 'Data' e 'Valor'.");
            }

            const headerRow = lines[headerIndex].trim();
            const cleanedLines = [headerRow];
            lines.slice(headerIndex + 1).forEach(line => {
                const trimmedLine = line.trim();
                if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(trimmedLine)) {
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
            
            const jaImportado = (hashCount || 0) > 0;
            if (jaImportado) {
                showInfo('Este extrato já foi importado anteriormente. Exibindo status de cada transação.');
            }
            
            setFileHash(contentHash);
            const existingExtratosSet = await fetchExistingExtratos(contaSelecionadaId, proprietarioDaConfiguracao);
            
            Papa.parse(cleanedCsvContent, {
                header: true,
                skipEmptyLines: 'greedy',
                delimiter: "",
                complete: async (results: ParseResult<any>) => {
                    try {
                        const rawTransacoes: TransacaoExtrato[] = await Promise.all(results.data.map(async (row: any) => {
                            let valor = parseValue(row[config.mapeamento.valor]);
                            
                            if (config.coluna_tipo_transacao && config.valor_credito) {
                                const rowType = normalizeString(String(row[config.coluna_tipo_transacao]));
                                const configType = normalizeString(config.valor_credito);
                                
                                if (rowType === configType) {
                                    valor = Math.abs(valor);
                                } else {
                                    valor = -Math.abs(valor);
                                }
                            }
                            
                            const identificacao = config.mapeamento.identificacao 
                                ? String(row[config.mapeamento.identificacao] || '') 
                                : undefined;
                                
                            const tipo = (valor >= 0 ? 'Entrada' : 'Saida') as 'Entrada' | 'Saida';
                            const dataMovimentacaoRaw = row[config.mapeamento.data];
                            let formattedDate = safeFormatDate(dataMovimentacaoRaw);
                            
                            const descricaoRaw = row[config.mapeamento.descricao] ?? '';
                            const normalizedDesc = normalizeString(String(descricaoRaw));
                            const uniqueKey = `${formattedDate}|${normalizedDesc}|${Number(valor).toFixed(2)}|${tipo}`;
                            
                            let isDuplicated = existingExtratosSet.has(uniqueKey);
                            
                            const transacao: TransacaoExtrato = {
                                data: formattedDate || String(dataMovimentacaoRaw),
                                descricao: String(descricaoRaw),
                                valor: valor,
                                tipo: tipo,
                                identificacao: identificacao,
                                isDuplicated: isDuplicated,
                                motivoDuplicidade: isDuplicated ? 'Transação já existe na tabela de extratos.' : null,
                            };

                            if (!isDuplicated && formattedDate) {
                                const candidatos = await buscarParcelasCandidatas(transacao, proprietarioDaConfiguracao);
                                if (candidatos.length > 0) {
                                    const melhorMatch = candidatos[0];
                                    transacao.tem_sugestao = true;
                                    transacao.sugestao_parcela_id = melhorMatch.id;
                                    transacao.nivel_confianca = melhorMatch.compatibilidade;
                                }
                            }

                            return transacao;
                        }));
                        
                        const transacoesValidas = rawTransacoes.filter(t => !t.isDuplicated);
                        const transacoesMapeadas = applyRegras(transacoesValidas);
                        const transacoesCompletas = [...transacoesMapeadas, ...rawTransacoes.filter(t => t.isDuplicated)];
                        
                        setTransacoes(() => transacoesCompletas);
                        
                        const jaMapedas = rawTransacoes.filter(t => t.isDuplicated).length;
                        let successMessage = `${transacoesValidas.length} transações novas encontradas.`;
                        if (jaMapedas > 0) {
                            successMessage += ` ${jaMapedas} já mapeadas anteriormente.`;
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
                    setLoading(false);
                    showError('Erro ao processar o arquivo CSV: ' + err.message);
                }
            });
        } catch (err: any) {
            setLoading(false);
            showError('Erro ao processar o arquivo: ' + (err?.message || String(err)));
        }
    }, [file, configSelecionada, contaSelecionadaId, proprietarioDaConfiguracao, regras, role, fetchExistingExtratos, applyRegras]);

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

    const handleMapeamentoConcluido = useCallback((_transacao: TransacaoExtrato, index: number) => {
        setTransacoes(prev => prev.map((t, i) =>
            i === index
                ? { ...t, conta_contabil_id: 'MAPEADO_PARCELAS', conciliada: true }
                : t
        ));
    }, []);

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
        handleMapeamentoConcluido,
        handleDeleteHistorico,
        handleViewHistoricoDetails,
        setHistoricoDetalhesOpen: handleSetHistoricoDetalhesOpen,
        fetchConfigs,
    };
}