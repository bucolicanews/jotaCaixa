import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BadgeDollarSign, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PagBankPaymentStatus } from '@/components/contas-receber/PagBankPaymentStatus';
import { toast } from 'sonner';

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
    ciente_cliente?: boolean | null;
    pagbank_charge_id?: string | null;
    pagbank_payment_link?: string | null;
    pagbank_checkout_id?: string | null;
    pagbank_checkout_link?: string | null;
    pagbank_status?: string | null;
    pagbank_qr_code?: string | null;
    pagbank_qr_code_text?: string | null;
    pagbank_payment_method?: string | null;
    pagbank_updated_at?: string | null;
    contas_receber: {
        id: string;
        descricao: string;
        clientes: { nome: string; razao_social?: string | null; telefone?: string; email?: string } | null;
    } | null;
}

interface TabelaParcelasProps {
    parcelasFiltradas: ExtendedParcelaDetalhada[];
    handleOpenPagamento: (parcela: ExtendedParcelaDetalhada) => void;
    formatCurrency: (value: number) => string;
    formatDate: (dateString: string) => string;
    getBadgeVariant: (status: ParcelaStatus, dataVencimento: string) => BadgeVariant;
    onGerarLinkPagBank?: (parcela: ExtendedParcelaDetalhada) => void;
    onVisualizarLinkPagBank?: (parcela: ExtendedParcelaDetalhada) => void;
}

const TabelaParcelas: React.FC<TabelaParcelasProps> = ({
    parcelasFiltradas,
    handleOpenPagamento,
    formatCurrency,
    formatDate,
    getBadgeVariant,
    onGerarLinkPagBank,
    onVisualizarLinkPagBank,
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
                                <TableHead>Ciente Cliente</TableHead>
                                <TableHead>PagBank</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {parcelasFiltradas.length === 0 ? (
                                <TableRow><TableCell colSpan={12} className="text-center h-24">Nenhuma parcela encontrada no período.</TableCell></TableRow>
                            ) : (
                                parcelasFiltradas.map((p) => {
                                    const statusVariant = getBadgeVariant(p.status, p.data_vencimento);
                                    const isPaga = p.status === 'paga';
                                    const cliente = p.contas_receber?.clientes;
                                    const clienteNome = cliente?.nome || 'N/A';
                                    const razaoSocial = cliente?.razao_social;
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
                                                    <BadgeDollarSign className="w-4 h-4 mr-2 hidden sm:inline" /> Receber
                                                </Button>
                                            </TableCell>
                                            <TableCell className="font-mono text-xs text-muted-foreground truncate max-w-[100px]" title={contaId}>{contaId.substring(0, 8)}...</TableCell>
                                            <TableCell className="font-medium">
                                                {razaoSocial && <div className="font-bold text-foreground">{razaoSocial}</div>}
                                                <div className={cn(razaoSocial && "text-xs text-muted-foreground")}>{clienteNome}</div>
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">{descricao}</TableCell>
                                            <TableCell className="text-center">{p.numero_parcela}</TableCell>
                                            <TableCell>{formatDate(p.data_vencimento)}</TableCell>
                                            <TableCell>{formatCurrency(p.valor_parcela)}</TableCell>
                                            <TableCell className={cn(isPaga && 'font-semibold text-green-600')}>{formatCurrency(p.valor_pago || 0)}</TableCell>
                                            <TableCell>{p.data_pagamento ? formatDate(p.data_pagamento) : '-'}</TableCell>
                                            <TableCell>
                                                <Badge variant={statusVariant}>{p.status === 'paga' ? 'recebida' : p.status}</Badge>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Badge variant={p.ciente_cliente ? 'success' : 'secondary'}>
                                                    {p.ciente_cliente ? 'Sim' : 'Não'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                {(p.pagbank_charge_id || p.pagbank_checkout_id) ? (
                                                    <div className="space-y-1">
                                                        <PagBankPaymentStatus status={p.pagbank_status as any} />
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => onVisualizarLinkPagBank?.(p)}
                                                        >
                                                            <Eye className="h-3 w-3 mr-1" />
                                                            Ver Link
                                                        </Button>
                                                    </div>
                                                ) : p.status === 'aberta' ? (
                                                    <Button
                                                        size="sm"
                                                        onClick={() => onGerarLinkPagBank?.(p)}
                                                    >
                                                        Gerar Link
                                                    </Button>
                                                ) : (
                                                    <span className="text-muted-foreground text-sm">-</span>
                                                )}
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