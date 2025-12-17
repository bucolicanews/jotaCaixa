import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency } from '@/utils/formatters';
import { cn } from '@/lib/utils';
import { useBalancoPatrimonial } from '@/hooks/use-balanco-patrimonial';
import { Loader2, Scale, Printer, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Button } from '../ui/button';
import { usePrint } from '@/hooks/use-print';
import ReactDOMServer from 'react-dom/server';
import BalancoPatrimonialPrint from './BalancoPatrimonialPrint';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import Balanco1ColunaPrint from './Balanco1ColunaPrint';
import { useContabilConfig } from '@/hooks/use-contabil-config';
import { showError } from '@/utils/toast';

interface BalancoPatrimonialDetalheProps {
  endDate: Date;
  filtroSomenteComSaldo: boolean;
  logoUrl: string | null;
  ownerName: string;
}

interface ContaBalanco {
  id: string;
  Conta: string;
  Descricao: string;
  Analitica: 'Sim' | 'Não';
  saldo_final: number;
  tipo_principal: 'Ativo' | 'Passivo' | 'Patrimonio Liquido' | 'Resultado' | 'Outros';
  is_conta_resultado: boolean;
}

const BalancoPatrimonialDetalhe: React.FC<BalancoPatrimonialDetalheProps> = ({ endDate, filtroSomenteComSaldo, logoUrl, ownerName }) => {
  const { configMap } = useContabilConfig();
  const { contas, totalAtivo, totalPassivo, totalPatrimonioLiquido, resultadoLiquido, totalPassivoPL, carregando } = useBalancoPatrimonial(endDate);
  const { printContent } = usePrint();

  const isBalanced = Math.abs(totalAtivo - totalPassivoPL) < 0.01;

  const contasFiltradas = React.useMemo(() => {
    if (!filtroSomenteComSaldo) return contas;
    return contas.filter(c => Math.abs(c.saldo_final) >= 0.01);
  }, [contas, filtroSomenteComSaldo]);

  const normalize = (v: string) =>
    v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

  const getContasPorTipo = (tipo: ContaBalanco['tipo_principal']) => {
    const tipoNorm = normalize(tipo);
    return contasFiltradas.filter(c => {
      const t = normalize(c.tipo_principal);
      if (tipoNorm === "ativo") return t.startsWith("ativo");
      if (tipoNorm === "passivo") return t.startsWith("passivo");
      if (tipoNorm === "patrimonio liquido") return t.includes("patrimonio");
      if (tipoNorm === "resultado") return t.includes("resultado");
      return t === tipoNorm;
    });
  };

  const getContasPL = () => {
    const plCode = configMap['Patrimonio Liquido'] || '3';
    return contasFiltradas.filter(c => c.Conta.startsWith(plCode) && !c.is_conta_resultado);
  };

  const renderContas = (contasList: ContaBalanco[]) => {
    return contasList.map(c => {
      const isSintetica = c.Analitica === 'Não';
      const level = c.Conta.split('.').filter(p => p.length > 0).length;
      const paddingLeft = (level - 1) * 12;

      return (
        <TableRow 
          key={c.id} 
          className={cn(
            isSintetica ? 'bg-muted/50 font-semibold' : 'text-sm',
            level === 1 && 'border-b-2'
          )}
        >
          <TableCell className="py-2" style={{ paddingLeft: `${paddingLeft + 12}px` }}>
            {c.Conta}
          </TableCell>
          <TableCell className="py-2">{c.Descricao}</TableCell>
          <TableCell className={cn("text-right py-2 whitespace-nowrap", c.saldo_final < 0 && 'text-red-600')}>
            {formatCurrency(c.saldo_final)}
          </TableCell>
        </TableRow>
      );
    });
  };

  const handlePrint = (onlyWithBalance: boolean, formatType: '2colunas' | '1coluna') => {
    if (!endDate) {
      showError('Selecione uma data final.');
      return;
    }

    const contasParaImpressao = onlyWithBalance 
      ? contas.filter(c => Math.abs(c.saldo_final) >= 0.01 || c.Analitica === 'Não')
      : contas;

    const totalPassivoBase = contasParaImpressao
      .filter(c => c.tipo_principal === 'Passivo' && c.Analitica === 'Não' && c.Conta.split('.').length === 1)
      .reduce((sum, c) => sum + c.saldo_final, 0);

    const totalReceitaCalc = contasParaImpressao
      .filter(c => c.tipo_principal === 'Resultado' && c.Conta.startsWith(configMap.Receita || '4'))
      .reduce((sum, c) => sum + c.saldo_final, 0);

    const totalCustoCalc = contasParaImpressao
      .filter(c => c.tipo_principal === 'Resultado' && c.Conta.startsWith(configMap.Custo || '5'))
      .reduce((sum, c) => sum + c.saldo_final, 0);

    const totalDespesaCalc = contasParaImpressao
      .filter(c => c.tipo_principal === 'Resultado' && c.Conta.startsWith(configMap.Despesa || '6'))
      .reduce((sum, c) => sum + c.saldo_final, 0);

    const resLiquido = totalReceitaCalc - totalCustoCalc - totalDespesaCalc;

    const printComponent = formatType === '2colunas' ? (
      <BalancoPatrimonialPrint 
        empresaNome={ownerName} endDate={endDate} contas={contasParaImpressao}
        totalAtivo={totalAtivo} totalPassivoPL={totalPassivoPL} isBalanced={isBalanced} logoUrl={logoUrl}
      />
    ) : (
      <Balanco1ColunaPrint 
        empresaNome={ownerName} endDate={endDate} contas={contasParaImpressao}
        totalAtivo={totalAtivo} totalPassivo={totalPassivoBase} totalPatrimonioLiquido={totalPatrimonioLiquido}
        resultadoLiquido={resLiquido} logoUrl={logoUrl}
      />
    );

    const fileName = `Balanço - ${format(endDate, 'dd-MM-yyyy')}`;
    printContent(ReactDOMServer.renderToStaticMarkup(printComponent), fileName);
  };

  if (carregando) {
    return (
      <Card className="mt-6"><CardContent className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className={cn("border-l-4", isBalanced ? "border-green-500" : "border-red-500")}>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <CardTitle className="text-xl flex items-center">
            <Scale className="w-5 h-5 mr-2" /> 
            Balanço em {format(endDate, 'dd/MM/yyyy', { locale: ptBR })}
          </CardTitle>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="w-full sm:w-auto">
                <Printer className="w-4 h-4 mr-2" /> Imprimir
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handlePrint(false, '2colunas')}>2 Colunas (Completo)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handlePrint(true, '2colunas')}>2 Colunas (Só Saldo)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handlePrint(false, '1coluna')}>1 Coluna (Completo)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handlePrint(true, '1coluna')}>1 Coluna (Só Saldo)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-3 bg-secondary rounded-md">
            <p className="text-sm font-medium opacity-70">Total Ativo</p>
            <p className="text-xl font-bold">{formatCurrency(totalAtivo)}</p>
          </div>
          <div className="p-3 bg-secondary rounded-md">
            <p className="text-sm font-medium opacity-70">Passivo + PL</p>
            <p className="text-xl font-bold">{formatCurrency(totalPassivoPL)}</p>
          </div>
          <div className={cn("p-3 rounded-md", isBalanced ? "bg-green-100 dark:bg-green-900/30" : "bg-red-100 dark:bg-red-900/30")}>
            <p className="text-sm font-medium opacity-70">Status</p>
            <p className={cn("text-xl font-bold", isBalanced ? "text-green-600" : "text-red-600")}>
              {isBalanced ? 'Equilibrado' : `Dif: ${formatCurrency(totalAtivo - totalPassivoPL)}`}
            </p>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="completo" className="w-full">
        <TabsList className="flex w-full h-auto p-1 bg-muted overflow-x-auto justify-start md:justify-center no-scrollbar border">
          <TabsTrigger value="completo" className="min-w-[100px] flex-1 md:flex-none">Completo</TabsTrigger>
          <TabsTrigger value="ativo" className="min-w-[80px] flex-1 md:flex-none">Ativo</TabsTrigger>
          <TabsTrigger value="passivo" className="min-w-[90px] flex-1 md:flex-none">Passivo</TabsTrigger>
          <TabsTrigger value="pl" className="min-w-[140px] flex-1 md:flex-none whitespace-nowrap">Patrimônio Líquido</TabsTrigger>
          <TabsTrigger value="receita" className="min-w-[90px] flex-1 md:flex-none">Receita</TabsTrigger>
          <TabsTrigger value="despesa" className="min-w-[90px] flex-1 md:flex-none">Despesa</TabsTrigger>
        </TabsList>

        <TabsContent value="completo" className="mt-4 outline-none">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="bg-green-50/50 dark:bg-green-900/10">
                <CardTitle className="text-lg text-green-700">Ativo</CardTitle>
              </CardHeader>
              <CardContent className="p-0 sm:p-6 overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Conta</TableHead><TableHead>Descrição</TableHead><TableHead className="text-right">Saldo</TableHead></TableRow></TableHeader>
                  <TableBody>{renderContas(getContasPorTipo('Ativo'))}</TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader className="bg-red-50/50 dark:bg-red-900/10"><CardTitle className="text-lg text-red-700">Passivo</CardTitle></CardHeader>
                <CardContent className="p-0 sm:p-6 overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead>Conta</TableHead><TableHead>Descrição</TableHead><TableHead className="text-right">Saldo</TableHead></TableRow></TableHeader>
                    <TableBody>{renderContas(getContasPorTipo('Passivo'))}</TableBody>
                  </Table>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="bg-blue-50/50 dark:bg-blue-900/10"><CardTitle className="text-lg text-blue-700">Patrimônio Líquido</CardTitle></CardHeader>
                <CardContent className="p-0 sm:p-6 overflow-x-auto">
                  <Table>
                    <TableBody>{renderContas(getContasPL())}</TableBody>
                  </Table>
                </CardContent>
              </Card>
              <Card className="border-t-4 border-t-primary">
                <CardHeader><CardTitle className="text-lg flex items-center"><TrendingUp className="w-5 h-5 mr-2" /> Resultado do Período</CardTitle></CardHeader>
                <CardContent>
                   <div className="flex justify-between items-center font-bold text-lg">
                      <span>Líquido:</span>
                      <span className={resultadoLiquido >= 0 ? "text-green-600" : "text-red-600"}>{formatCurrency(resultadoLiquido)}</span>
                   </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Abas individuais seguem o mesmo padrão de overflow-x-auto no CardContent */}
        <TabsContent value="ativo" className="mt-4">
          <Card><CardContent className="p-0 sm:p-6 overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Conta</TableHead><TableHead>Descrição</TableHead><TableHead className="text-right">Saldo</TableHead></TableRow></TableHeader>
              <TableBody>{renderContas(getContasPorTipo('Ativo'))}</TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="passivo" className="mt-4">
          <Card><CardContent className="p-0 sm:p-6 overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Conta</TableHead><TableHead>Descrição</TableHead><TableHead className="text-right">Saldo</TableHead></TableRow></TableHeader>
              <TableBody>{renderContas(getContasPorTipo('Passivo'))}</TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="pl" className="mt-4">
          <Card><CardContent className="p-0 sm:p-6 overflow-x-auto">
            <Table>
              <TableBody>
                {renderContas(getContasPL())}
                <TableRow className={cn("font-bold", resultadoLiquido >= 0 ? "bg-green-50" : "bg-red-50")}>
                  <TableCell colSpan={2}>Resultado Líquido do Período</TableCell>
                  <TableCell className="text-right">{formatCurrency(resultadoLiquido)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="receita" className="mt-4">
          <Card><CardContent className="p-0 sm:p-6 overflow-x-auto">
            <Table>
              <TableBody>{renderContas(getContasPorTipo('Resultado').filter(c => c.Conta.startsWith(configMap.Receita || '4')))}</TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="despesa" className="mt-4">
          <Card><CardContent className="p-0 sm:p-6 overflow-x-auto">
            <Table>
              <TableBody>{renderContas(getContasPorTipo('Resultado').filter(c => c.Conta.startsWith(configMap.Custo || '5') || c.Conta.startsWith(configMap.Despesa || '6')))}</TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default BalancoPatrimonialDetalhe;