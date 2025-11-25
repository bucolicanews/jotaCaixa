// ... (imports)

// ... (interfaces)

// Função auxiliar para calcular um hash simples do conteúdo do CSV (ignorando a primeira linha)
// REMOVIDA: calculateContentHash não é mais usada para duplicidade de arquivo.


export function useConciliacao(): ConciliacaoHook {
    const { usuario } = useSessao();
    
    // --- Estados ---
// ... (restante dos estados)

    // --- Funções de Busca de Dados ---

// ... (fetchContas, fetchConfigs, fetchContasContabeis, fetchRegras, fetchHistorico)

    // --- Lógica de Mapeamento e Processamento ---

    const applyRegras = useCallback((rawTransacoes: TransacaoExtrato[]): TransacaoExtrato[] => {
// ... (applyRegras)
    }, [regras]);

    // --- Handlers de Estado ---

// ... (handleReset, handleSelectAccount, handleSelectConfig, handleFileChange, handleContaContabilChange, handleToggleSelection, handleSelectAll, handleContaContabilLoteChange, handleApplyLote, handleViewHistoricoDetails, handleSetHistoricoDetalhesOpen)

    // --- Lógica de Processamento de Arquivo ---

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
            const formattedDate = formatDDMMYYYYToISO(e.data);
            // CRÍTICO: Normaliza a descrição do banco de dados
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
        
        // 1. Ler o conteúdo do arquivo (apenas para fins de log/hash futuro)
        const fileContent = await file.text();
        
        // 2. Buscar extratos existentes na nova tabela 'extratos'
        const existingExtratosSet = await fetchExistingExtratos(contaSelecionadaId, proprietarioDaConfiguracao);
        
        // 3. Processar o CSV
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
                    
                    // CRÍTICO: Normaliza a descrição da transação importada
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
    }, [file, configSelecionada, contaSelecionadaId, proprietarioDaConfiguracao, applyRegras, fetchExistingExtratos]);

    // --- Lógica de Salvamento ---

    const handleSaveConciliacao = useCallback(async () => {
        if (!contaSelecionadaId || !proprietarioDaConfiguracao || !file) {
            showError('Conta bancária, proprietário ou arquivo não definidos.');
            return;
        }
        
        // 1. Buscar a conta contábil do saldo_contas (Ativo/Caixa)
        const { data: contaAtivoData } = await supabase
            .from('saldo_contas')
            .select('conta_contabil_id')
            .eq('id', contaSelecionadaId)
            .single();
            
        const contaAtivoCaixaId = contaAtivoData?.conta_contabil_id;
        
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
                const formattedDate = formatDDMMYYYYToISO(t.data);
                const valor = Math.abs(t.valor);
                
                // Transação 1: Movimentação de Caixa/Banco (Ativo)
                // Ativo é Devedora: Entrada (Débito) = 'Entrada', Saída (Crédito) = 'Saida'
                const lancamentoAtivo = {
                    proprietario_id: proprietarioDaConfiguracao,
                    data_movimentacao: formattedDate || t.data,
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
                // Resultado é Credora: Entrada (Débito) = 'Entrada', Saída (Crédito) = 'Saida'
                let tipoResultado: 'Entrada' | 'Saida';
                
                if (t.tipo === 'Entrada') {
                    // Entrada (Receita): D: Ativo, C: Receita -> Receita é Credora, então C = 'Saida'
                    tipoResultado = 'Saida';
                } else {
                    // Saída (Despesa): D: Despesa, C: Ativo -> Despesa é Credora, então D = 'Entrada'
                    tipoResultado = 'Entrada';
                }
                
                const lancamentoResultado = {
                    proprietario_id: proprietarioDaConfiguracao,
                    data_movimentacao: formattedDate || t.data,
                    descricao: t.descricao,
                    valor: valor,
                    tipo: tipoResultado, // Tipo ajustado para a conta de Resultado
                    conta_bancaria_id: null, // Não é conta bancária
                    conta_contabil_id: t.conta_contabil_id, // Conta de Resultado (Receita/Despesa)
                    conciliado: true,
                    origem: 'conciliacao_extrato',
                    documento: t.identificacao || null,
                };
                
                return [lancamentoAtivo, lancamentoResultado];
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
            const fileContent = await file.text();
            // O hash do conteúdo é calculado aqui, mas não é mais usado para duplicidade de arquivo
            const contentHash = file.name; // Usando o nome do arquivo como hash para fins de histórico
            
            const historicoPayload = {
                empresa_id: proprietarioDaConfiguracao,
                usuario_id: usuario?.id,
                id_saldo_contas: contaSelecionadaId,
                nome_arquivo: file.name,
                extrato_json: transacoesParaSalvar,
                extrato_hash: contentHash, // Salva o nome do arquivo como hash
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