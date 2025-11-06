import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency } from '@/utils/formatters';
import { cn } from '@/lib/utils';
import { useBalancoPatrimonial } from '@/hooks/use-balanco-patrimonial';
import { Loader2, Scale } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface BalancoPatrimonialDetalheProps {
  endDate: Date;
}

// Tipo auxiliar para a conta (copiado do hook)
interface ContaBalanco {
  id: string;
  Conta: string;
  Descricao: string;
  Analitica: 'Sim' | 'Não';
  saldo_final: number;
  tipo_principal: 'Ativo' | 'Passivo' | 'Patrimonio Liquido' | 'Resultado' | 'Outros';
}

const BalancoPatrimonialDetalhe: React.FC<BalancoPatrimonialDetalheProps> = ({ endDate }) => {
  const { contas, totalAtivo, totalPassivo, totalPatrimonioLiquido, carregando } = useBalancoPatrimonial(endDate);

  const resultadoLiquido = useMemo(() => {
    // Resultado Líquido é a soma das contas de Resultado (Receita/Despesa)
    return contas
      .filter(c => c.tipo_principal === 'Resultado')
      .reduce((sum, c) => sum + c.saldo_final, 0);
  }, [contas]);
  
  // Total Passivo + PL (incluindo o Resultado Líquido)
  const totalPassivoPL = totalPassivo + totalPatrimonioLiquido + resultadoLiquido;
  
  // Verifica se o balanço está equilibrado (tolerância de 0.01)
  const isBalanced = Math.abs(totalAtivo - totalPassivoPL) < 0.01;
  
  const getContasPorTipo = (tipo: ContaBalanco['tipo_principal']) => {
    return contas.filter(c => c.tipo_principal === tipo);
  };
  
  const renderContas = (contasList: ContaBalanco[]) => {
    return contasList.map(c => {
      const isSintetica = c.Analitica === 'Não';
      const isZero = Math.abs(c.saldo_final) < 0.01;
      
      if (isZero && isSintetica) return null; // Oculta sintéticas zeradas

      return (
        <TableRow key={c.id} className={cn(isSintetica ? 'bg-secondary/50 font-semibold' : 'text-sm')}>
          <TableCell className="pl-4">{c.Conta}</TableCell>
          <TableCell className={cn(isSintetica ? 'pl-4' : 'pl-8')}>{c.Descricao}</TableCell>
          <TableCell className={cn("text-right", c.saldo_final < 0 && 'text-red-600')}>
            {formatCurrency(c.saldo_final)}
          </TableCell>
        </TableRow>
      );
    });
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
        <CardHeader><CardTitle className="text-xl flex items-center"><Scale className="w-5 h-5 mr-2" /> Resumo do Balanço em {format(endDate, 'dd/MM/yyyy', { locale: ptBR })}</CardTitle></CardHeader>
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

        {/* PASSIVO + PL */}
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
              <CardHeader><CardTitle className="text-xl text-blue-600">Patrimônio Líquido ({formatCurrency(totalPatrimonioLiquido)})</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead className="w-[150px]">Conta</TableHead><TableHead>Descrição</TableHead><TableHead className="text-right w-[150px]">Saldo</TableHead></TableRow></TableHeader>
                  <TableBody>{renderContas(getContasPorTipo('Patrimonio Liquido'))}</TableBody>
                </Table>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader><CardTitle className="text-xl text-purple-600">Resultado do Período ({formatCurrency(resultadoLiquido)})</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead className="w-[150px]">Conta</TableHead><TableHead>Descrição</TableHead><TableHead className="text-right w-[150px]">Saldo</TableHead></TableRow></TableHeader>
                  <TableBody>{renderContas(getContasPorTipo('Resultado'))}</TableBody>
                </Table>
              </CardContent>
            </Card>
        </div>
      </div>
    </div>
  );
};

export default BalancoPatrimonialDetalhe;