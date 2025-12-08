import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { formatCurrency, formatarData } from '@/utils/formatters';
import { ParcelaNaoMapeada } from '@/hooks/useMapeamento';

interface TabelaParcelasNaoMapeadasProps {
  parcelas: ParcelaNaoMapeada[];
  carregando: boolean;
  tipo: 'CP' | 'CR';
}

export const TabelaParcelasNaoMapeadas: React.FC<TabelaParcelasNaoMapeadasProps> = ({
  parcelas,
  carregando,
  tipo,
}) => {
  if (carregando) {
    return (
      <div className="flex justify-center items-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const titulo = tipo === 'CP' ? 'Fornecedor' : 'Cliente';

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[80px]">Parcela</TableHead>
            <TableHead>{titulo}</TableHead>
            <TableHead>Descricao</TableHead>
            <TableHead className="w-[120px] text-right">Valor</TableHead>
            <TableHead className="w-[120px]">Vencimento</TableHead>
            <TableHead className="w-[80px] text-center">Tipo</TableHead>
            <TableHead className="w-[100px] text-center">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {parcelas.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-4 text-muted-foreground">
                Nenhuma parcela pendente de mapeamento.
              </TableCell>
            </TableRow>
          ) : (
            parcelas.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">
                  {p.numero_parcela}/{p.total_parcelas}
                </TableCell>
                <TableCell className="font-medium">{p.fornecedor_cliente}</TableCell>
                <TableCell className="text-sm">{p.descricao}</TableCell>
                <TableCell className="text-right font-semibold text-red-600">
                  {formatCurrency(p.valor_parcela)}
                </TableCell>
                <TableCell>{formatarData(p.data_vencimento)}</TableCell>
                <TableCell className="text-center">
                  <Badge variant={tipo === 'CP' ? 'destructive' : 'success'}>
                    {tipo}
                  </Badge>
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant="outline" className="text-orange-600 border-orange-600">
                    Pendente
                  </Badge>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
};
