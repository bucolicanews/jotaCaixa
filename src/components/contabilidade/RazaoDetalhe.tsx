import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatarData } from '@/utils/formatters';
import { cn } from '@/lib/utils';
import { Loader2, Printer, BookOpen, Filter } from 'lucide-react';
import { DateRange } from 'react-day-picker';
import { Button } from '../ui/button';
import { usePrint } from '@/hooks/use-print';
import ReactDOMServer from 'react-dom/server';
import { useSessao } from '@/hooks/use-sessao';
import { showError } from '@/utils/toast';
import { format } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { useRazao } from '@/hooks/contabilidade/useRazao'; // Hook a ser criado
import RazaoPrint from './RazaoPrint'; // Componente de impressão a ser criado
import { PlanoContas } from '@/types/plano-contas';

interface RazaoDetalheProps {
  filtroPeriodo: DateRange | undefined;
}

const RazaoDetalhe: React.FC<RazaoDetalheProps> = ({ filtroPeriodo }) => {
  const { usuario } = useSessao();
  const { contas, lancamentosPorConta, contasContabeis, carregando } = useRazao(filtroPeriodo);
  const { printContent } = usePrint();
  
  const [contaSelecionadaId, setContaSelecionadaId] = useState('todos');
  
  const isPeriodSelected = filtroPeriodo?.from && filtroPeriodo?.to;

  const contasFiltradas = useMemo(() => {
      if (contaSelecionadaId === 'todos') return contas;
      return contas.filter(c => c.id === contaSelecionadaId);
  }, [contas, contaSelecionadaId]);
  
  const handlePrint = () => {
    if (!isPeriodSelected) {
        showError('Selecione um período completo para imprimir.');
        return;
    }
    
    if (contasFiltradas.length === 0) {
        showError('Nenhuma conta para imprimir.');
        return;
    }
    
    const printComponent = (
        <RazaoPrint
            filtroPeriodo={filtroPeriodo as DateRange}
            contas={contasFiltradas}
            lancamentosPorConta={lancamentosPorConta}
        />
    );

    const htmlContent = ReactDOMServer.renderToStaticMarkup(printComponent);
    printContent(htmlContent, `Livro Razão - ${format(filtroPeriodo.from!, 'MM/yyyy')}`, 'landscape');
  };

  if (carregando) {
    return (
      <Card className="mt-6">
        <CardContent className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }
  
  if (contas.length === 0) {
      return (
        <Card className="mt-6">
            <CardContent className="p-6 text-center text-muted-foreground">
                Nenhuma conta analítica encontrada no Plano de Contas.
            </CardContent>
        </Card>
      );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-xl flex items-center"><BookOpen className="w-5 h-5 mr-2" /> Livro Razão Detalhado</CardTitle>
            <div className="flex space-x-2">
                <Select value={contaSelecionadaId} onValueChange={setContaSelecionadaId}>
                    <SelectTrigger className="w-[250px]">
                        <Filter className="w-4 h-4 mr-2" />
                        <SelectValue placeholder="Filtrar por Conta" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="todos">Todas as Contas Analíticas</SelectItem>
                        {contasContabeis.map(c => (
                            <SelectItem key={c.id} value={c.id}>
                                {c.Conta} - {c.Descricao}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={handlePrint} disabled={!isPeriodSelected || contasFiltradas.length === 0}>
                    <Printer className="w-4 h-4 mr-2" /> Imprimir
                </Button>
            </div>
        </CardHeader>
        <CardContent>
            <div className="space-y-8">
                {contasFiltradas.map(conta => {
                    const lancamentos = lancamentosPorConta[conta.id] || [];
                    const saldoInicial = lancamentos.length > 0 ? lancamentos[0].saldo_anterior : 0;
                    const saldoFinal = lancamentos.length > 0 ? lancamentos[lancamentos.length - 1].saldo_acumulado : saldoInicial;
                    
                    return (
                        <Card key={conta.id} className="border-l-4 border-primary/50">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-lg">{conta.Conta} - {conta.Descricao}</CardTitle>
                                <p className="text-sm text-muted-foreground">Natureza: {conta.natureza_contabil}</p>
                            </CardHeader>
                            <CardContent>
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-[100px]">Data</TableHead>
                                                <TableHead className="w-[100px]">Origem</TableHead>
                                                <TableHead className="min-w-[200px]">Descrição</TableHead>
                                                <TableHead className="text-right w-[120px]">Débito</TableHead>
                                                <TableHead className="text-right w-[120px]">Crédito</TableHead>
                                                <TableHead className="text-right w-[120px]">Saldo Acumulado</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {/* Linha de Saldo Inicial */}
                                            <TableRow className="bg-secondary/50 font-semibold">
                                                <TableCell colSpan={5}>SALDO INICIAL</TableCell>
                                                <TableCell className={cn("text-right", saldoInicial < 0 ? 'text-red-600' : 'text-blue-600')}>
                                                    {formatCurrency(saldoInicial)}
                                                </TableCell>
                                            </TableRow>
                                            
                                            {lancamentos.map((l, index) => (
                                                <TableRow key={index}>
                                                    <TableCell>{formatarData(l.data_movimentacao)}</TableCell>
                                                    <TableCell className="text-xs">{l.origem}</TableCell>
                                                    <TableCell className="text-sm">{l.descricao}</TableCell>
                                                    <TableCell className="text-right text-red-600">{l.tipo === 'Entrada' ? formatCurrency(l.valor) : '-'}</TableCell>
                                                    <TableCell className="text-right text-green-600">{l.tipo === 'Saida' ? formatCurrency(l.valor) : '-'}</TableCell>
                                                    <TableCell className={cn("text-right font-medium", l.saldo_acumulado < 0 ? 'text-red-600' : 'text-blue-600')}>
                                                        {formatCurrency(l.saldo_acumulado)}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            
                                            {/* Linha de Saldo Final */}
                                            <TableRow className="bg-primary/20 font-bold border-t-2 border-primary">
                                                <TableCell colSpan={5}>SALDO FINAL</TableCell>
                                                <TableCell className={cn("text-right text-lg", saldoFinal < 0 ? 'text-red-700' : 'text-blue-700')}>
                                                    {formatCurrency(saldoFinal)}
                                                </TableCell>
                                            </TableRow>
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RazaoDetalhe;