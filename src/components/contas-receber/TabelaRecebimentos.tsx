import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
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
                                <TableHead className="w-[90px]">ID Parcela</TableHead>
                                <TableHead>Cliente</TableHead>
                                <TableHead>Descrição</TableHead>
                                <TableHead className="text-right">Valor Principal</TableHead>
                                <TableHead className="text-right">Juros</TableHead>
                                <TableHead className="text-right">Valor Recebido</TableHead>
                                <TableHead>Forma Pagamento</TableHead>
                                <TableHead>Cód. Transação</TableHead>
                                <TableHead>Conta/Caixa</TableHead>
                                <TableHead>Histórico</TableHead>
                                <TableHead>Tipo</TableHead>
                                <TableHead>Origem</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {recebimentosFiltrados.length === 0 ? (
                                <TableRow><TableCell colSpan={14} className="text-center h-24">Nenhum recebimento encontrado no período.</TableCell></TableRow>
                            ) : (
                                recebimentosFiltrados.map((r) => {
                                    const dataRecebimentoDisplay = formatTimestamp(r.data_recebimento);
                                    const clienteNome = clienteNomeMap[r.cliente_id] || 'N/A';
                                    const descricao = r.admin_parcelas_receber?.admin_contas_receber?.descricao || 'N/A';
                                    const origem = r.admin_parcelas_receber?.admin_contas_receber?.origem || 'manual';
                                    const contaDestino = r.saldo_contas?.nome || 'N/A';
                                    const contaId = r.admin_parcelas_receber?.admin_contas_receber?.id || 'N/A';
                                    const parcelaId = (r as any).parcela_id || null;
                                    const historicoDescricao = (r as any).historicos?.descricao || '-';
                                    const tipoRecebimento = (r as any).tipo_recebimento || null;
                                    
                                    const valorPrincipal = r.admin_parcelas_receber?.valor_parcela || 0;
                                    const valorTotalRecebido = r.valor_recebido;
                                    const juros = valorTotalRecebido > valorPrincipal ? valorTotalRecebido - valorPrincipal : 0;

                                    return (
                                        <TableRow key={r.id}>
                                            <TableCell>{dataRecebimentoDisplay}</TableCell>
                                            <TableCell className="font-mono text-xs text-muted-foreground truncate max-w-[100px]" title={contaId}>{contaId.substring(0, 8)}...</TableCell>
                                            <TableCell className="font-mono text-xs text-muted-foreground" title={parcelaId || ''}>{parcelaId ? parcelaId.substring(0, 8) : '-'}</TableCell>
                                            <TableCell className="font-medium">{clienteNome}</TableCell>
                                            <TableCell className="text-sm text-muted-foreground">{descricao}</TableCell>
                                            
                                            <TableCell className="text-right font-medium">
                                                {formatCurrency(valorPrincipal)}
                                            </TableCell>

                                            <TableCell className={cn("text-right font-medium", juros > 0 ? "text-red-600" : "text-muted-foreground")}>
                                                {juros > 0 ? `+ ${formatCurrency(juros)}` : '-'}
                                            </TableCell>

                                            <TableCell className="text-right font-bold text-green-600">
                                                {formatCurrency(valorTotalRecebido)}
                                            </TableCell>

                                            <TableCell>{r.forma_pagamento}</TableCell>
                                            <TableCell className="text-xs">
                                                <div className="space-y-1 min-w-[140px]">
                                                    {r.codigo_transacao && (
                                                        <div className="flex items-center gap-1">
                                                            <code className="text-[10px] font-mono bg-muted px-1 rounded truncate max-w-[100px]" title={r.codigo_transacao}>
                                                                {r.codigo_transacao.substring(0, 12)}...
                                                            </code>
                                                            <Button size="icon" variant="ghost" className="h-5 w-5"
                                                                onClick={() => { navigator.clipboard.writeText(r.codigo_transacao!); toast.success('Código copiado!'); }}>
                                                                <Copy className="h-3 w-3" />
                                                            </Button>
                                                        </div>
                                                    )}
                                                    {r.pagbank_charge_id && (
                                                        <div className="flex items-center gap-1">
                                                            <span className="text-muted-foreground font-medium text-[10px]">Charge:</span>
                                                            <code className="text-[10px] font-mono bg-muted px-1 rounded truncate max-w-[80px]" title={r.pagbank_charge_id}>
                                                                {r.pagbank_charge_id.substring(0, 12)}...
                                                            </code>
                                                            <Button size="icon" variant="ghost" className="h-5 w-5"
                                                                onClick={() => { navigator.clipboard.writeText(r.pagbank_charge_id!); toast.success('Charge ID copiado!'); }}>
                                                                <Copy className="h-3 w-3" />
                                                            </Button>
                                                        </div>
                                                    )}
                                                    {!r.codigo_transacao && !r.pagbank_charge_id && (
                                                        <span className="text-muted-foreground">-</span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>{contaDestino}</TableCell>
                                            <TableCell className="text-sm text-muted-foreground">{historicoDescricao}</TableCell>
                                            <TableCell>
                                                {tipoRecebimento ? (
                                                    <Badge variant={tipoRecebimento === 'total' ? 'success' : 'warning'} className="text-xs">
                                                        {tipoRecebimento === 'total' ? 'Total' : 'Parcial'}
                                                    </Badge>
                                                ) : '-'}
                                            </TableCell>
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