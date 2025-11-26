import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { TransacaoExtrato } from '@/types/conciliacao';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ExistingLaunchesTabProps {
  transacoesRejeitadas: TransacaoExtrato[];
  loading: boolean;
  formatCurrency: (value: number) => string;
}

const ExistingLaunchesTab: React.FC<ExistingLaunchesTabProps> = ({ transacoesRejeitadas, loading, formatCurrency }) => {
  
  const totalRejeitadas = transacoesRejeitadas.length;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center text-red-600">
          <AlertTriangle className="w-5 h-5 mr-2" /> Lançamentos Existentes ({totalRejeitadas})
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        <div className="p-3 bg-red-100 dark:bg-red-900/20 border border-red-500 rounded-md mb-4">
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                Estas transações foram encontradas na base de dados (tabela 'extratos') e foram rejeitadas para evitar duplicidade.
            </p>
        </div>

        <div className="overflow-x-auto overflow-y-auto flex-1 border rounded-md max-h-[70vh]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Data</TableHead>
                <TableHead className="min-w-[200px]">Descrição</TableHead>
                <TableHead className="w-[80px]">Tipo</TableHead>
                <TableHead className="w-[120px] text-right">Valor</TableHead>
                <TableHead className="min-w-[200px]">Motivo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center h-24">Carregando...</TableCell></TableRow>
              ) : totalRejeitadas === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center h-24 text-muted-foreground">Nenhum lançamento duplicado encontrado no arquivo importado.</TableCell></TableRow>
              ) : (
                transacoesRejeitadas.map((t, i) => (
                  <TableRow key={i} className="bg-red-500/10">
                    <TableCell className="text-xs">{t.data}</TableCell>
                    <TableCell className="text-sm">{t.descricao}</TableCell>
                    <TableCell>
                      <Badge variant={t.tipo === 'Entrada' ? 'success' : 'destructive'} className="flex items-center justify-center">
                        {t.tipo === 'Entrada' ? <ArrowUpCircle className="w-3 h-3 mr-1" /> : <ArrowDownCircle className="w-3 h-3 mr-1" />}
                        {t.tipo}
                      </Badge>
                    </TableCell>
                    <TableCell className={cn("text-right font-semibold text-sm", t.tipo === 'Entrada' ? 'text-green-600' : 'text-red-600')}>
                      {formatCurrency(Math.abs(t.valor))}
                    </TableCell>
                    <TableCell className="text-xs font-medium text-red-700">{t.motivoDuplicidade}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default ExistingLaunchesTab;