import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency } from '@/utils/formatters';
import { cn } from '@/lib/utils';
import { Loader2, Printer, TrendingUp } from 'lucide-react';
import { DateRange } from 'react-day-picker';
import { useDRE } from '@/hooks/use-dre';
import { Button } from './ui/button';
import { usePrint } from '@/hooks/use-print';
import ReactDOMServer from 'react-dom/server';
import DREPrint from '@/components/contabilidade/DREPrint';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile } from '@/types/usuario';
import { showError } from '@/utils/toast';
import { format } from 'date-fns';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { useContabilConfig } from '@/hooks/use-contabil-config'; // Importando useContabilConfig

interface DREDetalheProps {
  filtroPeriodo: DateRange | undefined;
  filtroSomenteComSaldo: boolean; // NOVO PROP
}

// Tipo auxiliar para a conta (copiado do hook)
interface ContaDRE {
  id: string;
  Conta: string;
  Descricao: string;
  Analitica: 'Sim' | 'Não';
  saldo_final: number;
  tipo_dre: 'Receita' | 'Custo' | 'Despesa' | 'Resultado';
}

const DREDetalhe: React.FC<DREDetalheProps> = ({ filtroPeriodo, filtroSomenteComSaldo }) => {
  const { perfil, role } = useSessao();
  const { configMap } = useContabilConfig(); // Obtendo o mapeamento
  const { contas, totalReceita, totalCusto, totalDespesa, resultadoLiquido, carregando } = useDRE(filtroPeriodo);
  const { printContent } = usePrint();
  
  const empresaNome = role === 'Admin' ? 'Admin' : (perfil as ClienteProfile)?.nome || 'Empresa';

  // Filtra as contas com base no estado local
  const contasFiltradas = useMemo(() => {
      if (!filtroSomenteComSaldo) return contas;
      
      // Filtra todas as contas onde o saldo é zero (ou muito próximo de zero)
      return contas.filter(c => Math.abs(c.saldo_final) >= 0.01);
      
  }, [contas, filtroSomenteComSaldo]);
  
  const getContasPorTipo = (tipo: ContaDRE['tipo_dre']) => {
    // Retorna as contas já ordenadas pelo hook
    return contasFiltradas.filter(c => c.tipo_dre === tipo);
  };
  
  const renderContas = (contasList: ContaDRE[]) => {
    return contasList.map(c => {
      const isSintetica = c.Analitica === 'Não';
      
      // Calcula o nível de indentação baseado no código da conta (ex: 3.1.1.1)
      const level = c.Conta.split('.').filter(p => p.length > 0).length;
      const paddingLeft = (level - 1) * 10;

      return (
        <TableRow key={c.id} className={cn(isSintetica ? 'bg-secondary/50 font-semibold' : 'text-sm')}>
          <TableCell className="pl-4" style={{ paddingLeft: `${paddingLeft}px` }}>{c.Conta}</TableCell>
          <TableCell className={cn(isSintetica ? 'pl-4' : 'pl-8')}>{c.Descricao}</TableCell>
          <TableCell className={cn("text-right", c.saldo_final < 0 && 'text-red-600')}>
            {formatCurrency(c.saldo_final)}
          </TableCell>
        </TableRow>
      );
    });
  };
  
  const handlePrint = (onlyWithBalance: boolean) => {
    if (!filtroPeriodo?.from || !filtroPeriodo?.to) {
        showError('Selecione um período completo para imprimir.');
        return;
    }
    
    // Para a impressão, usamos a lista completa e deixamos o componente de impressão
    // decidir se omite as linhas zero (se onlyWithBalance for true).
    const contasParaImpressao = onlyWithBalance 
        ? contas.filter(c => Math.abs(c.saldo_final) >= 0.01 || c.Analitica === 'Não')
        : contas;
        
    if (contasParaImpressao.length === 0) {
        showError('Nenhum dado para imprimir.');
        return;
    }
    
    const printComponent = (
        <DREPrint
            empresaNome={empresaNome}
            filtroPeriodo={filtroPeriodo as DateRange}
            contas={contasParaImpressao}
            totalReceita={totalReceita}
            totalCusto={totalCusto}
            totalDespesa={totalDespesa}
            resultadoLiquido={resultadoLiquido}
        />
    );

    const htmlContent = ReactDOMServer.renderToStaticMarkup(printComponent);
    printContent(htmlContent, `DRE - ${empresaNome} - ${format(filtroPeriodo.from, 'MM/yyyy')}`);
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
                Nenhuma conta de resultado (Receita/Custo/Despesa) encontrada no Plano de Contas ou no período selecionado.
            </CardContent>
        </Card>
      );
  }

  return (
    <div className="space-y-6">
      <Card className={cn("border-l-4", resultadoLiquido >= 0 ? "border-green-500" : "border-red-500")}>
        <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-xl flex items-center"><TrendingUp className="w-5 h-5 mr-2" /> Resumo da DRE</CardTitle>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" disabled={!filtroPeriodo?.from || !filtroPeriodo?.to}>
                        <Printer className="w-4 h-4 mr-2" /> Imprimir DRE
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handlePrint(false)}>
                        Imprimir DRE (Completo)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handlePrint(true)}>
                        Imprimir DRE (Somente Saldo)
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-3 bg-green-100 dark:bg-green-900/20 rounded-md">
            <p className="text-sm font-medium text-green-700 dark:text-green-300">Receita Bruta</p>
            <p className="text-2xl font-bold mt-1">{formatCurrency(totalReceita)}</p>
          </div>
          <div className="p-3 bg-red-100 dark:bg-red-900/20 rounded-md">
            <p className="text-sm font-medium text-red-700 dark:text-red-300">Custos</p>
            <p className="text-2xl font-bold mt-1">{formatCurrency(totalCusto)}</p>
          </div>
          <div className="p-3 bg-red-100 dark:bg-red-900/20 rounded-md">
            <p className="text-sm font-medium text-red-700 dark:text-red-300">Despesas</p>
            <p className="text-2xl font-bold mt-1">{formatCurrency(totalDespesa)}</p>
          </div>
          <div className="p-3 rounded-md" style={{ backgroundColor: resultadoLiquido >= 0 ? 'var(--green-100)' : 'var(--red-100)' }}>
            <p className="text-sm font-medium text-foreground">Resultado Líquido</p>
            <p className={cn("text-2xl font-bold mt-1", resultadoLiquido >= 0 ? "text-green-600" : "text-red-600")}>
              {formatCurrency(resultadoLiquido)}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Tabela Detalhada da DRE */}
      <Card>
        <CardHeader><CardTitle className="text-xl">Demonstração Detalhada ({filtroSomenteComSaldo ? 'Somente Contas com Saldo' : 'Completo'})</CardTitle></CardHeader>
        <CardContent>
            <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[150px]">Conta</TableHead>
                            <TableHead>Descrição</TableHead>
                            <TableHead className="text-right w-[150px]">Valor</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {/* 1. RECEITA BRUTA */}
                        <TableRow className="bg-green-500/20 font-bold">
                            <TableCell colSpan={2}>1. RECEITA BRUTA (Contas {configMap.Receita}.x.x)</TableCell>
                            <TableCell className="text-right text-green-600">{formatCurrency(totalReceita)}</TableCell>
                        </TableRow>
                        {renderContas(getContasPorTipo('Receita'))}
                        
                        {/* 2. CUSTOS */}
                        <TableRow className="bg-red-500/20 font-bold">
                            <TableCell colSpan={2}>2. CUSTO DAS VENDAS (Contas {configMap.Custo}.x.x)</TableCell>
                            <TableCell className="text-right text-red-600">{formatCurrency(totalCusto)}</TableCell>
                        </TableRow>
                        {renderContas(getContasPorTipo('Custo'))}
                        
                        {/* RESULTADO BRUTO */}
                        <TableRow className="bg-blue-500/20 font-bold"><TableCell colSpan={2}>RESULTADO BRUTO</TableCell><TableCell className="text-right text-blue-600">{formatCurrency(totalReceita - totalCusto)}</TableCell></TableRow>
                        
                        {/* 3. DESPESAS OPERACIONAIS */}
                        <TableRow className="bg-red-500/20 font-bold">
                            <TableCell colSpan={2}>3. DESPESAS OPERACIONAIS (Contas {configMap.Despesa}.x.x)</TableCell>
                            <TableCell className="text-right text-red-600">{formatCurrency(totalDespesa)}</TableCell>
                        </TableRow>
                        {renderContas(getContasPorTipo('Despesa'))}
                        
                        {/* RESULTADO LÍQUIDO */}
                        <TableRow className={cn("font-bold border-t-2", resultadoLiquido >= 0 ? "bg-green-500/30" : "bg-red-500/30")}>
                            <TableCell colSpan={2}>RESULTADO LÍQUIDO DO EXERCÍCIO</TableCell>
                            <TableCell className={cn("text-right text-lg", resultadoLiquido >= 0 ? "text-green-700" : "text-red-700")}>
                                {formatCurrency(resultadoLiquido)}
                            </TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
            </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DREDetalhe;