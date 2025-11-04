import React from 'react';
import { ExtendedParcelaDetalhada } from '@/types/contas-receber';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Eye } from 'lucide-react';
import { formatCurrency, formatDate } from '@/utils/formatters';

interface TabelaParcelasReceberProps {
    parcelas: ExtendedParcelaDetalhada[];
    onOpenParcela: (parcela: ExtendedParcelaDetalhada) => void;
}

const TabelaParcelasReceber: React.FC<TabelaParcelasReceberProps> = ({ parcelas, onOpenParcela }) => {
    // Implementação placeholder
    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Conta</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {parcelas.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={7} className="h-24 text-center">
                                Nenhuma parcela a receber encontrada.
                            </TableCell>
                        </TableRow>
                    ) : (
                        parcelas.map((parcela) => (
                            <TableRow key={parcela.id}>
                                <TableCell>{parcela.numero_parcela}</TableCell>
                                <TableCell>{parcela.contas_receber?.descricao || 'N/A'}</TableCell>
                                <TableCell>{parcela.contas_receber?.clientes?.nome || 'N/A'}</TableCell>
                                <TableCell>{formatCurrency(parcela.valor_parcela)}</TableCell>
                                <TableCell>{formatDate(parcela.data_vencimento)}</TableCell>
                                <TableCell>{parcela.status}</TableCell>
                                <TableCell className="text-right">
                                    <Button variant="ghost" size="sm" onClick={() => onOpenParcela(parcela)}>
                                        <Eye className="h-4 w-4" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </div>
    );
};

export default TabelaParcelasReceber;