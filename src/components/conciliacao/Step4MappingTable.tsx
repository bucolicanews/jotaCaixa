import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Save, List, ArrowUpCircle, ArrowDownCircle, Check, CheckCircle2, Link, Sparkles, AlertCircle } from 'lucide-react';
import { TransacaoExtrato } from '@/types/conciliacao';
import { PlanoContas } from '@/types/plano-contas';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ModalMapeamentoParcelas } from './ModalMapeamentoParcelas';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { useOwner } from '@/hooks/use-owner';
import { showSuccess, showError } from '@/utils/toast';

interface Step4MappingTableProps {
  transacoes: TransacaoExtrato[];
  contasContabeis: PlanoContas[];
  transacoesSelecionadas: number[];
  contaContabilLote: string | null;
  isSaving: boolean;
  contaSelecionadaId?: string | null;
  saldoAnterior?: number;
  
  onToggleSelection: (index: number, checked: boolean) => void;
  onSelectAll: (checked: boolean) => void;
  onContaContabilChange: (index: number, id: string) => void;
  onContaContabilLoteChange: (id: string) => void;
  onApplyLote: () => void;
  onSaveConciliacao: () => void;
  onMapeamentoParcelas?: (transacao: TransacaoExtrato, index: number) => void;
}

const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const converterDataParaISO = (dataBR: string): string => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dataBR)) return dataBR;
  const partes = dataBR.split('/');
  if (partes.length === 3) {
    const [dia, mes, ano] = partes;
    return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
  }
  const data = new Date(dataBR);
  if (!isNaN(data.getTime())) return data.toISOString().split('T')[0];
  return dataBR;
};

const Step4MappingTable: React.FC<Step4MappingTableProps> = ({
  transacoes,
  contasContabeis,
  transacoesSelecionadas,
  contaContabilLote,
  isSaving,
  contaSelecionadaId,
  saldoAnterior = 0,
  onToggleSelection,
  onSelectAll,
  onContaContabilChange,
  onContaContabilLoteChange,
  onApplyLote,
  onSaveConciliacao,
  onMapeamentoParcelas,
}) => {
  
  const [modalMapeamentoOpen, setModalMapeamentoOpen] = useState(false);
  const [transacaoSelecionada, setTransacaoSelecionada] = useState<{ transacao: TransacaoExtrato & { id: string }, index: number } | null>(null);
  
  const { usuario } = useSessao();
  const { ownerId, ownerType } = useOwner();
  const isAdmin = ownerType === 'Admin' || ownerType === 'AdminUsuario';
  
  const transacoesNaoConciliadas = transacoes.filter(t => !t.conta_contabil_id && !t.isDuplicated);
  const transacoesJaMapeadas = transacoes.filter(
    t => t.isDuplicated && t.motivoDuplicidade?.includes('Parcelas já mapeadas')
  );
  const transacoesDuplicadasSimples = transacoes.filter(
    t => t.isDuplicated && !t.motivoDuplicidade?.includes('Parcelas já mapeadas')
  );

  const resumo = useMemo(() => {
    const validas = transacoes.filter(t => !t.isDuplicated);
    const entradas = validas
      .filter(t => t.tipo === 'Entrada')
      .reduce((acc, t) => acc + Math.abs(t.valor), 0);
    const saidas = validas
      .filter(t => t.tipo === 'Saida')
      .reduce((acc, t) => acc + Math.abs(t.valor), 0);
    return { entradas, saidas, saldo: entradas - saidas };
  }, [transacoes]);
  const transacoesValidas = transacoes.filter(t => !t.isDuplicated);
  
  const allValidSelected = transacoesSelecionadas.length === transacoesValidas.length && transacoesValidas.length > 0;
  
  const handleAbrirMapeamentoParcelas = async (transacao: TransacaoExtrato, index: number) => {
    try {
      if (transacao.id) {
        const { data: extratoExistente } = await supabase
          .from('extratos')
          .select('id, empresa_id, id_saldo_contas')
          .eq('id', transacao.id)
          .single();
        const transacaoCompleta = { ...transacao, ...(extratoExistente || {}) } as TransacaoExtrato & { id: string };
        setTransacaoSelecionada({ transacao: transacaoCompleta, index });
        setModalMapeamentoOpen(true);
        return;
      }
      
      if (!contaSelecionadaId) {
        showError('Erro: Nenhuma conta bancária selecionada.');
        return;
      }
      
      if (!ownerId) {
        showError('Erro: Usuário não identificado. Faça login novamente.');
        return;
      }
      
      const dadosInsert: any = {
        empresa_id: ownerId,
        id_saldo_contas: contaSelecionadaId,
        data: converterDataParaISO(transacao.data),
        descricao: transacao.descricao,
        valor: transacao.valor,
        tipo: transacao.tipo,
        identificacao: transacao.identificacao,
        status_conciliacao: 'PENDENTE',
        conciliado: false,
        valor_conciliado: 0,
      };
      
      const { data: extratoSalvo, error } = await supabase
        .from('extratos')
        .insert(dadosInsert)
        .select()
        .single();
      
      if (error) {
        showError('Erro ao salvar transação: ' + error.message);
        return;
      }
      
      const transacaoComId = {
        ...transacao,
        id: extratoSalvo.id,
        empresa_id: extratoSalvo.empresa_id,
        id_saldo_contas: extratoSalvo.id_saldo_contas,
      };
      setTransacaoSelecionada({ transacao: transacaoComId as TransacaoExtrato & { id: string }, index });
      setModalMapeamentoOpen(true);
      
    } catch (erro: any) {
      showError('Erro ao preparar mapeamento: ' + (erro.message || 'Erro desconhecido'));
    }
  };
  
  const handleConfirmarMapeamento = async (
    mapeamentos: any[],
    valorRestante?: any,
    modoExcedente: 'restante' | 'redistribuir' = 'restante',
    opcoes?: { ehBancoPuro: boolean }
  ) => {
    if (!transacaoSelecionada) return;
    const ehBancoPuro = opcoes?.ehBancoPuro ?? false;

    try {
      const mapeamentosMutaveis = mapeamentos.map(m => ({
        ...m,
        valorAplicar: Number(m.valorAplicar || 0),
      }));

      let excedenteAcumulado = 0;
      let valorTotalAplicado = 0;

      for (let i = 0; i < mapeamentosMutaveis.length; i++) {
        const m = mapeamentosMutaveis[i];

        if (modoExcedente === 'redistribuir' && excedenteAcumulado > 0) {
          m.valorAplicar = m.valorAplicar + excedenteAcumulado;
          excedenteAcumulado = 0;
        }

        const tabela = m.tipo === 'CR'
          ? (isAdmin ? 'admin_parcelas_receber' : 'parcelas_contas_receber')
          : (isAdmin ? 'admin_parcelas_pagar' : 'parcelas_contas_pagar');

        const { data: parcelaAtual, error: errorBusca } = await supabase
          .from(tabela)
          .select(`valor_parcela, valor_pago, valor_vinculado, status, data_pagamento, ${m.tipo === 'CR' ? 'conta_receber_id' : 'conta_pagar_id'}`)
          .eq('id', m.parcelaId)
          .single();

        if (errorBusca) throw errorBusca;

        const valorPagoAtual = Number(parcelaAtual.valor_pago || 0);
        const valorParcela = Number(parcelaAtual.valor_parcela || 0);
        const valorVinculadoAtual = Number(parcelaAtual.valor_vinculado || 0);

        const saldoRestante = valorParcela - valorPagoAtual;
        const valorAplicadoReal = saldoRestante > 0 ? Math.min(m.valorAplicar, saldoRestante) : 0;
        const excedenteAtual = m.valorAplicar - valorAplicadoReal;

        if (excedenteAtual > 0.001) {
          if (modoExcedente === 'redistribuir' && i < mapeamentosMutaveis.length - 1) {
            excedenteAcumulado += excedenteAtual;
          } else {
            excedenteAcumulado += excedenteAtual;
          }
        }

        if (valorAplicadoReal <= 0) continue;

        valorTotalAplicado += valorAplicadoReal;

        let idContaResultado: string | null = null;
        const tabelaConta = m.tipo === 'CR' ? 'admin_contas_receber' : 'admin_contas_pagar';
        const fkConta = m.tipo === 'CR' ? parcelaAtual.conta_receber_id : parcelaAtual.conta_pagar_id;
        if (fkConta) {
          const { data: contaData } = await supabase
            .from(tabelaConta)
            .select('id_conta_resultado')
            .eq('id', fkConta)
            .single();
          idContaResultado = contaData?.id_conta_resultado || null;
        }

        const jaQuitada = (m.tipo === 'CR' ? parcelaAtual.status === 'recebida' : parcelaAtual.status === 'paga') && !!parcelaAtual.data_pagamento;
        let jaTemBaixa = false;
        if (jaQuitada) {
          const tabelaPgtoVerif = m.tipo === 'CR' ? 'admin_recebimentos' : 'admin_pagamentos';
          const { data: baixaExistente } = await supabase
            .from(tabelaPgtoVerif)
            .select('id')
            .eq('parcela_id', m.parcelaId)
            .limit(1);
          jaTemBaixa = (baixaExistente?.length ?? 0) > 0;
        }

        const { error: errorVinculo } = await supabase
          .from('extrato_parcela_vinculo')
          .insert({
            transacao_extrato_id: transacaoSelecionada.transacao.id,
            parcela_id: m.parcelaId,
            tipo_parcela: m.tipo,
            valor_aplicado: valorAplicadoReal,
            usuario_vinculacao_id: usuario?.id,
            data_vinculacao: new Date().toISOString(),
            empresa_id: transacaoSelecionada.transacao.empresa_id || ownerId,
          });
        if (errorVinculo) throw errorVinculo;

        const novoValorPago = valorPagoAtual + valorAplicadoReal;
        const quitou = novoValorPago >= valorParcela;
        const novoStatus = quitou
          ? (m.tipo === 'CR' ? 'recebida' : 'paga')
          : 'parcialmente_paga';
        const dataBaixa = quitou
          ? converterDataParaISO(transacaoSelecionada.transacao.data)
          : null;

        const updateData: any = {
          vinculada_extrato: true,
          valor_vinculado: valorVinculadoAtual + valorAplicadoReal,
          valor_pago: novoValorPago,
          status: novoStatus,
        };
        if (dataBaixa) updateData.data_pagamento = dataBaixa;

        const { error: errorUpdate } = await supabase
          .from(tabela).update(updateData).eq('id', m.parcelaId);
        if (errorUpdate) throw errorUpdate;

        if (!jaTemBaixa) {
          const tabelaPagamento = m.tipo === 'CR'
            ? (isAdmin ? 'admin_recebimentos' : 'recebimentos')
            : (isAdmin ? 'admin_pagamentos' : 'pagamentos');

          const dataMovimentacao = converterDataParaISO(transacaoSelecionada.transacao.data);
          const dadosPagamento: any = { parcela_id: m.parcelaId, conta_id: contaSelecionadaId };
          if (isAdmin && ownerId) dadosPagamento.admin_id = ownerId;
          if (idContaResultado) dadosPagamento.id_conta_contabil = idContaResultado;

          if (m.tipo === 'CR') {
            dadosPagamento.valor_recebido    = valorAplicadoReal;
            dadosPagamento.data_recebimento  = dataMovimentacao;
            dadosPagamento.tipo_recebimento  = 'TRANSFERENCIA_BANCARIA';
            dadosPagamento.forma_pagamento   = 'PIX';
          } else {
            dadosPagamento.valor_pago        = valorAplicadoReal;
            dadosPagamento.data_pagamento    = dataMovimentacao;
            dadosPagamento.tipo_pagamento    = 'TRANSFERENCIA_BANCARIA';
            dadosPagamento.forma_pagamento   = 'PIX';
          }

          const { error: errorPagamento } = await supabase.from(tabelaPagamento).insert(dadosPagamento);
          if (errorPagamento) throw errorPagamento;

          if (idContaResultado) {
            const { error: errorLancamento } = await supabase.from('lancamentos').insert({
              proprietario_id: transacaoSelecionada.transacao.empresa_id || ownerId,
              data_movimentacao: converterDataParaISO(transacaoSelecionada.transacao.data),
              descricao: `Conciliação: ${transacaoSelecionada.transacao.descricao || ''}`.trim(),
              valor: valorAplicadoReal,
              tipo: transacaoSelecionada.transacao.tipo,
              conta_bancaria_id: transacaoSelecionada.transacao.id_saldo_contas || contaSelecionadaId,
              conta_contabil_id: idContaResultado,
              conciliado: true,
              origem: 'conciliacao_extrato_parcela',
              documento: transacaoSelecionada.transacao.id,
            });
            if (errorLancamento) throw errorLancamento;
          }
        }
      }

      let valorRestanteAjustado = valorRestante;
      if (excedenteAcumulado > 0.001 && valorRestanteAjustado?.contaContabilId) {
        valorRestanteAjustado = {
          ...valorRestanteAjustado,
          valor: valorRestanteAjustado.valor + excedenteAcumulado,
        };
      }

      const { data: contaAtual, error: errorConta } = await supabase
        .from('saldo_contas')
        .select('saldo_inicial')
        .eq('id', contaSelecionadaId)
        .single();

      if (errorConta) throw errorConta;

      const valorMovimentacao = transacaoSelecionada.transacao.tipo === 'Entrada' ? valorTotalAplicado : -valorTotalAplicado;
      const novoSaldo = Number(contaAtual.saldo_inicial || 0) + valorMovimentacao;

      await supabase.from('saldo_contas').update({ saldo_inicial: novoSaldo }).eq('id', contaSelecionadaId);

      if (valorRestanteAjustado && valorRestanteAjustado.valor > 0) {
        const { error: errorAvulso } = await supabase.from('conciliacao_lancamentos_avulsos').insert({
          transacao_extrato_id: transacaoSelecionada.transacao.id,
          conta_contabil_id: valorRestanteAjustado.contaContabilId,
          valor: valorRestanteAjustado.valor,
          descricao: valorRestanteAjustado.descricao || 'Diferença de conciliação',
          tipo: transacaoSelecionada.transacao.tipo === 'Entrada' ? 'ENTRADA' : 'SAIDA',
          usuario_id: usuario?.id,
          data_lancamento: new Date().toISOString(),
          empresa_id: transacaoSelecionada.transacao.empresa_id || ownerId,
        });
        if (errorAvulso) throw errorAvulso;

        if (valorRestanteAjustado.contaContabilId) {
          const { error: errorLancAvulso } = await supabase.from('lancamentos').insert({
            proprietario_id: transacaoSelecionada.transacao.empresa_id || ownerId,
            data_movimentacao: converterDataParaISO(transacaoSelecionada.transacao.data),
            descricao: valorRestanteAjustado.descricao || 'Diferença de conciliação',
            valor: valorRestanteAjustado.valor,
            tipo: transacaoSelecionada.transacao.tipo,
            conta_bancaria_id: transacaoSelecionada.transacao.id_saldo_contas || contaSelecionadaId,
            conta_contabil_id: valorRestanteAjustado.contaContabilId,
            conciliado: true,
            origem: 'conciliacao_extrato_avulso',
            documento: transacaoSelecionada.transacao.id,
          });
          if (errorLancAvulso) throw errorLancAvulso;
        }
      }

      const valorTotal = valorTotalAplicado + (valorRestanteAjustado?.valor || 0);
      const statusConciliacao = ehBancoPuro
        ? 'PENDENTE'
        : valorTotal >= Math.abs(Number(transacaoSelecionada.transacao.valor))
          ? 'CONCILIADA'
          : 'PARCIALMENTE_CONCILIADA';

      await supabase.from('extratos').update({
        status_conciliacao: statusConciliacao,
        valor_conciliado: valorTotal,
        ...(ehBancoPuro ? {} : { conciliado: true }),
      }).eq('id', transacaoSelecionada.transacao.id);

      if (ehBancoPuro) {
        showSuccess(`Mapeamento registrado como pendência (tarifa/juros detectado). ${mapeamentosMutaveis.length} parcela(s) processada(s).`);
      } else {
        showSuccess(`Baixa realizada com sucesso! ${mapeamentosMutaveis.length} parcela(s) processada(s).`);
      }
      setModalMapeamentoOpen(false);
      setTransacaoSelecionada(null);

      if (onMapeamentoParcelas) onMapeamentoParcelas(transacaoSelecionada.transacao, transacaoSelecionada.index);

    } catch (erro: any) {
      showError('❌ Erro ao realizar baixa: ' + (erro.message || 'Erro desconhecido'));
    }
  };

  const saldoFinal = saldoAnterior + resumo.saldo;

  return (
    <>
    {transacoes.filter(t => !t.isDuplicated).length > 0 && (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 col-span-1 md:col-span-3 mb-2">
        <Card className="border-slate-200 bg-slate-50">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <List className="h-4 w-4 text-slate-600" />
              <span className="text-xs font-semibold text-slate-600">Saldo Anterior</span>
            </div>
            <p className={`text-lg font-bold font-mono ${saldoAnterior >= 0 ? 'text-slate-700' : 'text-red-600'}`}>{formatCurrency(saldoAnterior)}</p>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <ArrowUpCircle className="h-4 w-4 text-green-600" />
              <span className="text-xs font-semibold text-green-700">Total de Entradas</span>
            </div>
            <p className="text-lg font-bold text-green-700 font-mono">{formatCurrency(resumo.entradas)}</p>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <ArrowDownCircle className="h-4 w-4 text-red-600" />
              <span className="text-xs font-semibold text-red-700">Total de Saídas</span>
            </div>
            <p className="text-lg font-bold text-red-700 font-mono">{formatCurrency(resumo.saidas)}</p>
          </CardContent>
        </Card>
        <Card className={saldoFinal >= 0 ? 'border-blue-200 bg-blue-50' : 'border-orange-200 bg-orange-50'}>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <List className={`h-4 w-4 ${saldoFinal >= 0 ? 'text-blue-600' : 'text-orange-600'}`} />
              <span className={`text-xs font-semibold ${saldoFinal >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>Saldo Final</span>
            </div>
            <p className={`text-lg font-bold font-mono ${saldoFinal >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>{formatCurrency(saldoFinal)}</p>
          </CardContent>
        </Card>
      </div>
    )}
    <Card className="col-span-1 md:col-span-3">
      <CardHeader><CardTitle className="flex items-center"><List className="w-5 h-5 mr-2" /> Transações Importadas do Extrato</CardTitle></CardHeader>
      <CardContent>
        
        {transacoesJaMapeadas.length > 0 && (
            <div className="p-3 bg-emerald-100 dark:bg-emerald-900/20 border border-emerald-500 rounded-md mb-4">
                <h3 className="font-semibold text-emerald-700 dark:text-emerald-300 flex items-center mb-2">
                    <CheckCircle2 className="w-5 h-5 mr-2" /> {transacoesJaMapeadas.length} Transações Já Conciliadas por Mapeamento de Parcelas
                </h3>
                <ul className="list-disc list-inside text-sm text-emerald-600 dark:text-emerald-400">
                    {transacoesJaMapeadas.map((t, i) => (
                        <li key={i}>
                            {t.data} — {t.descricao} ({formatCurrency(Math.abs(t.valor))})
                        </li>
                    ))}
                </ul>
            </div>
        )}

        {transacoesDuplicadasSimples.length > 0 && (
            <div className="p-3 bg-green-100 dark:bg-green-900/20 border border-green-400 rounded-md mb-4">
                <h3 className="font-semibold text-green-700 dark:text-green-300 flex items-center mb-2">
                    <AlertCircle className="w-5 h-5 mr-2" /> {transacoesDuplicadasSimples.length} Transações Ignoradas (já existem no extrato)
                </h3>
                <ul className="list-disc list-inside text-sm text-green-600 dark:text-green-400">
                    {transacoesDuplicadasSimples.map((t, i) => (
                        <li key={i}>
                            {t.data} — {t.descricao} ({formatCurrency(Math.abs(t.valor))})
                        </li>
                    ))}
                </ul>
            </div>
        )}
        
        <div className="flex flex-col md:flex-row items-center space-y-3 md:space-y-0 md:space-x-4 p-3 bg-secondary rounded-md mb-4">
            <div className="flex-1 w-full">
                <Select 
                    onValueChange={onContaContabilLoteChange}
                    value={contaContabilLote || undefined}
                    disabled={isSaving || transacoesSelecionadas.length === 0}
                >
                    <SelectTrigger className="h-10 text-sm">
                        <SelectValue placeholder="Aplicar Conta Contábil em Lote" />
                    </SelectTrigger>
                    <SelectContent>
                        {contasContabeis.map(c => (
                            <SelectItem key={c.id} value={c.id}>
                                {c.Conta} - {c.Descricao}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <Button 
                onClick={onApplyLote} 
                disabled={isSaving || !contaContabilLote || transacoesSelecionadas.length === 0}
                className="w-full md:w-auto"
            >
                <Check className="w-4 h-4 mr-2" /> Aplicar ({transacoesSelecionadas.length})
            </Button>
        </div>
        
        <div className="overflow-x-auto max-h-[400px] border rounded-md">
          <Table>
            <TableHeader><TableRow>
                <TableHead className="w-[40px] text-center">
                    <Checkbox 
                        checked={allValidSelected}
                        onCheckedChange={(checked) => onSelectAll(!!checked)}
                        disabled={isSaving}
                    />
                </TableHead>
                <TableHead className="w-[80px]">Data</TableHead>
                <TableHead className="min-w-[150px]">Descrição</TableHead>
                <TableHead className="hidden sm:table-cell w-[100px]">Identificação</TableHead>
                <TableHead className="w-[80px]">Tipo</TableHead>
                <TableHead className="w-[100px] text-right">Valor</TableHead>
                <TableHead className="w-[250px] min-w-[200px]">Conta Contábil</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {transacoes.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center h-24">Nenhuma transação importada.</TableCell></TableRow>
              ) : (
                transacoes.map((t, i) => {
                    const isMapeada = !!t.conta_contabil_id;
                    const contaContabil = contasContabeis.find(c => c.id === t.conta_contabil_id);
                    const isSelected = transacoesSelecionadas.includes(i);
                    
                    return (
                        <TableRow key={i} className={cn(
                          t.isDuplicated ? 'bg-green-500/10 opacity-70' : 
                          (isMapeada ? 'bg-green-500/10' : 'bg-red-500/10'),
                          isSelected && 'bg-blue-100/50 dark:bg-blue-900/20',
                          t.tem_sugestao && 'border-l-4 border-l-green-500'
                        )}>
                            <TableCell className="text-center">
                                <Checkbox 
                                    checked={isSelected}
                                    onCheckedChange={(checked) => onToggleSelection(i, !!checked)}
                                    disabled={isSaving || t.isDuplicated}
                                />
                            </TableCell>
                            <TableCell className="text-xs">{t.data}</TableCell>
                            <TableCell className="text-sm">
                              {t.descricao}
                              {t.tem_sugestao && (
                                <Badge variant="success" className="ml-2 text-[10px] h-5 flex items-center gap-1">
                                  <Sparkles className="w-3 h-3" />
                                  Match Disponível
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">{t.identificacao || '-'}</TableCell>
                            <TableCell>
                                <Badge variant={t.tipo === 'Entrada' ? 'success' : 'destructive'} className="flex items-center justify-center">
                                    {t.tipo === 'Entrada' ? <ArrowUpCircle className="w-3 h-3 mr-1" /> : <ArrowDownCircle className="w-3 h-3 mr-1" />}
                                    {t.tipo}
                                </Badge>
                            </TableCell>
                            <TableCell className={cn("text-right font-semibold text-sm", t.tipo === 'Entrada' ? 'text-green-600' : 'text-red-600')}>{formatCurrency(Math.abs(t.valor))}</TableCell>
                            <TableCell>
                                {t.isDuplicated ? (
                                    <span className={`text-xs font-medium flex items-center ${t.motivoDuplicidade?.includes('Parcelas já mapeadas') ? 'text-emerald-700' : 'text-green-700'}`}>
                                        <CheckCircle2 className="w-4 h-4 mr-1" />
                                        {t.motivoDuplicidade?.includes('Parcelas já mapeadas') ? 'Parcelas Mapeadas' : 'Já Importada'}
                                    </span>
                                ) : isMapeada ? (
                                    <span className="text-xs font-medium text-green-700 flex items-center">
                                        <CheckCircle2 className="w-4 h-4 mr-1" />
                                        {t.conta_contabil_id === 'MAPEADO_PARCELAS' ? 'Parcelas Mapeadas' : contaContabil?.Conta}
                                    </span>
                                ) : (
                                    <div className="flex flex-col gap-2">
                                      <Button
                                        size="sm"
                                        variant={t.tem_sugestao ? "default" : "outline"}
                                        onClick={() => handleAbrirMapeamentoParcelas(t, i)}
                                        disabled={isSaving}
                                        className={cn("w-full justify-start text-xs h-8", t.tem_sugestao && "bg-green-600 hover:bg-green-700")}
                                      >
                                        <Link className="w-3 h-3 mr-1" />
                                        Mapear Parcelas
                                      </Button>
                                      
                                      <Select 
                                        onValueChange={(id) => onContaContabilChange(i, id)}
                                        value={t.conta_contabil_id || undefined}
                                        disabled={isSaving}
                                      >
                                        <SelectTrigger className="h-8 text-xs">
                                          <SelectValue placeholder="Mapear para Conta Contábil" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {contasContabeis.map(c => (
                                            <SelectItem key={c.id} value={c.id}>
                                              {c.Conta} - {c.Descricao}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                )}
                            </TableCell>
                        </TableRow>
                    );
                })
              )}
            </TableBody>
          </Table>
        </div>
        
        <div className="flex flex-col sm:flex-row justify-between items-center pt-4 border-t space-y-2 sm:space-y-0">
            <p className="text-sm text-muted-foreground">
                {transacoesNaoConciliadas.length} transações pendentes de mapeamento.
            </p>
            <Button 
                onClick={onSaveConciliacao} 
                disabled={isSaving || transacoes.filter(t => t.conta_contabil_id && t.conta_contabil_id !== 'MAPEADO_PARCELAS' && !t.isDuplicated).length === 0}
                className="w-full sm:w-auto"
            >
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Salvar Lançamentos Conciliados
            </Button>
        </div>
      </CardContent>
    </Card>
    
    {transacaoSelecionada && (
      <ModalMapeamentoParcelas
        open={modalMapeamentoOpen}
        onClose={() => {
          setModalMapeamentoOpen(false);
          setTransacaoSelecionada(null);
        }}
        transacao={transacaoSelecionada.transacao}
        onConfirmar={handleConfirmarMapeamento}
      />
    )}
    </>
  );
};

export default Step4MappingTable;