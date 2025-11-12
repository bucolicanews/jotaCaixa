import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency } from '@/utils/formatters';
import { cn } from '@/lib/utils';
import { useBalancoPatrimonial } from '@/hooks/use-balanco-patrimonial';
import { Loader2, Scale, Printer } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Button } from '../ui/button';
import { usePrint } from '@/hooks/use-print';
import ReactDOMServer from 'react-dom/server';
import BalancoPatrimonialPrint from './BalancoPatrimonialPrint';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile } from '@/types/usuario';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import Balanco1ColunaPrint from './Balanco1ColunaPrint';

interface BalancoPatrimonialDetalheProps {
  endDate: Date;
  filtroSomenteComSaldo: boolean; // NOVO PROP
}

// Tipo auxiliar para a conta (copiado do hook)
interface ContaBalanco {
  id: string;
  Conta: string;
  Descricao: string;
  Analitica: 'Sim' | 'Não';
  saldo_final: number;
  tipo_principal: 'Ativo' | 'Passivo' | 'Patrimonio Liquido' | 'Resultado' | 'Outros';
  is_conta_resultado: boolean; // Adicionado para filtragem
}

const BalancoPatrimonialDetalhe: React.FC<BalancoPatrimonialDetalheProps> = ({ endDate, filtroSomenteComSaldo }) => {
  const { perfil, role } = useSessao();
  const { contas, totalAtivo, totalPassivo, totalPatrimonioLiquido, resultadoLiquido, carregando } = useBalancoPatrimonial(endDate);
  const { printContent } = usePrint();
  
  const empresaNome = role === 'Admin' ? 'Admin' : (perfil as ClienteProfile)?.nome || 'Empresa';

  // CORREÇÃO: O totalPassivoPL deve somar o Passivo, o PL e o Resultado Líquido (que é o resultado do período)
  const totalPassivoPL = totalPassivo + totalPatrimonioLiquido + resultadoLiquido;
  const isBalanced = Math.abs(totalAtivo - totalPassivoPL) < 0.01;
  
  // Filtra as contas com base no estado local
  const contasFiltradas = React.useMemo(() => {
      if (!filtroSomenteComSaldo) return contas;
      
      // Filtra todas as contas onde o saldo é zero (ou muito próximo de zero)
      return contas.filter(c => Math.abs(c.saldo_final) >= 0.01);
      
  }, [contas, filtroSomenteComSaldo]);
  
  // Função auxiliar para filtrar contas e incluir seus pais sintéticos
  const filterAndIncludeParents = (list: ContaBalanco[], prefix: string) => {
      const filtered = list.filter(c => c.Conta.startsWith(prefix));
      
      if (!filtroSomenteComSaldo) return filtered;
      
      // Se o filtro SomenteComSaldo estiver ativo, precisamos garantir que os pais sintéticos
      // das contas analíticas com saldo sejam incluídos.
      const contasComSaldo = filtered.filter(c => Math.abs(c.saldo_final) >= 0.01);
      const contasIncluidas = new Set(contasComSaldo.map(c => c.Conta));
      
      contasComSaldo.forEach(c => {
          let currentConta = c.Conta;
          while (currentConta.includes('.')) {
              currentConta = currentConta.substring(0, currentConta.lastIndexOf('.'));
              const parent = list.find(p => p.Conta === currentConta && p.Analitica === 'Não');
              if (parent) {
                  contasIncluidas.add(parent.Conta);
              }
          }
      });
      
      return list.filter(c => contasIncluidas.has(c.Conta) || (c.Analitica === 'Não' && c.Conta.startsWith(prefix)));
  };
  
  const getContasPorTipo = (tipo: ContaBalanco['tipo_principal']) => {
    // Retorna as contas já ordenadas pelo hook
    return contasFiltradas.filter(c => c.tipo_principal === tipo);
  };
  
  // NOVO FILTRO: Para Receita (3.x.x)
  const getContasReceita = () => {
      // Contas de Receita são as contas 3.x.x que são marcadas como is_conta_resultado
      const receitaContas = contas.filter(c => c.Conta.startsWith('3') && c.is_conta_resultado);
      return filterAndIncludeParents(receitaContas, '3');
  };
  
  // NOVO FILTRO: Para Despesa (4.x.x e 5.x.x)
  const getContasDespesa = () => {
      // Contas de Despesa são as contas 4.x.x e 5.x.x (que são Resultado)
      const despesaContas = contas.filter(c => c.tipo_principal === 'Resultado');
      return filterAndIncludeParents(despesaContas, '4').concat(filterAndIncludeParents(despesaContas, '5'));
  };
  
  // NOVO FILTRO: Apenas contas de PL (3.x.x) que não são Resultado
  const getContasPL = () => {
      const plContas = contas.filter(c => c.tipo_principal === 'Patrimonio Liquido' && !c.is_conta_resultado);
      return filterAndIncludeParents(plContas, '3');
  };
  
  const renderContas = (contasList: ContaBalanco[]) => {
    return contasList.map(c => {
      const isSintetica = c.Analitica === 'Não';
      const isZero = Math.abs(c.saldo_final) < 0.01;
      
      // Se o filtro SomenteComSaldo está ativo, e a conta é analítica E tem saldo zero, omite.
      if (filtroSomenteComSaldo && isZero && c.Analitica === 'Sim') return null;

      // Calcula o nível de indentação baseado no código da conta (ex: 1.1.1.1)
      const level = c.Conta.split('.').filter(p => p.length > 0).length;
      const paddingLeft = (level - 1) * 10;

      return (
        <TableRow 
            key={c.id} 
            className={cn(
                isSintetica ? 'bg-gray-200 dark:bg-gray-700/50 font-semibold' : 'text-sm',
                // Adiciona uma borda inferior para separar os grupos de nível 1
                level === 1 && 'border-b-2 border-border'
            )}
        >
          <TableCell className="pl-4" style={{ paddingLeft: `${paddingLeft}px` }}>{c.Conta}</TableCell>
          <TableCell className={cn(isSintetica ? 'pl-4' : 'pl-8')}>{c.Descricao}</TableCell>
          <TableCell className={cn("text-right", c.saldo_final < 0 && 'text-red-600')}>
            {formatCurrency(c.saldo_final)}
          </TableCell>
        </TableRow>
      );
    });
  };
  
  const handlePrint = (onlyWithBalance: boolean, formatType: '2colunas' | '1coluna') => {
    // A filtragem é feita aqui antes de passar para o componente de impressão
    const contasParaImpressao = onlyWithBalance 
        ? contas.filter(c => Math.abs(c.saldo_final) >= 0.01 || c.Analitica === 'Não')
        : contas;
        
    let printComponent;
    let fileName;
    
    if (formatType === '2colunas') {
        printComponent = (
            <BalancoPatrimonialPrint
                empresaNome={empresaNome}
                endDate={endDate}
                contas={contasParaImpressao}
                totalAtivo={totalAtivo}
                totalPassivoPL={totalPassivoPL}
                isBalanced={isBalanced}
            />
        );
        fileName = `Balanço 2 Colunas - ${format(endDate, 'dd/MM/yyyy')}`;
    } else {
        // Para o Balanço de 1 Coluna, precisamos do resultado líquido
        const totalPassivo = contasParaImpressao
            .filter(c => c.tipo_principal === 'Passivo' && c.Analitica === 'Não' && c.Conta.split('.').length === 1)
            .reduce((sum, c) => sum + c.saldo_final, 0);
            
        const resultadoLiquidoCalc = contasParaImpressao
            .filter(c => c.tipo_principal === 'Resultado' || (c.tipo_principal === 'Patrimonio Liquido' && c.is_conta_resultado))
            .reduce((sum, c) => sum + c.saldo_final, 0);
            
        printComponent = (
            <Balanco1ColunaPrint
                empresaNome={empresaNome}
                endDate={endDate}
                contas={contasParaImpressao}
                totalAtivo={totalAtivo}
                totalPassivo={totalPassivo}
                totalPatrimonioLiquido={totalPatrimonioLiquido}
                resultadoLiquido={resultadoLiquidoCalc}
            />
        );
        fileName = `Balanço 1 Coluna - ${format(endDate, 'dd/MM/yyyy')}`;
    }

    const htmlContent = ReactDOMServer.renderToStaticMarkup(printComponent);
    printContent(htmlContent, fileName);
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
                Nenhuma conta contábil encontrada. Importe seu Plano de Contas para gerar o balanço.
            </CardContent>
        </Card>
      );
  }

  return (
    <div className="space-y-6">
      <Card className={cn("border-l-4", isBalanced ? "border-green-500" : "border-red-500")}>
        <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-xl flex items-center"><Scale className="w-5 h-5 mr-2" /> Resumo do Balanço em {format(endDate, 'dd/MM/yyyy', { locale: ptBR })}</CardTitle>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                        <Printer className="w-4 h-4 mr-2" /> Imprimir
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handlePrint(false, '2colunas')}>
                        Balanço 2 Colunas (Completo)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handlePrint(true, '2colunas')}>
                        Balanço 2 Colunas (Somente Saldo)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handlePrint(false, '1coluna')}>
                        Balanço 1 Coluna (Completo)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handlePrint(true, '1coluna')}>
                        Balanço 1 Coluna (Somente Saldo)
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-3 bg-secondary rounded-md">
            <p className="text-sm font-medium">Total Ativo</p>
            <p className="text-2xl font-bold mt-1">{formatCurrency(totalAtivo)}</p>
          </div>
          <div className="p-3 bg-secondary rounded-md">
            <p className="text-sm font-medium">Total Passivo + PL</p>
            <p className="text-2xl font-bold mt-1">{formatCurrency(totalPassivoPL)}</p>
          </div>
          <div className="p-3 rounded-md" style={{ backgroundColor: isBalanced ? 'var(--green-100)' : 'var(--red-100)' }}>
            <p className="text-sm font-medium text-foreground">Status</p>
            <p className={cn("text-2xl font-bold mt-1", isBalanced ? "text-green-600" : "text-red-600")}>
              {isBalanced ? 'Equilibrado' : `Desequilíbrio: ${formatCurrency(totalAtivo - totalPassivoPL)}`}
            </p>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="completo" className="w-full">
        <TabsList className="grid w-full grid-cols-6 h-auto p-1">
            <TabsTrigger value="completo">Completo</TabsTrigger>
            <TabsTrigger value="ativo">Ativo</TabsTrigger>
            <TabsTrigger value="passivo">Passivo</TabsTrigger>
            <TabsTrigger value="pl">Patrimônio Líquido</TabsTrigger>
            <TabsTrigger value="receita">Receita</TabsTrigger>
            <TabsTrigger value="despesa">Despesa</TabsTrigger>
        </TabsList>
        
        {/* ABA 1: COMPLETO (Ativo vs Passivo/PL) */}
        <TabsContent value="completo" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* ATIVO */}
                <Card>
                    <CardHeader><CardTitle className="text-xl text-green-600">Ativo ({formatCurrency(totalAtivo)})</CardTitle></CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader><TableRow><TableHead className="w-[150px]">Conta</TableHead><TableHead>Descrição</TableHead><TableHead className="text-right w-[150px]">Saldo</TableHead></TableRow></TableHeader>
                            <TableBody>{renderContas(getContasPorTipo('Ativo'))}</TableBody>
                        </Table>
                    </CardContent>
                </Card>

                {/* PASSIVO + PL + RESULTADO */}
                <div className="space-y-6">
                    <Card>
                        <CardHeader><CardTitle className="text-xl text-red-600">Passivo ({formatCurrency(totalPassivo)})</CardTitle></CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader><TableRow><TableHead className="w-[150px]">Conta</TableHead><TableHead>Descrição</TableHead><TableHead className="text-right w-[150px]">Saldo</TableHead></TableRow></TableHeader>
                                <TableBody>{renderContas(getContasPorTipo('Passivo'))}</TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                    
                    <Card>
                        <CardHeader><CardTitle className="text-xl text-blue-600">Patrimônio Líquido e Resultado</CardTitle></CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader><TableRow><TableHead className="w-[150px]">Conta</TableHead><TableHead>Descrição</TableHead><TableHead className="text-right w-[150px]">Saldo</TableHead></TableRow></TableHeader>
                                <TableBody>{renderContas(getContasPL())}</TableBody>
                                {/* Linha do Resultado Líquido */}
                                <TableRow className={cn("font-bold border-t-2", resultadoLiquido >= 0 ? "bg-green-500/30" : "bg-red-500/30")}>
                                    <TableCell colSpan={2}>Resultado Líquido do Período</TableCell>
                                    <TableCell className={cn("text-right", resultadoLiquido >= 0 ? "text-green-700" : "text-red-700")}>
                                        {formatCurrency(resultadoLiquido)}
                                    </TableCell>
                                </TableRow>
                            </Table>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </TabsContent>
        
        {/* ABA 2: ATIVO */}
        <TabsContent value="ativo" className="mt-4">
            <Card>
                <CardHeader><CardTitle className="text-xl text-green-600">Ativo ({formatCurrency(totalAtivo)})</CardTitle></CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader><TableRow><TableHead className="w-[150px]">Conta</TableHead><TableHead>Descrição</TableHead><TableHead className="text-right w-[150px]">Saldo</TableHead></TableRow></TableHeader>
                        <TableBody>{renderContas(getContasPorTipo('Ativo'))}</TableBody>
                    </Table>
                </CardContent>
            </Card>
        </TabsContent>
        
        {/* ABA 3: PASSIVO */}
        <TabsContent value="passivo" className="mt-4">
            <Card>
                <CardHeader><CardTitle className="text-xl text-red-600">Passivo ({formatCurrency(totalPassivo)})</CardTitle></CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader><TableRow><TableHead className="w-[150px]">Conta</TableHead><TableHead>Descrição</TableHead><TableHead className="text-right w-[150px]">Saldo</TableHead></TableRow></TableHeader>
                        <TableBody>{renderContas(getContasPorTipo('Passivo'))}</TableBody>
                    </Table>
                </CardContent>
            </Card>
        </TabsContent>
        
        {/* NOVO ABA 4: PATRIMÔNIO LÍQUIDO */}
        <TabsContent value="pl" className="mt-4">
            <Card>
                <CardHeader><CardTitle className="text-xl text-blue-600">Patrimônio Líquido ({formatCurrency(totalPatrimonioLiquido)})</CardTitle></CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader><TableRow><TableHead className="w-[150px]">Conta</TableHead><TableHead>Descrição</TableHead><TableHead className="text-right w-[150px]">Saldo</TableHead></TableRow></TableHeader>
                        <TableBody>{renderContas(getContasPL())}</TableBody>
                        {/* Linha do Resultado Líquido */}
                        <TableRow className={cn("font-bold border-t-2", resultadoLiquido >= 0 ? "bg-green-500/30" : "bg-red-500/30")}>
                            <TableCell colSpan={2}>Resultado Líquido do Período</TableCell>
                            <TableCell className={cn("text-right", resultadoLiquido >= 0 ? "text-green-700" : "text-red-700")}>
                                {formatCurrency(resultadoLiquido)}
                            </TableCell>
                        </TableRow>
                    </Table>
                </CardContent>
            </Card>
        </TabsContent>
        
        {/* ABA 5: RECEITA */}
        <TabsContent value="receita" className="mt-4">
            <Card>
                <CardHeader><CardTitle className="text-xl text-green-600">Receitas (Contas 3.x.x de Resultado)</CardTitle></CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader><TableRow><TableHead className="w-[150px]">Conta</TableHead><TableHead>Descrição</TableHead><TableHead className="text-right w-[150px]">Saldo</TableHead></TableRow></TableHeader>
                        <TableBody>{renderContas(getContasReceita())}</TableBody>
                    </Table>
                </CardContent>
            </Card>
        </TabsContent>
        
        {/* ABA 6: DESPESA */}
        <TabsContent value="despesa" className="mt-4">
            <Card>
                <CardHeader><CardTitle className="text-xl text-red-600">Despesas (Contas 4.x.x e 5.x.x)</CardTitle></CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader><TableRow><TableHead className="w-[150px]">Conta</TableHead><TableHead>Descrição</TableHead><TableHead className="text-right w-[150px]">Saldo</TableHead></TableRow></TableHeader>
                        <TableBody>{renderContas(getContasDespesa())}</TableBody>
                    </Table>
                </CardContent>
            </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default BalancoPatrimonialDetalhe;