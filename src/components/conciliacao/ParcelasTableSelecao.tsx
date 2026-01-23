import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

interface ParcelaMatching {
  id: string;
  clienteNome?: string;
  fornecedorNome?: string;
  numeroParcela: number;
  dataVencimento: string;
  valor_parcela: number;
  matchScore?: number;
}

interface Props {
  parcelas: ParcelaMatching[];
  tipo: 'CP' | 'CR';
  parcelasSelecionadas: Map<string, number>;
  onToggleSelecao: (parcelaId: string, selecionado: boolean) => void;
  onValorChange: (parcelaId: string, valor: number) => void;
  valorTransacao: number;
  loading?: boolean;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString('pt-BR');

export const ParcelasTableSelecao: React.FC<Props> = ({
  parcelas,
  tipo,
  parcelasSelecionadas,
  onToggleSelecao,
  onValorChange,
  valorTransacao,
  loading = false,
}) => {
  const handleCheckboxChange = (parcelaId: string, checked: boolean) => {
    onToggleSelecao(parcelaId, checked);

    // Se selecionou, preencher com valor total da parcela
    if (checked) {
      const parcela = parcelas.find((p) => p.id === parcelaId);
      if (parcela) {
        onValorChange(parcelaId, parcela.valor_parcela);
      }
    }
  };

  const handleValorInputChange = (parcelaId: string, novoValor: number) => {
    const parcela = parcelas.find((p) => p.id === parcelaId);

    // Validar: não exceder valor original
    const valorFinal = Math.min(novoValor, parcela?.valor_parcela || 0);

    onValorChange(parcelaId, valorFinal);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        <span className="ml-2 text-sm text-gray-500">Carregando parcelas...</span>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[50px]">Sel.</TableHead>
          <TableHead>{tipo === 'CR' ? 'Cliente' : 'Fornecedor'}</TableHead>
          <TableHead>Nº</TableHead>
          <TableHead>Vencimento</TableHead>
          <TableHead>Valor Original</TableHead>
          <TableHead>Valor a Aplicar</TableHead>
          <TableHead>Score</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {parcelas.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7} className="text-center py-8 text-gray-500">
              Nenhuma parcela encontrada com valor exato.
            </TableCell>
          </TableRow>
        ) : (
          parcelas.map((parcela) => {
            const isSelecionada = parcelasSelecionadas.has(parcela.id);
            const valorAplicar = parcelasSelecionadas.get(parcela.id) || 0;

            return (
              <TableRow
                key={parcela.id}
                className={isSelecionada ? 'bg-blue-50' : ''}
              >
                <TableCell>
                  <Checkbox
                    checked={isSelecionada}
                    onCheckedChange={(checked) =>
                      handleCheckboxChange(parcela.id, !!checked)
                    }
                  />
                </TableCell>
                <TableCell>
                  {tipo === 'CR' ? parcela.clienteNome : parcela.fornecedorNome}
                </TableCell>
                <TableCell>{parcela.numeroParcela}</TableCell>
                <TableCell>{formatDate(parcela.dataVencimento)}</TableCell>
                <TableCell>{formatCurrency(parcela.valor_parcela)}</TableCell>
                <TableCell>
                  {isSelecionada ? (
                    <Input
                      type="number"
                      value={valorAplicar}
                      onChange={(e) =>
                        handleValorInputChange(parcela.id, Number(e.target.value))
                      }
                      max={parcela.valor_parcela}
                      step="0.01"
                      className="w-32"
                    />
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      (parcela.matchScore || 0) >= 80
                        ? 'default'
                        : (parcela.matchScore || 0) >= 50
                        ? 'secondary'
                        : 'outline'
                    }
                  >
                    {parcela.matchScore || 0}%
                  </Badge>
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
};
