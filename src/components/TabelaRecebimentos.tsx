import React from 'react';
import { AdminRecebimento } from '@/types/contas-receber';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatDateTime } from '@/utils/formatters';

interface TabelaRecebimentosProps {
    recebimentos: AdminRecebimento[];
}

const TabelaRecebimentos: React.FC<TabelaRecebimentosProps> = ({ recebimentos }) => {
    // Implementação placeholder
    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Forma Pagamento</TableHead>
                        <TableHead>Descrição Conta</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {recebimentos.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={4} className="h-24 text-center">
                                Nenhum recebimento encontrado.
                            </TableCell>
                        </TableRow>
                    ) : (
                        recebimentos.map((rec) => (
                            <TableRow key={rec.id}>
                                <TableCell>{formatDateTime(rec.data_recebimento)}</TableCell>
                                <TableCell>{formatCurrency(rec.valor_recebido)}</TableCell>
                                <TableCell>{rec.forma_pagamento}</TableCell>
                                <TableCell>{rec.admin_parcelas_receber?.admin_contas_receber?.descricao || 'N/A'}</TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </div>
    );
};

export default TabelaRecebimentos;