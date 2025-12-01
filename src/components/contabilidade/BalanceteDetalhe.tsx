import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency } from '@/utils/formatters';
import { cn } from '@/lib/utils';
import { Loader2, Printer, FileTextIcon, Scale, TrendingUp } from 'lucide-react';
import { DateRange } from 'react-day-picker';
import { Button } from '../ui/button';
import { usePrint } from '@/hooks/use-print';
import ReactDOMServer from 'react-dom/server';
import { useSessao } from '@/hooks/use-sessao';
import { showError } from '@/utils/toast';
import { format } from 'date-fns';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { useBalancete } from '@/hooks/contabilidade/useBalancete'; // Hook a ser criado
import BalancetePrint from './BalancetePrint'; // Componente de impressão a ser criado

interface BalanceteDetalheProps {
  filtroPeriodo: DateRange | undefined;
  filtroSomenteComSaldo: boolean;
  logoUrl: string | null;
  ownerName: string;
}

// Tipo auxiliar para a conta (copiado do hook)
interface ContaBalancete {
  id: string;
  Conta: string;
  Descricao: string;
  Analitica: 'Sim' | 'Não';
  saldo_inicial: number;
  total_debito: number;
  total_credito: number;
  saldo_final: number;
  natureza_final: 'Devedora' | 'Credora';
}

const BalanceteDetalhe: React.FC<BalanceteDetalheProps> = ({ filtroPeriodo, filtroSomenteComSaldo, logoUrl, ownerName }) => {
  const { usuario } = useSessao();
  const { contas, totais, carregando } = useBalancete(filtroPeriodo);
  const { printContent } = usePrint();
  
  const isPeriodSelected = filtroPeriodo?.from && filtroPeriodo?.to;

  // Filtra as contas com base no estado local
  const contasFiltradas = useMemo(() => {
      if (!filtroSomenteComSaldo) return contas;
      
      // Filtra todas as contas onde o saldo final é zero (ou muito próximo de zero)
      return contas.filter(c => Math.abs(c.saldo_final) >= 0.01);
      
  }, [contas, filtroSomenteComSaldo]);
  
  const handlePrint = (onlyWithBalance: boolean) => {
    if (!isPeriodSelected) {
        showError('Selecione um período completo para imprimir.');
        return;
    }
    
    const contasParaImpressao = onlyWithBalance 
        ? contas.filter(c => Math.abs(c.saldo_final) >= 0.01 || c.Analitica === 'Não')
        : contas;
        
    if (contasParaImpressao.length === 0) {
        showError('Nenhum dado para imprimir.');
        return;
    }
    
    const printComponent = (
        <BalancetePrint
            empresaNome={ownerName}
            filtroPeriodo={filtroPeriodo as DateRange}
            contas={contasParaImpressao}
            totais={totais}
            logoUrl={logoUrl}
        />
    );

    const htmlContent = ReactDOMServer.renderToStaticMarkup(printComponent);
    printContent(htmlContent, `Balancete - ${ownerName} - ${format(filtroPeriodo.from!, 'MM/yyyy')}`, 'landscape');
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
                Nenhuma conta encontrada no Plano de Contas ou no período selecionado.
            </CardContent>
        </Card>
      );
  }

  return (
    <div className="space-y-6">
      {/* NOVO: Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-l-4 border-red-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-red-700 dark:text-red-300">Total Débito (Movimento)</CardTitle>
                <TrendingUp className="w-4 h-4 text-red-500" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold mt-1 text-red-600">
                    {formatCurrency(totais.totalDebito)}
                </div>
            </CardContent>
        </Card>
        <Card className="border-l-4 border-green-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-green-700 dark:text-green-300">Total Crédito (Movimento)</CardTitle>
                <TrendingUp className="w-4 h-4 text-green-500" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold mt-1 text-green-600">
                    {formatCurrency(totais.totalCredito)}
                </div>
            </CardContent>
        </Card>
        <Card className={cn("border-l-4", totais.totalSaldoFinal >= 0 ? "border-blue-500" : "border-red-500")}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-foreground">Saldo Final (Total)</CardTitle>
                <Scale className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent>
                <div className={cn("text-2xl font-bold mt-1", totais.totalSaldoFinal >= 0 ? "text-blue-600" : "text-red-600")}>
                    {formatCurrency(totais.totalSaldoFinal)}
                </div>
            </CardContent>
        </Card>
      </div>
      {/* FIM NOVO: Cards de Resumo */}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-xl flex items-center"><FileTextIcon className="w-5 h-5 mr-2" /> Balancete de Verificação</CardTitle>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" disabled={!isPeriodSelected}>
                        <Printer className="w-4 h-4 mr-2" /> Imprimir Balancete
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handlePrint(false)}>
                        Imprimir (Completo)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handlePrint(true)}>
                        Imprimir (Somente Saldo)
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </CardHeader>
        <CardContent>
            <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[100px]">Conta</TableHead>
                            <TableHead className="min-w-[200px]">Descrição</TableHead>
                            <TableHead className="text-center w-[100px]">Natureza</TableHead>
                            <TableHead className="text-right w-[120px]">Saldo Inicial</TableHead>
                            <TableHead className="text-right w-[120px]">Débito (Mês)</TableHead>
                            <TableHead className="text-right w-[120px]">Crédito (Mês)</TableHead>
                            <TableHead className="text-right w-[120px]">Saldo Final</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {contasFiltradas.map(c => {
                            const isSintetica = c.Analitica === 'Não';
                            const level = c.Conta.split('.').filter(p => p.length > 0).length;
                            const paddingLeft = (level - 1) * 10;
                            
                            return (
                                <TableRow key={c.id} className={cn(isSintetica ? 'bg-secondary/50 font-semibold' : 'text-sm')}>
                                    <TableCell className="pl-4" style={{ paddingLeft: `${paddingLeft + 16}px` }}>{c.Conta}</TableCell>
                                    <TableCell className={cn(isSintetica ? 'pl-4' : 'pl-8')}>{c.Descricao}</TableCell>
                                    <TableCell className="text-center text-xs">{c.natureza_final}</TableCell>
                                    <TableCell className="text-right">{formatCurrency(c.saldo_inicial)}</TableCell>
                                    <TableCell className="text-right text-red-600">{formatCurrency(c.total_debito)}</TableCell>
                                    <TableCell className="text-right text-green-600">{formatCurrency(c.total_credito)}</TableCell>
                                    <TableCell className={cn("text-right font-bold", c.saldo_final < 0 ? 'text-red-700' : 'text-blue-700')}>
                                        {formatCurrency(c.saldo_final)}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                        
                        {/* Linha de Totais */}
                        <TableRow className="bg-primary/20 font-bold border-t-2 border-primary">
                            <TableCell colSpan={4}>TOTAIS GERAIS</TableCell>
                            <TableCell className="text-right text-red-700">{formatCurrency(totais.totalDebito)}</TableCell>
                            <TableCell className="text-right text-green-700">{formatCurrency(totais.totalCredito)}</TableCell>
                            <TableCell className="text-right text-blue-700">{formatCurrency(totais.totalSaldoFinal)}</TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
            </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BalanceteDetalhe;