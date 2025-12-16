import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatarData } from '@/utils/formatters';
import { cn } from '@/lib/utils';
import { Loader2, Printer, Filter } from 'lucide-react';
import { DateRange } from 'react-day-picker';
import { Button } from '../ui/button';
import { usePrint } from '@/hooks/use-print';
import ReactDOMServer from 'react-dom/server';
import { useSessao } from '@/hooks/use-sessao';
import { showError } from '@/utils/toast';
import { format } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { useRazao } from '@/hooks/contabilidade/useRazao';
import RazaoPrint from './RazaoPrint';

interface RazaoDetalheProps {
  filtroPeriodo: DateRange | undefined;
}

const RazaoDetalhe: React.FC<RazaoDetalheProps> = ({ filtroPeriodo }) => {
  const { contas, lancamentosPorConta, contasContabeis, carregando } = useRazao(filtroPeriodo);
  const { printContent } = usePrint();
  
  const [contaSelecionadaId, setContaSelecionadaId] = useState('todos');
  
  const isPeriodSelected = !!(filtroPeriodo?.from && filtroPeriodo?.to);

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
        {/* CORREÇÃO DA RESPONSIVIDADE NOS BOTÕES/FILTROS */}
        <CardHeader className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <div className="flex flex-1 w-full sm:max-w-xs">
            <Select value={contaSelecionadaId} onValueChange={setContaSelecionadaId}>
              <SelectTrigger className="w-full">
                <div className="flex items-center">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Filtrar por Conta" />
                </div>
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
          </div>
          
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handlePrint} 
            disabled={!isPeriodSelected || contasFiltradas.length === 0}
            className="w-full sm:w-auto"
          >
            <Printer className="w-4 h-4 mr-2" /> Imprimir Razão
          </Button>
        </CardHeader>

        <CardContent>
          <div className="space-y-8">
            {contasFiltradas.map(conta => {
              const lancamentos = lancamentosPorConta[conta.id] || [];
              const saldoInicial = lancamentos.length > 0 
                  ? lancamentos[0].saldo_anterior 
                  : (contas.find(c => c.id === conta.id)?.saldo_final) || 0;
                  
              const saldoFinal = lancamentos.length > 0 
                  ? lancamentos[lancamentos.length - 1].saldo_acumulado 
                  : saldoInicial;
              
              return (
                <Card key={conta.id} className="border-l-4 border-primary/50 overflow-hidden">
                  <CardHeader className="pb-2 bg-muted/20">
                    <CardTitle className="text-base md:text-lg">{conta.Conta} - {conta.Descricao}</CardTitle>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                      Natureza: {conta.natureza_contabil}
                    </p>
                  </CardHeader>
                  <CardContent className="p-0 sm:p-6">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[100px]">Data</TableHead>
                            <TableHead className="w-[100px] hidden md:table-cell">Origem</TableHead>
                            <TableHead className="min-w-[200px]">Descrição</TableHead>
                            <TableHead className="text-right w-[110px]">Débito</TableHead>
                            <TableHead className="text-right w-[110px]">Crédito</TableHead>
                            <TableHead className="text-right w-[130px]">Saldo</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <TableRow className="bg-secondary/30 font-semibold">
                            <TableCell colSpan={3} className="md:col-span-3">SALDO INICIAL</TableCell>
                            <TableCell className="hidden md:table-cell"></TableCell> {/* Correção de colSpan para mobile */}
                            <TableCell colSpan={2} className={cn("text-right", saldoInicial < 0 ? 'text-red-600' : 'text-blue-600')}>
                              {formatCurrency(saldoInicial)}
                            </TableCell>
                          </TableRow>
                          
                          {lancamentos.map((l, index) => (
                            <TableRow key={index} className="text-xs md:text-sm">
                              <TableCell className="whitespace-nowrap">{formatarData(l.data_movimentacao)}</TableCell>
                              <TableCell className="text-xs hidden md:table-cell opacity-70">{l.origem}</TableCell>
                              <TableCell className="max-w-[300px] truncate md:whitespace-normal">{l.descricao}</TableCell>
                              <TableCell className="text-right text-red-600 font-mono">
                                {l.tipo === 'Entrada' ? formatCurrency(l.valor) : '-'}
                              </TableCell>
                              <TableCell className="text-right text-green-600 font-mono">
                                {l.tipo === 'Saida' ? formatCurrency(l.valor) : '-'}
                              </TableCell>
                              <TableCell className={cn("text-right font-mono font-medium", l.saldo_acumulado < 0 ? 'text-red-600' : 'text-blue-600')}>
                                {formatCurrency(l.saldo_acumulado)}
                              </TableCell>
                            </TableRow>
                          ))}
                          
                          {lancamentos.length > 0 && (
                            <TableRow className="bg-secondary/20 font-bold border-t-2">
                              <TableCell colSpan={3} className="hidden md:table-cell text-xs">MOVIMENTAÇÃO DO PERÍODO</TableCell>
                              <TableCell colSpan={2} className="md:hidden text-xs">TOTAIS</TableCell>
                              <TableCell className="text-right text-red-700 text-xs">
                                {formatCurrency(lancamentos.filter(l => l.tipo === 'Entrada').reduce((sum, l) => sum + l.valor, 0))}
                              </TableCell>
                              <TableCell className="text-right text-green-700 text-xs">
                                {formatCurrency(lancamentos.filter(l => l.tipo === 'Saida').reduce((sum, l) => sum + l.valor, 0))}
                              </TableCell>
                              <TableCell className="text-right"></TableCell>
                            </TableRow>
                          )}
                          
                          <TableRow className="bg-primary/10 font-bold border-t-2 border-primary">
                            <TableCell colSpan={3} className="md:col-span-3">SALDO FINAL</TableCell>
                            <TableCell className="hidden md:table-cell"></TableCell>
                            <TableCell colSpan={2} className={cn("text-right text-base", saldoFinal < 0 ? 'text-red-700' : 'text-blue-700')}>
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