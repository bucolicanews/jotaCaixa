
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Save, List, ArrowUpCircle, ArrowDownCircle, Check, CheckCircle2, AlertTriangle, Link } from 'lucide-react';
import { TransacaoExtrato } from '@/types/conciliacao';
import { PlanoContas } from '@/types/plano-contas';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ModalMapeamentoParcelas } from './ModalMapeamentoParcelas';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showSuccess, showError } from '@/utils/toast';

interface Step4MappingTableProps {
  transacoes: TransacaoExtrato[];
  contasContabeis: PlanoContas[];
  transacoesSelecionadas: number[];
  contaContabilLote: string | null;
  isSaving: boolean;
  
  onToggleSelection: (index: number, checked: boolean) => void;
  onSelectAll: (checked: boolean) => void;
  onContaContabilChange: (index: number, id: string) => void;
  onContaContabilLoteChange: (id: string) => void;
  onApplyLote: () => void;
  onSaveConciliacao: () => void;
  onMapeamentoParcelas?: (transacao: TransacaoExtrato, index: number) => void;
}

const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const Step4MappingTable: React.FC<Step4MappingTableProps> = ({
  transacoes,
  contasContabeis,
  transacoesSelecionadas,
  contaContabilLote,
  isSaving,
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
  
  const { usuario, role } = useSessao();
  
  const transacoesNaoConciliadas = transacoes.filter(t => !t.conta_contabil_id && !t.isDuplicated);
  const transacoesRejeitadas = transacoes.filter(t => t.isDuplicated);
  const transacoesValidas = transacoes.filter(t => !t.isDuplicated);
  
  const allValidSelected = transacoesSelecionadas.length === transacoesValidas.length && transacoesValidas.length > 0;
  
  // Handler para abrir modal de mapeamento de parcelas
  const handleAbrirMapeamentoParcelas = (transacao: TransacaoExtrato, index: number) => {
    // Criar objeto completo com id (usar index como fallback se não houver id)
    const transacaoCompleta = {
      ...transacao,
      id: `temp-${index}` // Temporário, será substituído após salvar no banco
    };
    
    setTransacaoSelecionada({ transacao: transacaoCompleta, index });
    setModalMapeamentoOpen(true);
  };
  
  // Handler de confirmação do mapeamento
  const handleConfirmarMapeamento = async (mapeamentos: any[], valorRestante?: any) => {
    if (!transacaoSelecionada) return;
    
    try {
      // 1. Salvar vínculos em extrato_parcela_vinculo
      const vinculosPromises = mapeamentos.map(async (m) => {
        const { data, error } = await supabase
          .from('extrato_parcela_vinculo')
          .insert({
            transacao_extrato_id: transacaoSelecionada.transacao.id,
            parcela_id: m.parcelaId,
            tipo_parcela: m.tipo,
            valor_aplicado: m.valorAplicar,
            usuario_vinculacao_id: usuario?.id
          });
        
        if (error) throw error;
        return data;
      });
      
      await Promise.all(vinculosPromises);
      
      // 2. Atualizar parcelas com vinculada_extrato = true
      const parcelasPromises = mapeamentos.map(async (m) => {
        const tabela = m.tipo === 'CR' 
          ? (role === 'Admin' ? 'admin_parcelas_receber' : 'parcelas_contas_receber')
          : (role === 'Admin' ? 'admin_parcelas_pagar' : 'parcelas_contas_pagar');
        
        const { error } = await supabase
          .from(tabela)
          .update({ 
            vinculada_extrato: true,
            valor_vinculado: m.valorAplicar
          })
          .eq('id', m.parcelaId);
        
        if (error) throw error;
      });
      
      await Promise.all(parcelasPromises);
      
      // 3. Se houver valor restante, criar lançamento avulso
      if (valorRestante && valorRestante.valor > 0) {
        const { error } = await supabase
          .from('conciliacao_lancamentos_avulsos')
          .insert({
            transacao_extrato_id: transacaoSelecionada.transacao.id,
            conta_contabil_id: valorRestante.contaContabilId,
            valor: valorRestante.valor,
            descricao: valorRestante.descricao || 'Diferença de conciliação',
            tipo: transacaoSelecionada.transacao.tipo === 'Entrada' ? 'ENTRADA' : 'SAIDA',
            usuario_id: usuario?.id
          });
        
        if (error) throw error;
      }
      
      // 4. Atualizar status da transação do extrato
      const valorTotal = mapeamentos.reduce((acc, m) => acc + m.valorAplicar, 0) + (valorRestante?.valor || 0);
      const statusConciliacao = valorTotal >= Math.abs(transacaoSelecionada.transacao.valor) 
        ? 'CONCILIADA' 
        : 'PARCIALMENTE_CONCILIADA';
      
      const { error: extratoError } = await supabase
        .from('extratos')
        .update({
          status_conciliacao: statusConciliacao,
          valor_conciliado: valorTotal
        })
        .eq('id', transacaoSelecionada.transacao.id);
      
      if (extratoError) throw extratoError;
      
      // 5. Mostrar sucesso e fechar modal
      showSuccess(`Conciliação realizada com sucesso! ${mapeamentos.length} parcela(s) vinculada(s).`);
      
      setModalMapeamentoOpen(false);
      setTransacaoSelecionada(null);
      
      // 6. Opcional: atualizar UI removendo linha conciliada
      if (onMapeamentoParcelas) {
        onMapeamentoParcelas(transacaoSelecionada.transacao, transacaoSelecionada.index);
      }
      
    } catch (erro: any) {
      console.error('Erro ao salvar mapeamento:', erro);
      showError('Erro ao salvar conciliação: ' + (erro.message || 'Erro desconhecido'));
    }
  };
  
  // No futuro, isso virá do backend
  const temSugestaoDisponivel = (transacao: TransacaoExtrato): boolean => {
    // Por enquanto, retornar false
    // Será implementado quando o backend retornar essa informação
    return false;
  };

  return (
    <>
    <Card className="col-span-1 md:col-span-3">
      <CardHeader><CardTitle className="flex items-center"><List className="w-5 h-5 mr-2" /> Transações Importadas do Extrato</CardTitle></CardHeader>
      <CardContent>
        
        {transacoesRejeitadas.length > 0 && (
            <div className="p-3 bg-red-100 dark:bg-red-900/20 border border-red-500 rounded-md mb-4">
                <h3 className="font-semibold text-red-700 dark:text-red-300 flex items-center mb-2">
                    <AlertTriangle className="w-5 h-5 mr-2" /> {transacoesRejeitadas.length} Transações Rejeitadas (Duplicidade)
                </h3>
                <ul className="list-disc list-inside text-sm text-red-600 dark:text-red-400">
                    {transacoesRejeitadas.map((t, i) => (
                        <li key={i}>
                            Linha {transacoes.indexOf(t) + 1}: {t.data} - {t.descricao} ({formatCurrency(Math.abs(t.valor))})
                        </li>
                    ))}
                </ul>
            </div>
        )}
        
        {/* Ações em Lote (Responsivo) */}
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
        
        {/* Tabela de Mapeamento (Scrollable) */}
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
                          t.isDuplicated ? 'bg-red-500/30 opacity-60' : 
                          (isMapeada ? 'bg-green-500/10' : 'bg-red-500/10'),
                          isSelected && 'bg-blue-100/50 dark:bg-blue-900/20',
                          temSugestaoDisponivel(t) && 'border-l-4 border-l-green-500'
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
                              {temSugestaoDisponivel(t) && (
                                <Badge variant="success" className="ml-2 text-xs">
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
                                    <span className="text-xs font-medium text-red-700 flex items-center">
                                        <AlertTriangle className="w-4 h-4 mr-1" /> DUPLICADA
                                    </span>
                                ) : isMapeada ? (
                                    <span className="text-xs font-medium text-green-700 flex items-center">
                                        <CheckCircle2 className="w-4 h-4 mr-1" /> {contaContabil?.Conta}
                                    </span>
                                ) : (
                                    <div className="flex flex-col gap-2">
                                      {/* Botão NOVO: Mapear Parcelas */}
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleAbrirMapeamentoParcelas(t, i)}
                                        disabled={isSaving}
                                        className="w-full justify-start text-xs h-8"
                                      >
                                        <Link className="w-3 h-3 mr-1" />
                                        Mapear Parcelas
                                      </Button>
                                      
                                      {/* Select existente: Mapear para Conta Contábil */}
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
        
        {/* Rodapé de Salvamento (Responsivo) */}
        <div className="flex flex-col sm:flex-row justify-between items-center pt-4 border-t space-y-2 sm:space-y-0">
            <p className="text-sm text-muted-foreground">
                {transacoesNaoConciliadas.length} transações pendentes de mapeamento.
            </p>
            <Button 
                onClick={onSaveConciliacao} 
                disabled={isSaving || transacoes.filter(t => t.conta_contabil_id && !t.isDuplicated).length === 0}
                className="w-full sm:w-auto"
            >
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Salvar Lançamentos Conciliados
            </Button>
        </div>
      </CardContent>
    </Card>
    
    {/* Modal de Mapeamento de Parcelas */}
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
