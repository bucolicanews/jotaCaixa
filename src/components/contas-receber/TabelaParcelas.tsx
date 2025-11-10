import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BadgeDollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';

// Tipos importados do ContasReceber.tsx
type ParcelaStatus = 'aberta' | 'parcial' | 'paga' | 'reprogramada' | 'cancelada' | 'bloqueada';
type BadgeVariant = 'success' | 'warning' | 'secondary' | 'destructive' | 'default' | 'info';

interface ExtendedParcelaDetalhada {
    id: string;
    numero_parcela: number;
    valor_parcela: number;
    valor_pago: number;
    data_vencimento: string;
    data_pagamento?: string | null;
    status: ParcelaStatus;
    contas_receber: {
        id: string;
        descricao: string;
        tbl_empresas_clientes: { nome: string } | null; // RENOMEADO
    } | null;
}

interface TabelaParcelasProps {
    parcelasFiltradas: ExtendedParcelaDetalhada[];
    handleOpenPagamento: (parcela: ExtendedParcelaDetalhada) => void;
    formatCurrency: (value: number) => string;
    formatDate: (dateString: string) => string;
    getBadgeVariant: (status: ParcelaStatus, dataVencimento: string) => BadgeVariant;
}

const TabelaParcelas: React.FC<TabelaParcelasProps> = ({
    parcelasFiltradas,
    handleOpenPagamento,
    formatCurrency,
    formatDate,
    getBadgeVariant,
}) => {
    return (
        <Card>
            <CardHeader><CardTitle>Parcelas Pendentes e Recebidas ({parcelasFiltradas.length})</CardTitle></CardHeader>
            <CardContent>
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[120px]">Ações</TableHead>
                                <TableHead className="w-[100px]">ID Conta</TableHead>
                                <TableHead>Cliente</TableHead>
                                <TableHead>Descrição</TableHead>
                                <TableHead>Nº</TableHead>
                                <TableHead>Vencimento</TableHead>
                                <TableHead>Valor</TableHead>
                                <TableHead>Vlr Pago</TableHead>
                                <TableHead>Data Recebimento</TableHead>
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {parcelasFiltradas.length === 0 ? (
                                <TableRow><TableCell colSpan={10} className="text-center h-24">Nenhuma parcela encontrada no período.</TableCell></TableRow>
                            ) : (
                                parcelasFiltradas.map((p) => {
                                    const statusVariant = getBadgeVariant(p.status, p.data_vencimento);
                                    const isPaga = p.status === 'paga';
                                    const clienteNome = p.contas_receber?.tbl_empresas_clientes?.nome || 'N/A'; // RENOMEADO
                                    const descricao = p.contas_receber?.descricao || 'N/A';
                                    const contaId = p.contas_receber?.id || 'N/A';

                                    return (
                                        <TableRow key={p.id} className={cn(isPaga && 'bg-green-500/10')}>
                                            <TableCell className="text-left min-w-[120px]">
                                                <Button 
                                                    variant="outline" 
                                                    size="sm" 
                                                    onClick={() => handleOpenPagamento(p)} 
                                                    disabled={isPaga || p.status === 'bloqueada'}
                                                >
                                                    <BadgeDollarSign className="w-4 h-4 mr-2 inline-block" /> Receber
                                                </Button>
                                            </TableCell>
                                            <TableCell className="font-mono text-xs text-muted-foreground truncate max-w-[100px]" title={contaId}>{contaId.substring(0, 8)}...</TableCell>
                                            <TableCell className="font-medium">{clienteNome}</TableCell>
                                            <TableCell className="text-sm text-muted-foreground">{descricao}</TableCell>
                                            <TableCell className="text-center">{p.numero_parcela}</TableCell>
                                            <TableCell>{formatDate(p.data_vencimento)}</TableCell>
                                            <TableCell>{formatCurrency(p.valor_parcela)}</TableCell>
                                            <TableCell className={cn(isPaga && 'font-semibold text-green-600')}>{formatCurrency(p.valor_pago || 0)}</TableCell>
                                            <TableCell>{p.data_pagamento ? formatDate(p.data_pagamento) : '-'}</TableCell>
                                            <TableCell>
                                                <Badge variant={statusVariant}>{p.status === 'paga' ? 'recebida' : p.status}</Badge>
                                            </TableCell>
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

export default TabelaParcelas;