import React, { useState } from 'react';
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
import { Button } from '@/components/ui/button';
import { Loader2, Link2 } from 'lucide-react';
import { VinculosParcelaDialog } from './VinculosParcelaDialog';

interface ParcelaMatching {
  id: string;
  clienteNome?: string;
  fornecedorNome?: string;
  descricao?: string;
  numeroParcela: number;
  dataVencimento: string;
  valor_parcela: number;
  valorPago?: number;
  valorRestante?: number;
  matchScore?: number;
  status?: string;
  temLancamento?: boolean;
}

interface Props {
  parcelas: ParcelaMatching[];
  tipo: 'CP' | 'CR';
  parcelasSelecionadas: Map<string, number>;
  onToggleSelecao: (parcelaId: string, selecionado: boolean) => void;
  onValorChange: (parcelaId: string, valor: number) => void;
  valorTransacao: number;
  loading?: boolean;
  labelData?: string;
  onVinculoCriado?: () => void;
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
  labelData = 'Vencimento',
  onVinculoCriado,
}) => {
  const [vinculosDialog, setVinculosDialog] = useState<{ open: boolean; parcelaId: string | null }>({
    open: false,
    parcelaId: null,
  });

  const handleCheckboxChange = (parcelaId: string, checked: boolean) => {
    onToggleSelecao(parcelaId, checked);

    if (checked) {
      const parcela = parcelas.find((p) => p.id === parcelaId);
      if (parcela) {
        const valorMaximo = parcela.valorRestante || parcela.valor_parcela;
        const valorSugerido = Math.min(valorTransacao, valorMaximo);
        onValorChange(parcelaId, valorSugerido);
      }
    }
  };

  const handleValorInputChange = (parcelaId: string, novoValor: number) => {
    const parcela = parcelas.find((p) => p.id === parcelaId);
    const valorMaximo = parcela?.valorRestante || parcela?.valor_parcela || 0;
    const valorFinal = Math.min(novoValor, valorMaximo);
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
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px]">Sel.</TableHead>
            <TableHead>{tipo === 'CR' ? 'Cliente' : 'Fornecedor'}</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead>Nº</TableHead>
            <TableHead>{labelData}</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Valor Original</TableHead>
            <TableHead>Valor Pago</TableHead>
            <TableHead>Valor Restante</TableHead>
            <TableHead>Valor a Aplicar</TableHead>
            <TableHead className="w-[80px]">Vínculos</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {parcelas.length === 0 ? (
            <TableRow>
              <TableCell colSpan={11} className="text-center py-8 text-gray-500">
                Nenhuma parcela encontrada.
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
                  <TableCell className="max-w-[180px] truncate text-sm text-muted-foreground" title={parcela.descricao}>
                    {parcela.descricao || '-'}
                  </TableCell>
                  <TableCell>{parcela.numeroParcela}</TableCell>
                  <TableCell>{formatDate(parcela.dataVencimento)}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge
                        variant={parcela.status === 'reprogramada' ? 'secondary' : 'default'}
                        className={parcela.status === 'reprogramada' ? 'bg-orange-100 text-orange-800' : 'bg-yellow-100 text-yellow-800'}
                      >
                        {parcela.status}
                      </Badge>
                      {parcela.status === 'paga' && parcela.temLancamento !== undefined && (
                        parcela.temLancamento ? (
                          <Badge className="bg-green-100 text-green-800 text-xs">Lanc. OK</Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-800 text-xs">Sem Lanc.</Badge>
                        )
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{formatCurrency(parcela.valor_parcela)}</TableCell>
                  <TableCell>{formatCurrency(parcela.valorPago || 0)}</TableCell>
                  <TableCell className="font-semibold text-orange-600">
                    {formatCurrency(parcela.valorRestante || parcela.valor_parcela)}
                  </TableCell>
                  <TableCell>
                    {isSelecionada ? (
                      <Input
                        type="number"
                        value={valorAplicar}
                        onChange={(e) =>
                          handleValorInputChange(parcela.id, Number(e.target.value))
                        }
                        max={parcela.valorRestante || parcela.valor_parcela}
                        step="0.01"
                        className="w-32"
                      />
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                      title="Ver Vínculos"
                      onClick={() => setVinculosDialog({ open: true, parcelaId: parcela.id })}
                    >
                      <Link2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      {vinculosDialog.parcelaId && (
        <VinculosParcelaDialog
          open={vinculosDialog.open}
          onOpenChange={(open) => setVinculosDialog({ open, parcelaId: open ? vinculosDialog.parcelaId : null })}
          parcelaId={vinculosDialog.parcelaId}
          tipo={tipo}
          onLancamentoCriado={onVinculoCriado}
        />
      )}
    </>
  );
};
