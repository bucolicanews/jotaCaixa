import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Save, List, ArrowUpCircle, ArrowDownCircle, Check, CheckCircle2, AlertTriangle } from 'lucide-react';
import { TransacaoExtrato } from '@/types/conciliacao';
import { PlanoContas } from '@/types/plano-contas';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface Step4MappingTableProps {
  transacoes: TransacaoExtrato[]; // Contém transações válidas E rejeitadas
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
}) => {
  
  const transacoesValidas = transacoes.filter(t => !t.isDuplicated);
  const transacoesRejeitadas = transacoes.filter(t => t.isDuplicated);
  const transacoesNaoConciliadas = transacoesValidas.filter(t => !t.conta_contabil_id);
  
  const allValidSelected = transacoesSelecionadas.length === transacoesValidas.length && transacoesValidas.length > 0;

  return (
    <Card className="col-span-1 md:col-span-3 h-full flex flex-col">
      <CardHeader><CardTitle className="flex items-center"><List className="w-5 h-5 mr-2" /> Transações Importadas do Extrato ({transacoes.length})</CardTitle></CardHeader>
      <CardContent className="flex-1 flex flex-col">
        
        {/* Alerta de Duplicidade (Topo) */}
        {transacoesRejeitadas.length > 0 && (
            <div className="p-3 bg-red-100 dark:bg-red-900/20 border border-red-500 rounded-md mb-4">
                <h3 className="font-semibold text-red-700 dark:text-red-300 flex items-center">
                    <AlertTriangle className="w-5 h-5 mr-2" /> {transacoesRejeitadas.length} Transações Rejeitadas (Duplicidade)
                </h3>
                <ul className="list-disc list-inside text-sm text-red-600 dark:text-red-400 mt-1">
                    {transacoesRejeitadas.map((t, index) => (
                        <li key={index}>Linha {index + 1}: {t.data} - {t.descricao} ({formatCurrency(Math.abs(t.valor))})</li>
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
        <div className="overflow-x-auto overflow-y-auto flex-1 border rounded-md max-h-[70vh]"> 
          <Table>
            <TableHeader><TableRow>
                <TableHead className="w-[40px] text-center">
                    <Checkbox 
                        checked={allValidSelected}
                        onCheckedChange={(checked) => onSelectAll(!!checked)}
                        disabled={isSaving || transacoesValidas.length === 0}
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
                    const isDuplicated = t.isDuplicated;
                    const isDisabled = isSaving || isDuplicated;
                    
                    return (
                        <TableRow 
                            key={i} 
                            className={cn(
                                isDuplicated ? 'bg-red-500/30 opacity-60' : (isMapeada ? 'bg-green-500/10' : 'bg-red-500/10'), 
                                isSelected && 'bg-blue-100/50 dark:bg-blue-900/20'
                            )}
                        >
                            <TableCell className="text-center">
                                <Checkbox 
                                    checked={isSelected}
                                    onCheckedChange={(checked) => onToggleSelection(i, !!checked)}
                                    disabled={isDisabled}
                                />
                            </TableCell>
                            <TableCell className="text-xs">{t.data}</TableCell>
                            <TableCell className="text-sm">{t.descricao}</TableCell>
                            <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">{t.identificacao || '-'}</TableCell>
                            <TableCell>
                                <Badge variant={t.tipo === 'Entrada' ? 'success' : 'destructive'} className="flex items-center justify-center">
                                    {t.tipo === 'Entrada' ? <ArrowUpCircle className="w-3 h-3 mr-1" /> : <ArrowDownCircle className="w-3 h-3 mr-1" />}
                                    {t.tipo}
                                </Badge>
                            </TableCell>
                            <TableCell className={cn("text-right font-semibold text-sm", t.tipo === 'Entrada' ? 'text-green-600' : 'text-red-600')}>{formatCurrency(Math.abs(t.valor))}</TableCell>
                            <TableCell>
                                {isDuplicated ? (
                                    <span className="text-xs font-medium text-red-700 flex items-center">
                                        <AlertTriangle className="w-4 h-4 mr-1" /> DUPLICADA
                                    </span>
                                ) : isMapeada ? (
                                    <span className="text-xs font-medium text-green-700 flex items-center">
                                        <CheckCircle2 className="w-4 h-4 mr-1" /> {contaContabil?.Conta}
                                    </span>
                                ) : (
                                    <Select 
                                        onValueChange={(id) => onContaContabilChange(i, id)}
                                        value={t.conta_contabil_id || undefined}
                                        disabled={isDisabled}
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
                disabled={isSaving || transacoesValidas.filter(t => t.conta_contabil_id).length === 0}
                className="w-full sm:w-auto"
            >
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Salvar Lançamentos Conciliados
            </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default Step4MappingTable;