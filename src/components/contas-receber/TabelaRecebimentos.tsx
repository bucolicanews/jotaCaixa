import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AdminRecebimento } from '@/types/contas-receber';
import { cn } from '@/lib/utils';

interface TabelaRecebimentosProps {
    recebimentosFiltrados: AdminRecebimento[];
    clienteNomeMap: Record<string, string>;
    formatCurrency: (value: number) => string;
    formatTimestamp: (dateString: string) => string;
}

const TabelaRecebimentos: React.FC<TabelaRecebimentosProps> = ({
    recebimentosFiltrados,
    clienteNomeMap,
    formatCurrency,
    formatTimestamp,
}) => {
    return (
        <Card>
            <CardHeader><CardTitle>Histórico de Recebimentos ({recebimentosFiltrados.length})</CardTitle></CardHeader>
            <CardContent>
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Data Recebimento</TableHead>
                                <TableHead className="w-[100px]">ID Conta</TableHead>
                                <TableHead>Cliente</TableHead>
                                <TableHead>Descrição</TableHead>
                                <TableHead className="text-right">Valor Principal</TableHead> {/* NOVA COLUNA */}
                                <TableHead className="text-right">Juros</TableHead>
                                <TableHead className="text-right">Valor Recebido</TableHead>
                                <TableHead>Forma Pagamento</TableHead>
                                <TableHead>Conta/Caixa</TableHead>
                                <TableHead>Origem</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {recebimentosFiltrados.length === 0 ? (
                                <TableRow><TableCell colSpan={10} className="text-center h-24">Nenhum recebimento encontrado no período.</TableCell></TableRow>
                            ) : (
                                recebimentosFiltrados.map((r) => {
                                    const dataRecebimentoDisplay = formatTimestamp(r.data_recebimento);
                                    const clienteNome = clienteNomeMap[r.cliente_id] || 'N/A';
                                    const descricao = r.admin_parcelas_receber?.admin_contas_receber?.descricao || 'N/A';
                                    const origem = r.admin_parcelas_receber?.admin_contas_receber?.origem || 'manual';
                                    const contaDestino = r.saldo_contas?.nome || 'N/A';
                                    const contaId = r.admin_parcelas_receber?.admin_contas_receber?.id || 'N/A';
                                    
                                    // Lógica de Valores
                                    const valorPrincipal = r.admin_parcelas_receber?.valor_parcela || 0;
                                    const valorTotalRecebido = r.valor_recebido;
                                    const juros = valorTotalRecebido > valorPrincipal ? valorTotalRecebido - valorPrincipal : 0;

                                    return (
                                        <TableRow key={r.id}>
                                            <TableCell>{dataRecebimentoDisplay}</TableCell>
                                            <TableCell className="font-mono text-xs text-muted-foreground truncate max-w-[100px]" title={contaId}>{contaId.substring(0, 8)}...</TableCell>
                                            <TableCell className="font-medium">{clienteNome}</TableCell>
                                            <TableCell className="text-sm text-muted-foreground">{descricao}</TableCell>
                                            
                                            {/* Valor Principal */}
                                            <TableCell className="text-right font-medium">
                                                {formatCurrency(valorPrincipal)}
                                            </TableCell>

                                            {/* Juros */}
                                            <TableCell className={cn("text-right font-medium", juros > 0 ? "text-red-600" : "text-muted-foreground")}>
                                                {juros > 0 ? `+ ${formatCurrency(juros)}` : '-'}
                                            </TableCell>

                                            {/* Valor Total Recebido */}
                                            <TableCell className="text-right font-bold text-green-600">
                                                {formatCurrency(valorTotalRecebido)}
                                            </TableCell>

                                            <TableCell>{r.forma_pagamento}</TableCell>
                                            <TableCell>{contaDestino}</TableCell>
                                            <TableCell><Badge variant="secondary">{origem}</Badge></TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
};

export default TabelaRecebimentos;