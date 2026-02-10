import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { DollarSign, ListChecks, Receipt, TrendingUp, TrendingDown } from 'lucide-react';
import { ContaReceberComProgresso, ExtendedParcelaDetalhada, AdminRecebimento } from '@/types/contas-receber';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/utils/formatters';

interface ContasReceberResumoProps {
  activeTab: string;
  contasFiltradas: ContaReceberComProgresso[];
  parcelasFiltradas: ExtendedParcelaDetalhada[];
  recebimentosFiltrados: AdminRecebimento[];
}

const ContasReceberResumo: React.FC<ContasReceberResumoProps> = ({
  activeTab,
  contasFiltradas,
  parcelasFiltradas,
  recebimentosFiltrados,
}) => {

  const { totalSintetico, totalParcelas, totalRecebido, saldoRestante, totalRecebimentos } = useMemo(() => {
    // --- 1. Resumo Sintético ---
    const totalSintetico = contasFiltradas.reduce((sum, conta) => sum + conta.valor_total, 0);

    // --- 2. Resumo Analítico (Parcelas) ---
    const totalParcelas = parcelasFiltradas.reduce((sum, p) => sum + p.valor_parcela, 0);
    const totalRecebido = parcelasFiltradas.reduce((sum, p) => sum + (p.valor_pago || 0), 0);
    
    // Saldo Restante: Positivo significa que falta receber. Negativo significa que recebeu a mais.
    const saldoRestante = totalParcelas - totalRecebido;

    // --- 3. Resumo Recebimentos ---
    const totalRecebimentos = recebimentosFiltrados.reduce((sum, r) => sum + Number(r.valor_recebido), 0);

    return { totalSintetico, totalParcelas, totalRecebido, saldoRestante, totalRecebimentos };
  }, [contasFiltradas, parcelasFiltradas, recebimentosFiltrados]);

  const renderResumo = () => {
    if (activeTab === 'parcela_sintetica') {
      return (
        <Card className="border-l-4 border-primary">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center">
              <DollarSign className="w-4 h-4 mr-2" /> Total Sintético (Valor Total)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalSintetico)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Soma dos valores totais dos lançamentos filtrados.
            </p>
          </CardContent>
        </Card>
      );
    }

    if (activeTab === 'parcelas') {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Card className="border-l-4 border-blue-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium flex items-center">
                <ListChecks className="w-4 h-4 mr-2" /> Valor Total (Parcelas)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">{formatCurrency(totalParcelas)}</div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-green-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Valor Recebido</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-green-600">{formatCurrency(totalRecebido)}</div>
            </CardContent>
          </Card>
          <Card className={cn("border-l-4", saldoRestante <= 0 ? "border-green-500" : "border-red-500")}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium flex items-center">
                {saldoRestante < 0 ? (
                    <><TrendingUp className="w-4 h-4 mr-2 text-blue-600" /> Valor Recebido a Maior</>
                ) : (
                    <><TrendingDown className="w-4 h-4 mr-2 text-red-600" /> Valor Recebido a Menor (Saldo)</>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={cn("text-xl font-bold", saldoRestante < 0 ? "text-blue-600" : "text-red-600")}>
                {formatCurrency(Math.abs(saldoRestante))}
              </div>
            </CardContent>
          </Card>
          <Card className={cn("border-l-4", saldoRestante <= 0 ? "border-green-500" : "border-red-500")}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Diferença (Saldo)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={cn("text-xl font-bold", saldoRestante <= 0 ? "text-green-600" : "text-red-600")}>
                {formatCurrency(saldoRestante)}
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    if (activeTab === 'recebimentos') {
      return (
        <Card className="border-l-4 border-green-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center">
              <Receipt className="w-4 h-4 mr-2" /> Total Recebido (Histórico)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(totalRecebimentos)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Soma dos valores recebidos no período filtrado.
            </p>
          </CardContent>
        </Card>
      );
    }

    return null;
  };

  return (
    <div className="mb-6">
      {renderResumo()}
    </div>
  );
};

export default ContasReceberResumo;