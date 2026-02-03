import React, { useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface Parcela {
  id: string;
  numero_parcela: number;
  valor_parcela: number;
  data_vencimento: string;
  status: string;
}

interface ParcelaPaga extends Parcela {
  isNew: false;
}

interface ParcelaNova extends Parcela {
  isNew: true;
}

type ParcelaDisplay = ParcelaPaga | ParcelaNova;

interface TabelaParcelasEdicaoProps {
  parcelasPagas: ParcelaPaga[];
  novasParcelas: ParcelaNova[];
}

const formatCurrency = (val: number) => 
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

export function TabelaParcelasEdicao({
  parcelasPagas,
  novasParcelas,
}: TabelaParcelasEdicaoProps) {
  const parcelasCombinadas = useMemo(() => {
    // Combina e ordena as parcelas pelo número da parcela
    return [...parcelasPagas, ...novasParcelas].sort(
      (a, b) => a.numero_parcela - b.numero_parcela
    );
  }, [parcelasPagas, novasParcelas]);

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[100px]">#</TableHead>
            <TableHead>Valor</TableHead>
            <TableHead>Vencimento</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Observação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {parcelasCombinadas.map((parcela) => (
            <TableRow
              key={parcela.id}
              className={cn(
                parcela.isNew
                  ? 'bg-blue-50/50 dark:bg-blue-900/20'
                  : 'bg-green-50/50 dark:bg-green-900/20 opacity-70'
              )}
            >
              <TableCell className="font-medium">
                {parcela.numero_parcela}
              </TableCell>
              <TableCell className="font-semibold">
                {formatCurrency(Number(parcela.valor_parcela))}
              </TableCell>
              <TableCell>
                {format(new Date(parcela.data_vencimento), 'dd/MM/yyyy')}
              </TableCell>
              <TableCell>
                <Badge
                  variant={
                    parcela.isNew
                      ? 'default'
                      : parcela.status === 'paga'
                      ? 'success'
                      : 'secondary'
                  }
                >
                  {parcela.isNew ? 'Nova (Aberta)' : parcela.status}
                </Badge>
              </TableCell>
              <TableCell>
                {parcela.isNew
                  ? 'Nova parcela a ser gerada.'
                  : 'Parcela paga/finalizada. Não pode ser alterada.'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
