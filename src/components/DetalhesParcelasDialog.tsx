// ... (código omitido)
  const handleUndoPayment = async (parcela: Parcela) => {
    if (!usuario?.id || !conta) return;
    setIsUndoing(true);
    
    const ownerId = conta.empresa_id;
    const contaReceberId = conta.id;
    const contaReceberIdShort = contaReceberId.substring(0, 8);
    
    try {
        // 1. Buscar o registro de recebimento associado
// ... (código omitido)
        
        const totalEstornado = recebimentos.reduce((sum, r) => sum + r.valor_recebido, 0);
        const dataEstornoISO = new Date().toISOString();
        
        // 2. Gerar Lançamentos de Estorno (Reversão)
        
        // 2.1. Débito (Clientes/Direito a Receber) - D: CLIENTES (AUMENTA O DIREITO A RECEBER)
        if (conta.id_conta_patrimonial) {
            const lancamentoEstornoPatrimonial = {
                proprietario_id: ownerId,
                data_movimentacao: dataEstornoISO,
                descricao: `Estorno Recebimento CR: ${conta.descricao} (CR ID: ${contaReceberIdShort})`,
                valor: totalEstornado,
                tipo: 'Entrada' as const, // Entrada no Ativo (Débito) para restaurar o direito - CORRECT
                conta_bancaria_id: null,
                conta_contabil_id: conta.id_conta_patrimonial,
                origem: 'estorno_recebimento_manual',
                historico_id: recebimentos[0].historico_id,
            };
            await supabase.from('lancamentos').insert(lancamentoEstornoPatrimonial);
        }
        
        // 2.2. Crédito (Caixa/Banco) - C: CAIXA/BANCO (DIMINUI O CAIXA)
        // Precisamos buscar o conta_contabil_id da conta de saldo (Caixa/Banco)
// ... (código omitido)
        
        for (const recebimento of recebimentos) {
            const contaContabilCaixaBanco = saldoContaMap[recebimento.conta_id];
            
            if (!contaContabilCaixaBanco) {
                console.warn(`Aviso: Conta de saldo ${recebimento.conta_id} sem vínculo contábil para estorno.`);
                continue;
            }
            
            const lancamentoEstornoAtivo = {
                proprietario_id: ownerId,
                data_movimentacao: dataEstornoISO,
                descricao: `Estorno Recebimento Ativo CR: ${conta.clientes?.nome || 'N/A'} (Parcela ID: ${parcela.id.substring(0, 8)})`,
                valor: recebimento.valor_recebido,
                tipo: 'Saida' as const, // Saída do Ativo (Crédito) para diminuir o saldo - CORRECT
                conta_bancaria_id: recebimento.conta_id,
                conta_contabil_id: contaContabilCaixaBanco, // <-- USANDO CONTA CONTÁBIL DO SALDO
                origem: 'estorno_recebimento_manual',
                historico_id: recebimento.historico_id,
            };
            await supabase.from('lancamentos').insert(lancamentoEstornoAtivo);
        }
        
        // 3. Deletar Registros de Recebimento
// ... (código omitido)