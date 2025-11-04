import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatarData } from '@/utils/formatters';

interface PagamentosTabProps {
    loading: boolean;
    pagamentos: any[]; // Usando 'any' conforme o tipo definido no ContasPagar.tsx
    totalPagamentos: number;
    formatarData: (date: string) => string;
    formatCurrency: (value: number) => string;
}

const PagamentosTab: React.FC<PagamentosTabProps> = ({
    loading,
    pagamentos,
    totalPagamentos,
    formatarData,
    formatCurrency,
}) => {
    return (
        <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="border-l-4 border-success">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Total Pago</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold">{formatCurrency(totalPagamentos)}</div></CardContent>
                </Card>
                {/* Outros cards de resumo de pagamentos */}
            </div>
            
            <Card>
                <CardHeader><CardTitle>Histórico de Pagamentos</CardTitle></CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Data Pagamento</TableHead>
                                    <TableHead>Valor Pago</TableHead>
                                    <TableHead>Conta Origem</TableHead>
                                    <TableHead>Descrição Parcela</TableHead>
                                    <TableHead>Nº Parcela</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow><TableCell colSpan={5} className="text-center">Carregando...</TableCell></TableRow>
                                ) : pagamentos.length === 0 ? (
                                    <TableRow><TableCell colSpan={5} className="text-center">Nenhum pagamento encontrado no período.</TableCell></TableRow>
                                ) : (
                                    pagamentos.map((p) => (
                                        <TableRow key={p.id}>
                                            <TableCell>{formatarData(p.data_pagamento)}</TableCell>
                                            <TableCell className="font-semibold text-destructive">{formatCurrency(p.valor_pago)}</TableCell>
                                            <TableCell>{p.saldo_contas?.nome || 'N/A'}</TableCell>
                                            <TableCell>{p.admin_parcelas_pagar?.admin_contas_pagar?.descricao || 'N/A'}</TableCell>
                                            <TableCell>{p.admin_parcelas_pagar?.numero_parcela || 'N/A'}</TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default PagamentosTab;