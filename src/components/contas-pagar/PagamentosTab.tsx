import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

interface PagamentosTabProps {
    loading: boolean;
    pagamentos: any[];
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
            </div>

            <Card>
                <CardHeader><CardTitle>Histórico de Pagamentos</CardTitle></CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="text-xs text-muted-foreground">ID Parcela</TableHead>
                                    <TableHead>Data Pagamento</TableHead>
                                    <TableHead>Fornecedor</TableHead>
                                    <TableHead>Descrição</TableHead>
                                    <TableHead className="text-center">Nº Parcela</TableHead>
                                    <TableHead>Tipo</TableHead>
                                    <TableHead>Histórico</TableHead>
                                    <TableHead className="text-right">Valor Pago</TableHead>
                                    <TableHead>Conta Origem</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow><TableCell colSpan={9} className="text-center">Carregando...</TableCell></TableRow>
                                ) : pagamentos.length === 0 ? (
                                    <TableRow><TableCell colSpan={9} className="text-center">Nenhum pagamento encontrado no período.</TableCell></TableRow>
                                ) : (
                                    pagamentos.map((p) => {
                                        const parcelaCP = p.admin_parcelas_pagar || p.parcelas_contas_pagar;
                                        const contaCP = parcelaCP?.admin_contas_pagar || parcelaCP?.contas_pagar;
                                        const descricao = contaCP?.descricao || 'N/A';
                                        const fornecedor = contaCP?.fornecedor || 'N/A';
                                        const historicoDesc = p.historicos?.descricao || '-';
                                        const saldoDevedor = parcelaCP?.valor_parcela
                                            ? parcelaCP.valor_parcela - (parcelaCP.valor_pago || 0)
                                            : null;
                                        const tipo = saldoDevedor !== null && saldoDevedor > 0.01 ? 'Parcial' : 'Total';

                                        return (
                                            <TableRow key={p.id}>
                                                <TableCell className="text-xs text-muted-foreground font-mono">
                                                    {p.parcela_id ? p.parcela_id.substring(0, 8) : '-'}
                                                </TableCell>
                                                <TableCell>{formatarData(p.data_pagamento)}</TableCell>
                                                <TableCell className="text-sm">{fornecedor}</TableCell>
                                                <TableCell className="text-sm">{descricao}</TableCell>
                                                <TableCell className="text-center">{parcelaCP?.numero_parcela || 'N/A'}</TableCell>
                                                <TableCell>
                                                    <Badge variant={tipo === 'Parcial' ? 'warning' : 'success'} className="text-xs">
                                                        {tipo}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-sm text-muted-foreground">{historicoDesc}</TableCell>
                                                <TableCell className="text-right font-semibold text-destructive">{formatCurrency(p.valor_pago)}</TableCell>
                                                <TableCell className="text-sm">{p.saldo_contas?.nome || 'N/A'}</TableCell>
                                            </TableRow>
                                        );
                                    })
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
