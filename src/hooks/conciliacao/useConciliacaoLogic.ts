import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { formatDDMMYYYYToISO, normalizeString, calculateContentHash } from '@/utils/formatters';
import Papa, { ParseResult } from 'papaparse';
import { format, parseISO, parse, isValid, subDays, addDays } from 'date-fns';
import { TransacaoExtrato, ConciliacaoRegra } from '@/types/conciliacao';
import { SaldoContaDetalhada } from '@/types/saldo-conta';

interface UseConciliacaoLogicProps {
    // State/Data Dependencies
    file: File | null;
    configSelecionada: any | null; // ConfiguracaoConciliacao
    contaSelecionadaId: string | null;
    proprietarioDaConfiguracao: string | undefined | null;
    regras: ConciliacaoRegra[];
    transacoes: TransacaoExtrato[];
    contaSelecionada: SaldoContaDetalhada | undefined;
    usuarioId: string | undefined;
    fileHash: string | null;
    
    // Setters/Mutations
    setLoading: (loading: boolean) => void;
    setIsSaving: (saving: boolean) => void;
    setIsDeletingHistorico: (deleting: boolean) => void;
    setTransacoes: (updater: (prev: TransacaoExtrato[]) => TransacaoExtrato[]) => void;
    setTransacoesRejeitadas: (rejeitadas: TransacaoExtrato[]) => void;
    setFileHash: (hash: string | null) => void;
    handleReset: (keepAccountId?: boolean) => void;
    fetchHistorico: () => Promise<void>;
}

export function useConciliacaoLogic({
    file,
    configSelecionada,
    contaSelecionadaId,
    proprietarioDaConfiguracao,
    regras,
    transacoes,
    contaSelecionada,
    usuarioId,
    fileHash,
    setLoading,
    setIsSaving,
    setIsDeletingHistorico,
    setTransacoes,
    setTransacoesRejeitadas,
    setFileHash,
    handleReset,
    fetchHistorico,
}: UseConciliacaoLogicProps) {

    // --- Internal Helpers ---

    const applyRegras = useCallback((rawTransacoes: TransacaoExtrato[]): TransacaoExtrato[] => {
        return rawTransacoes.map(t => {
            // A regra só se aplica se a transação não for duplicada
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

    const isPagBankTransaction = (descricao: string, origem?: string): boolean => {
        const descNormalized = normalizeString(descricao);
        return (
            origem === 'recebimento_pagbank' ||
            origem === 'taxa_pagbank' ||
            descNormalized.includes('parcela_') ||
            descNormalized.includes('pagbank') ||
            descNormalized.includes('pag bank')
        );
    };

    const fetchExistingExtratos = useCallback(async (contaId: string, empresaId: string) => {
        
        const existingKeys = new Map<string, string>();
        
        const { data, error } = await supabase
            .from('extratos')
            .select('data, descricao, valor, tipo, status_conciliacao')
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
            existingKeys.set(uniqueKey, e.status_conciliacao || 'EXISTENTE');
        });
        
        return existingKeys;
    }, []);

    const matchPagBankLancamento = useCallback(async (
        transacao: TransacaoExtrato, 
        empresaId: string
    ): Promise<{ matched: boolean; lancamentoId?: string }> => {
        if (!isPagBankTransaction(transacao.descricao)) {
            return { matched: false };
        }

        const valorTransacao = Math.abs(transacao.valor);
        const dataTransacao = formatDDMMYYYYToISO(transacao.data);
        
        if (!dataTransacao) return { matched: false };

        // Buscar lançamentos PagBank em ±2 dias
        const dataInicio = format(subDays(parseISO(dataTransacao), 2), 'yyyy-MM-dd');
        const dataFim = format(addDays(parseISO(dataTransacao), 2), 'yyyy-MM-dd');

        const { data: lancamentos, error } = await supabase
            .from('lancamentos')
            .select('id, valor, data_movimentacao, origem, descricao')
            .eq('proprietario_id', empresaId)
            .in('origem', ['recebimento_pagbank', 'taxa_pagbank'])
            .gte('data_movimentacao', dataInicio)
            .lte('data_movimentacao', dataFim);

        if (error || !lancamentos || lancamentos.length === 0) {
            return { matched: false };
        }

        // Match por valor líquido (após taxa)
        const matchedLancamento = lancamentos.find(l => {
            const valorLancamento = Math.abs(l.valor);
            const diferencaValor = Math.abs(valorLancamento - valorTransacao);
            return diferencaValor < 0.01; // Tolerância de 1 centavo
        });

        return matchedLancamento 
            ? { matched: true, lancamentoId: matchedLancamento.id }
            : { matched: false };
    }, []);

    // --- Core Logic / Mutations ---

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
            
            console.log('[DEBUG] Hash do arquivo:', contentHash);
            
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
            
            console.log('[DEBUG] hashCount:', hashCount);
            
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
                delimiter: "",  // Auto-detect delimiter (vírgula, ponto-e-vírgula, etc)
                complete: (results: ParseResult<any>) => {
                    try {
                        console.log('[CSV Debug] Dados parseados:', results.data);
                        console.log('[CSV Debug] Configuração:', config);
                        
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
                                const statusExistente = existingExtratosSet.get(uniqueKey);
                                if (statusExistente === 'CONCILIADA' || statusExistente === 'PARCIALMENTE_CONCILIADA') {
                                    motivoDuplicidade = 'Parcelas já mapeadas anteriormente.';
                                } else {
                                    motivoDuplicidade = 'Transação já existe na tabela de extratos.';
                                }
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
                        
                        console.log('[CSV Debug] Transações após filter:', rawTransacoes);
                        console.log('[CSV Debug] Total de transações:', rawTransacoes.length);
                        
                        // 4. Aplica regras de mapeamento APENAS nas transações válidas
                        const transacoesValidas = rawTransacoes.filter(t => !t.isDuplicated);
                        const transacoesMapeadas = applyRegras(transacoesValidas);
                        
                        // 5. Combina transações mapeadas e rejeitadas para a exibição unificada
                        const transacoesCompletas = [...transacoesMapeadas, ...rawTransacoes.filter(t => t.isDuplicated)];
                        
                        setTransacoes(() => transacoesCompletas); // LISTA COMPLETA
                        setTransacoesRejeitadas(rawTransacoes.filter(t => t.isDuplicated)); // APENAS PARA CONTAGEM
                        
                        let successMessage = `${transacoesValidas.length} transações válidas importadas.`;
                        
                        if (rawTransacoes.filter(t => t.isDuplicated).length > 0) {
                            successMessage += ` ${rawTransacoes.filter(t => t.isDuplicated).length} rejeitadas (Duplicidade de transação).`;
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
    }, [file, configSelecionada, contaSelecionadaId, proprietarioDaConfiguracao, regras, fetchExistingExtratos, setLoading, setFileHash, setTransacoes, setTransacoesRejeitadas]);

    const handleSaveConciliacao = useCallback(async () => {
        if (!contaSelecionadaId || !proprietarioDaConfiguracao || !file || !contaSelecionada || !usuarioId || !fileHash) {
            showError('Dados de sessão, conta bancária, proprietário, arquivo ou hash não definidos.');
            return;
        }
        
        // 1. Buscar a conta contábil do saldo_contas (Ativo/Caixa)
        const contaAtivoCaixaId = contaSelecionada.plano_contas?.id;
        
        if (!contaAtivoCaixaId) {
            showError('A conta bancária selecionada não está vinculada a um Plano de Contas (Ativo).');
            return;
        }
        
        // Filtra apenas transações válidas e mapeadas
        const transacoesParaSalvar = transacoes.filter(
            t => t.conta_contabil_id &&
                 t.conta_contabil_id !== 'MAPEADO_PARCELAS' &&
                 !t.isDuplicated
        );
        
        if (transacoesParaSalvar.length === 0) {
            showError('Nenhuma transação mapeada para salvar.');
            return;
        }
        
        setIsSaving(true);
        
        try {
            // NOVO: Verificar e processar transações PagBank antes do salvamento principal
            const transacoesPagBank: string[] = [];
            for (const t of transacoesParaSalvar) {
                if (isPagBankTransaction(t.descricao)) {
                    const matchResult = await matchPagBankLancamento(t, proprietarioDaConfiguracao);
                    if (matchResult.matched && matchResult.lancamentoId) {
                        transacoesPagBank.push(matchResult.lancamentoId);
                        console.log(`Transação PagBank identificada e vinculada: ${t.descricao} -> Lançamento ${matchResult.lancamentoId}`);
                    }
                }
            }

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

            // 1.1. NOVO: Marcar lançamentos PagBank como conciliados
            if (transacoesPagBank.length > 0) {
                const { error: conciliacaoError } = await supabase
                    .from('lancamentos')
                    .update({ conciliado: true })
                    .in('id', transacoesPagBank);
                
                if (conciliacaoError) {
                    console.error('Aviso: Falha ao marcar lançamentos PagBank como conciliados:', conciliacaoError);
                } else {
                    console.log(`${transacoesPagBank.length} lançamentos PagBank marcados como conciliados automaticamente.`);
                }
            }
            
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
                usuario_id: usuarioId,
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
    }, [contaSelecionadaId, proprietarioDaConfiguracao, file, fileHash, transacoes, usuarioId, fetchHistorico, handleReset, contaSelecionada?.plano_contas?.id]);

    const handleDeleteHistorico = useCallback(async () => {
        if (!usuarioId) return;
        
        setIsDeletingHistorico(true);
        
        try {
            const { error } = await supabase
                .from('conciliacoes')
                .delete()
                .eq('empresa_id', usuarioId);
                
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
        handleParseFile,
        handleSaveConciliacao,
        handleDeleteHistorico,
    };
}