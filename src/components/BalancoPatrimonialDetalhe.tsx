import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency } from '@/utils/formatters';
import { cn } from '@/lib/utils';
import { useBalancoPatrimonial } from '@/hooks/use-balanco-patrimonial';
import { Loader2, Scale, Printer } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from './ui/button';
import { usePrint } from '@/hooks/use-print';
import ReactDOMServer from 'react-dom/server';
import BalancoPatrimonialPrint from './BalancoPatrimonialPrint';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile } from '@/types/usuario';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';

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
  sub_tipo: 'Circulante' | 'Nao Circulante' | 'N/A';
}

const BalancoPatrimonialDetalhe: React.FC<BalancoPatrimonialDetalheProps> = ({ endDate, filtroSomenteComSaldo }) => {
  const { perfil, role } = useSessao();
  const { contas, totalAtivo, totalPassivo, totalPatrimonioLiquido, resultadoLiquido, carregando } = useBalancoPatrimonial(endDate);
  const { printContent } = usePrint();
  
  const empresaNome = role === 'Admin' ? 'Admin' : (perfil as ClienteProfile)?.nome || 'Empresa';

  const totalPassivoPL = totalPassivo + totalPatrimonioLiquido + resultadoLiquido;
  const isBalanced = Math.abs(totalAtivo - totalPassivoPL) < 0.01;
  
  const getContasPorTipo = (tipo: ContaBalanco['tipo_principal']) => {
    return contas.filter(c => c.tipo_principal === tipo);
  };
  
  const renderContas = (contasList: ContaBalanco[]) => {
    return contasList.map(c => {
      const isSintetica = c.Analitica === 'Não';
      const isZero = Math.abs(c.saldo_final) < 0.01;
      
      // Aplica o filtro de saldo
      if (filtroSomenteComSaldo && isZero && !isSintetica) return null;
      if (isZero && isSintetica) return null;

      // Calcula o nível de indentação baseado no código da conta (ex: 1.1.1.1)
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
  
  const renderHierarquia = (contas: ContaBalanco[], tipoPrincipal: 'Ativo' | 'Passivo') => {
    const circulante = contas.filter(c => c.sub_tipo === 'Circulante');
    const naoCirculante = contas.filter(c => c.sub_tipo === 'Nao Circulante');
    
    const totalCirculante = circulante.reduce((sum, c) => sum + c.saldo_final, 0);
    const totalNaoCirculante = naoCirculante.reduce((sum, c) => sum + c.saldo_final, 0);
    
    const renderGroup = (group: ContaBalanco[], title: string, total: number) => {
        if (group.length === 0) return null;
        
        // Filtra contas sintéticas que não têm saldo e contas analíticas com saldo zero (se o filtro estiver ativo)
        const filteredGroup = group.filter(c => {
            const isSintetica = c.Analitica === 'Não';
            const isZero = Math.abs(c.saldo_final) < 0.01;
            
            if (isSintetica && isZero) return false;
            if (filtroSomenteComSaldo && !isSintetica && isZero) return false;
            
            return true;
        });
        
        if (filteredGroup.length === 0) return null;

        return (
            <>
                <TableRow className="bg-primary/10 font-bold">
                    <TableCell colSpan={2} className="pl-4">{title}</TableCell>
                    <TableCell className="text-right">{formatCurrency(total)}</TableCell>
                </TableRow>
                {renderContas(group)}
            </>
        );
    };

    return (
        <>
            {renderGroup(circulante, `${tipoPrincipal} Circulante`, totalCirculante)}
            {renderGroup(naoCirculante, `${tipoPrincipal} Não Circulante`, totalNaoCirculante)}
        </>
    );
  };
  
  const handlePrint = (onlyWithBalance: boolean) => {
    const contasParaImpressao = onlyWithBalance 
        ? contas.filter(c => c.Analitica === 'Não' || Math.abs(c.saldo_final) >= 0.01)
        : contas;
        
    const printComponent = (
        <BalancoPatrimonialPrint
            empresaNome={empresaNome}
            endDate={endDate}
            contas={contasParaImpressao}
            totalAtivo={totalAtivo}
            totalPassivoPL={totalPassivoPL}
            isBalanced={isBalanced}
        />
    );

    const htmlContent = ReactDOMServer.renderToStaticMarkup(printComponent);
    printContent(htmlContent, `Balanço Patrimonial - ${format(endDate, 'dd/MM/yyyy')}`);
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
                    <DropdownMenuItem onClick={() => handlePrint(false)}>
                        Balanço Completo
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handlePrint(true)}>
                        Somente Contas com Saldo
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-3 bg-secondary rounded-md">
            <p className="text-sm font-medium">Total Ativo</p>
            <p className="text-2xl font-bold mt-1">{formatCurrency(totalAtivo)}</p>
          </div>
          <div className="p-3 bg-secondary rounded-md">
            <p className="text-sm font-medium">Total Passivo</p>
            <p className="text-2xl font-bold mt-1">{formatCurrency(totalPassivo)}</p>
          </div>
          <div className="p-3 bg-secondary rounded-md">
            <p className="text-sm font-medium">Patrimônio Líquido</p>
            <p className="text-2xl font-bold mt-1">{formatCurrency(totalPatrimonioLiquido + resultadoLiquido)}</p>
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
        <TabsList className="grid w-full grid-cols-5 h-auto p-1">
            <TabsTrigger value="completo">Completo</TabsTrigger>
            <TabsTrigger value="ativo">Ativo</TabsTrigger>
            <TabsTrigger value="passivo">Passivo / PL</TabsTrigger>
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
                            <TableBody>
                                {renderHierarquia(getContasPorTipo('Ativo'), 'Ativo')}
                                <TableRow className="bg-secondary/50 font-bold">
                                    <TableCell colSpan={2} className="pl-4">TOTAL DO ATIVO</TableCell>
                                    <TableCell className="text-right">{formatCurrency(totalAtivo)}</TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                {/* PASSIVO + PL + RESULTADO */}
                <Card>
                    <CardHeader><CardTitle className="text-xl text-red-600">Passivo e Patrimônio Líquido ({formatCurrency(totalPassivoPL)})</CardTitle></CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader><TableRow><TableHead className="w-[150px]">Conta</TableHead><TableHead>Descrição</TableHead><TableHead className="text-right w-[150px]">Saldo</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {/* PASSIVO */}
                                {renderHierarquia(getContasPorTipo('Passivo'), 'Passivo')}
                                <TableRow className="bg-primary/10 font-bold">
                                    <TableCell colSpan={2} className="pl-4">TOTAL DO PASSIVO</TableCell>
                                    <TableCell className="text-right">{formatCurrency(totalPassivo)}</TableCell>
                                </TableRow>
                                
                                {/* PATRIMÔNIO LÍQUIDO */}
                                <TableRow className="bg-primary/10 font-bold">
                                    <TableCell colSpan={3} className="pl-4 pt-6">PATRIMÔNIO LÍQUIDO</TableCell>
                                </TableRow>
                                {renderContas(getContasPorTipo('Patrimonio Liquido'))}
                                {renderContas(getContasPorTipo('Resultado'))}
                                
                                <TableRow className="bg-secondary/50 font-bold">
                                    <TableCell colSpan={2} className="pl-4">TOTAL DO PASSIVO + PL</TableCell>
                                    <TableCell className="text-right">{formatCurrency(totalPassivoPL)}</TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </TabsContent>
        
        {/* ABA 2: ATIVO */}
        <TabsContent value="ativo" className="mt-4">
            <Card>
                <CardHeader><CardTitle className="text-xl text-green-600">Ativo ({formatCurrency(totalAtivo)})</CardTitle></CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader><TableRow><TableHead className="w-[150px]">Conta</TableHead><TableHead>Descrição</TableHead><TableHead className="text-right w-[150px]">Saldo</TableHead></TableRow></TableHeader>
                        <TableBody>
                            {renderHierarquia(getContasPorTipo('Ativo'), 'Ativo')}
                            <TableRow className="bg-secondary/50 font-bold">
                                <TableCell colSpan={2} className="pl-4">TOTAL DO ATIVO</TableCell>
                                <TableCell className="text-right">{formatCurrency(totalAtivo)}</TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </TabsContent>
        
        {/* ABA 3: PASSIVO / PL */}
        <TabsContent value="passivo" className="mt-4">
            <Card>
                <CardHeader><CardTitle className="text-xl text-red-600">Passivo e Patrimônio Líquido ({formatCurrency(totalPassivoPL)})</CardTitle></CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader><TableRow><TableHead className="w-[150px]">Conta</TableHead><TableHead>Descrição</TableHead><TableHead className="text-right w-[150px]">Saldo</TableHead></TableRow></TableHeader>
                        <TableBody>
                            {renderHierarquia(getContasPorTipo('Passivo'), 'Passivo')}
                            <TableRow className="bg-primary/10 font-bold">
                                <TableCell colSpan={2} className="pl-4">TOTAL DO PASSIVO</TableCell>
                                <TableCell className="text-right">{formatCurrency(totalPassivo)}</TableCell>
                            </TableRow>
                            
                            <TableRow className="bg-primary/10 font-bold">
                                <TableCell colSpan={3} className="pl-4 pt-6">PATRIMÔNIO LÍQUIDO</TableCell>
                            </TableRow>
                            {renderContas(getContasPorTipo('Patrimonio Liquido'))}
                            {renderContas(getContasPorTipo('Resultado'))}
                            
                            <TableRow className="bg-secondary/50 font-bold">
                                <TableCell colSpan={2} className="pl-4">TOTAL DO PASSIVO + PL</TableCell>
                                <TableCell className="text-right">{formatCurrency(totalPassivoPL)}</TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </TabsContent>
        
        {/* ABA 4: RECEITA */}
        <TabsContent value="receita" className="mt-4">
            <Card>
                <CardHeader><CardTitle className="text-xl text-green-600">Receitas ({formatCurrency(getContasPorTipo('Resultado').filter(c => c.Conta.startsWith('3')).reduce((sum, c) => sum + c.saldo_final, 0))})</CardTitle></CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader><TableRow><TableHead className="w-[150px]">Conta</TableHead><TableHead>Descrição</TableHead><TableHead className="text-right w-[150px]">Saldo</TableHead></TableRow></TableHeader>
                        <TableBody>{renderContas(getContasPorTipo('Resultado').filter(c => c.Conta.startsWith('3')))}</TableBody>
                    </Table>
                </CardContent>
            </Card>
        </TabsContent>
        
        {/* ABA 5: DESPESA */}
        <TabsContent value="despesa" className="mt-4">
            <Card>
                <CardHeader><CardTitle className="text-xl text-red-600">Despesas ({formatCurrency(getContasPorTipo('Resultado').filter(c => c.Conta.startsWith('4') || c.Conta.startsWith('5')).reduce((sum, c) => sum + c.saldo_final, 0))})</CardTitle></CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader><TableRow><TableHead className="w-[150px]">Conta</TableHead><TableHead>Descrição</TableHead><TableHead className="text-right w-[150px]">Saldo</TableHead></TableRow></TableHeader>
                        <TableBody>{renderContas(getContasPorTipo('Resultado').filter(c => c.Conta.startsWith('4') || c.Conta.startsWith('5')))}</TableBody>
                    </Table>
                </CardContent>
            </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default BalancoPatrimonialDetalhe;