import React from 'react';
import { ContaReceberComProgresso, ContaReceber } from '@/types/contas-receber';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Edit } from 'lucide-react';

interface TabelaContasReceberProps {
    contas: ContaReceberComProgresso[];
    // onOpenParcelas removido
    onEditConta: (conta: ContaReceber | null) => void;
}

const TabelaContasReceber: React.FC<TabelaContasReceberProps> = ({ contas, onEditConta }) => {
    // Implementação placeholder
    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Valor Total</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {contas.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={6} className="h-24 text-center">
                                Nenhuma conta a receber encontrada.
                            </TableCell>
                        </TableRow>
                    ) : (
                        contas.map((conta) => (
                            <TableRow key={conta.id}>
                                <TableCell>{conta.descricao}</TableCell>
                                <TableCell>{conta.clientes?.nome || 'N/A'}</TableCell>
                                <TableCell>{/* formatCurrency(conta.valor_total) */}</TableCell>
                                <TableCell>{/* formatDate(conta.data_vencimento) */}</TableCell>
                                <TableCell>{conta.status}</TableCell>
                                <TableCell className="text-right space-x-2">
                                    <Button variant="ghost" size="sm" onClick={() => onEditConta(conta)}>
                                        <Edit className="h-4 w-4" />
                                    </Button>
                                    {/* Ação de ver parcelas seria implementada aqui */}
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </div>
    );
};

export default TabelaContasReceber;