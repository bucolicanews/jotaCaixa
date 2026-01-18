import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BadgeDollarSign, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PagBankPaymentStatus } from '@/components/contas-receber/PagBankPaymentStatus';
import { VisualizarCodigoDialog } from '@/components/ui/VisualizarCodigoDialog';

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
    const [codigoParaVisualizar, setCodigoParaVisualizar] = useState<{ title: string; description?: string, code: string } | null>(null);

    return (
        <Card>
            <CardHeader><CardTitle>Parcelas Pendentes e Recebidas ({parcelasFiltradas.length})</CardTitle></CardHeader>
            <CardContent>
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[120px]">Ações</TableHead>
                                <TableHead className="w-[100px]">ID Parcela</TableHead>
                                <TableHead>Cliente</TableHead>
                                <TableHead>Descrição</TableHead>
                                <TableHead>Nº</TableHead>
                                <TableHead>Vencimento</TableHead>
                                <TableHead>Valor</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>ID Conta</TableHead>
                                <TableHead>Cód. Conta</TableHead>
                                <TableHead>Cód. Transação</TableHead>
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
                                                    disabled={isPaga || p.status === 'bloqueada' || p.status === 'cancelada'}
                                                    title={isPaga ? 'Esta parcela já foi recebida' : (p.status === 'bloqueada' || p.status === 'cancelada' ? `Status: ${p.status}`: 'Registrar recebimento')}
                                                >
                                                    <BadgeDollarSign className="w-4 h-4 mr-2 hidden sm:inline" /> Receber
                                                </Button>
                                            </TableCell>
                                            <TableCell>
                                                <Button
                                                    variant="link"
                                                    size="sm"
                                                    className="p-0 h-auto font-mono text-xs"
                                                    onClick={() => setCodigoParaVisualizar({ title: 'ID da Parcela', code: p.id })}
                                                    title={`Visualizar ID da Parcela: ${p.id}`}
                                                >
                                                    {p.id.substring(0, 8)}...
                                                </Button>
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                {razaoSocial && <div className="font-bold text-foreground">{razaoSocial}</div>}
                                                <div className={cn(razaoSocial && "text-xs text-muted-foreground")}>{clienteNome}</div>
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">{descricao}</TableCell>
                                            <TableCell className="text-center">{p.numero_parcela}</TableCell>
                                            <TableCell>{formatDate(p.data_vencimento)}</TableCell>
                                            <TableCell>{formatCurrency(p.valor_parcela)}</TableCell>
                                            <TableCell>
                                                <Badge variant={statusVariant}>{p.status === 'paga' ? 'recebida' : p.status}</Badge>
                                            </TableCell>
                                            <TableCell>
                                                 <Button
                                                    variant="link"
                                                    size="sm"
                                                    className="p-0 h-auto font-mono text-xs"
                                                    onClick={() => setCodigoParaVisualizar({ title: 'ID da Conta', code: contaId })}
                                                     title={`Visualizar ID da Conta: ${contaId}`}
                                                >
                                                    {contaId.substring(0, 8)}...
                                                </Button>
                                            </TableCell>
                                            <TableCell>
                                                {p.pagbank_checkout_id ? (
                                                    <Button
                                                        variant="link"
                                                        size="sm"
                                                        className="p-0 h-auto font-mono text-xs"
                                                        onClick={() => setCodigoParaVisualizar({ 
                                                            title: 'Código da Conta (PagBank)', 
                                                            description: 'Este é o ID do checkout gerado pelo PagBank.',
                                                            code: p.pagbank_checkout_id! 
                                                        })}
                                                        title={`Visualizar Código da Conta: ${p.pagbank_checkout_id}`}
                                                    >
                                                        Ver Código
                                                    </Button>
                                                ) : <span className="text-muted-foreground">-</span>}
                                            </TableCell>
                                            <TableCell>
                                                {p.pagbank_charge_id ? (
                                                    <Button
                                                        variant="link"
                                                        size="sm"
                                                        className="p-0 h-auto font-mono text-xs"
                                                        onClick={() => setCodigoParaVisualizar({ 
                                                            title: 'Código da Transação (PagBank)', 
                                                            description: 'Este é o ID da cobrança (charge) ou pedido (order) no PagBank.',
                                                            code: p.pagbank_charge_id! 
                                                        })}
                                                        title={`Visualizar Código da Transação: ${p.pagbank_charge_id}`}
                                                    >
                                                        Ver Código
                                                    </Button>
                                                ) : <span className="text-muted-foreground">-</span>}
                                            </TableCell>
                                            <TableCell>
                                                {(p.pagbank_charge_id || p.pagbank_checkout_id) ? (
                                                    <div className="space-y-1 text-center">
                                                        <PagBankPaymentStatus status={p.pagbank_status as any} />
                                                        <Button
                                                            size="xs"
                                                            variant="outline"
                                                            onClick={() => onVisualizarLinkPagBank?.(p)}
                                                        >
                                                            <Eye className="h-3 w-3 mr-1" />
                                                            Ver Link
                                                        </Button>
                                                    </div>
                                                ) : p.status === 'aberta' ? (
                                                    <Button
                                                        size="xs"
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
                {codigoParaVisualizar && (
                    <VisualizarCodigoDialog
                        open={!!codigoParaVisualizar}
                        onOpenChange={(isOpen) => !isOpen && setCodigoParaVisualizar(null)}
                        title={codigoParaVisualizar.title}
                        description={codigoParaVisualizar.description}
                        code={codigoParaVisualizar.code}
                    />
                )}
            </CardContent>
        </Card>
    );
};

export default TabelaParcelas;