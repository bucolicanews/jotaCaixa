import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BadgeDollarSign, Eye, FileText, Link2, RefreshCw, Check, AlertTriangle, Receipt, QrCode, ShoppingCart, Edit } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PagBankPaymentStatus } from '@/components/contas-receber/PagBankPaymentStatus';
import { VisualizarCodigoDialog } from '@/components/ui/VisualizarCodigoDialog';
import ReciboRecebimentoDialog from './ReciboRecebimentoDialog';
import EditarParcelaPagaDialog from './EditarParcelaPagaDialog';

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
    pagbank_link_expira_em?: string | null;
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
    onGerarLinkPagBank?: (parcela: ExtendedParcelaDetalhada, paymentType?: 'pix' | 'checkout') => void;
    onVisualizarLinkPagBank?: (parcela: ExtendedParcelaDetalhada) => void;
    onRegerarLinkPagBank?: (parcela: ExtendedParcelaDetalhada) => void;
    onMapearComExtrato?: (parcela: ExtendedParcelaDetalhada) => void;
    onGerarBoleto?: (parcela: ExtendedParcelaDetalhada) => void;
    onRefreshData?: () => void;
}

const TabelaParcelas: React.FC<TabelaParcelasProps> = ({
    parcelasFiltradas,
    handleOpenPagamento,
    formatCurrency,
    formatDate,
    getBadgeVariant,
    onGerarLinkPagBank,
    onVisualizarLinkPagBank,
    onRegerarLinkPagBank,
    onMapearComExtrato,
    onGerarBoleto,
    onRefreshData,
}) => {
    const [codigoParaVisualizar, setCodigoParaVisualizar] = useState<{ title: string; description?: string, code: string } | null>(null);
    const [reciboDialogOpen, setReciboDialogOpen] = useState(false);
    const [parcelaParaRecibo, setParcelaParaRecibo] = useState<string | null>(null);
    const [editarDialogOpen, setEditarDialogOpen] = useState(false);
    const [parcelaParaEditar, setParcelaParaEditar] = useState<string | null>(null);

    // Função para verificar se o link expirou
    const isLinkExpirado = (parcela: ExtendedParcelaDetalhada): boolean => {
        if (!parcela.pagbank_link_expira_em) return false;
        return new Date(parcela.pagbank_link_expira_em) < new Date();
    };

    const handleOpenRecibo = (parcelaId: string) => {
        setParcelaParaRecibo(parcelaId);
        setReciboDialogOpen(true);
    };

    const handleOpenEditar = (parcelaId: string) => {
        setParcelaParaEditar(parcelaId);
        setEditarDialogOpen(true);
    };

    const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

    const toggleCardExpansion = (parcelaId: string) => {
        setExpandedCards(prev => {
            const newSet = new Set(prev);
            if (newSet.has(parcelaId)) {
                newSet.delete(parcelaId);
            } else {
                newSet.add(parcelaId);
            }
            return newSet;
        });
    };

    return (
        <Card>
            <CardHeader><CardTitle>Parcelas Pendentes e Recebidas ({parcelasFiltradas.length})</CardTitle></CardHeader>
            <CardContent>
                {/* Desktop Table - Hidden on mobile/tablet */}
                <div className="hidden lg:block overflow-x-auto">
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
                                                <div className="flex flex-col space-y-1">
                                                    <Button 
                                                        variant="outline" 
                                                        size="sm" 
                                                        onClick={() => handleOpenPagamento(p)} 
                                                        disabled={isPaga || p.status === 'bloqueada' || p.status === 'cancelada'}
                                                        title={isPaga ? 'Esta parcela já foi recebida' : (p.status === 'bloqueada' || p.status === 'cancelada' ? `Status: ${p.status}`: 'Registrar recebimento')}
                                                    >
                                                        <BadgeDollarSign className="w-4 h-4 mr-2 hidden sm:inline" /> Receber
                                                    </Button>
                                                    {isPaga && (
                                                        <Button 
                                                            variant="secondary" 
                                                            size="sm" 
                                                            onClick={() => handleOpenRecibo(p.id)}
                                                            className="bg-blue-500 hover:bg-blue-600 text-white"
                                                        >
                                                            <FileText className="w-4 h-4 mr-2" /> Recibo
                                                        </Button>
                                                    )}
                                                    {isPaga && (
                                                        <Button 
                                                            variant="outline" 
                                                            size="sm" 
                                                            onClick={() => handleOpenEditar(p.id)}
                                                            className="border-amber-500 text-amber-600 hover:bg-amber-50"
                                                        >
                                                            <Edit className="w-4 h-4 mr-2" /> Editar
                                                        </Button>
                                                    )}
                                                    {!isPaga && onMapearComExtrato && (
                                                        <Button 
                                                            variant="outline" 
                                                            size="sm" 
                                                            onClick={() => onMapearComExtrato(p)}
                                                            className="border-orange-500 text-orange-600 hover:bg-orange-50"
                                                            title="Vincular parcela com transação do extrato bancário"
                                                        >
                                                            <Link2 className="w-4 h-4 mr-2" /> Mapear Extrato
                                                        </Button>
                                                    )}
                                                    {!isPaga && onGerarBoleto && (
                                                        <>
                                                            <div className="flex gap-1">
                                                                <Button 
                                                                    variant="outline" 
                                                                    size="sm" 
                                                                    onClick={() => onGerarBoleto(p)}
                                                                    className="flex-1 border-blue-500 text-blue-600 hover:bg-blue-50"
                                                                    title="Gerar boleto bancário (vence no prazo da parcela ou D+3)"
                                                                >
                                                                    <Receipt className="w-3 h-3 mr-1" /> Boleto
                                                                </Button>
                                                                <Button 
                                                                    variant="outline" 
                                                                    size="sm" 
                                                                    onClick={() => onGerarLinkPagBank?.(p, 'pix')}
                                                                    className="flex-1 border-green-500 text-green-600 hover:bg-green-50"
                                                                    title="PIX Inteligente: expira no vencimento ou D+7"
                                                                >
                                                                    <QrCode className="w-3 h-3 mr-1" /> PIX
                                                                </Button>
                                                                <Button 
                                                                    variant="outline" 
                                                                    size="sm" 
                                                                    onClick={() => onGerarLinkPagBank?.(p, 'checkout')}
                                                                    className="flex-1 border-purple-500 text-purple-600 hover:bg-purple-50"
                                                                    title="Link Checkout: Cartão+PIX+Boleto (expira em 24h)"
                                                                >
                                                                    <ShoppingCart className="w-3 h-3 mr-1" /> Link
                                                                </Button>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
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
                                                    isLinkExpirado(p) ? (
                                                        <div className="flex flex-col gap-1">
                                                            <Badge variant="destructive" className="w-fit text-xs">
                                                                <AlertTriangle className="h-3 w-3 mr-1" />
                                                                Link Expirado
                                                            </Badge>
                                                            <Button
                                                                size="xs"
                                                                variant="outline"
                                                                onClick={() => onRegerarLinkPagBank?.(p)}
                                                                className="text-orange-600 border-orange-600 hover:bg-orange-50"
                                                            >
                                                                <RefreshCw className="h-3 w-3 mr-1" />
                                                                Regerar Link
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <div className="space-y-1 text-center">
                                                            <div className="flex flex-col gap-1">
                                                                <Badge variant="default" className="w-fit text-xs bg-green-600">
                                                                    <Check className="h-3 w-3 mr-1" />
                                                                    Link Ativo
                                                                </Badge>
                                                                {p.pagbank_link_expira_em && (
                                                                    <span className="text-[10px] text-muted-foreground">
                                                                        Expira: {new Date(p.pagbank_link_expira_em).toLocaleDateString('pt-BR', {
                                                                            day: '2-digit',
                                                                            month: '2-digit',
                                                                            hour: '2-digit',
                                                                            minute: '2-digit'
                                                                        })}
                                                                    </span>
                                                                )}
                                                            </div>
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
                                                    )
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

                {/* Mobile/Tablet Cards - Hidden on desktop */}
                <div className="lg:hidden space-y-4">
                    {parcelasFiltradas.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            Nenhuma parcela encontrada no período.
                        </div>
                    ) : (
                        parcelasFiltradas.map((p) => {
                            const statusVariant = getBadgeVariant(p.status, p.data_vencimento);
                            const isPaga = p.status === 'paga';
                            const cliente = p.contas_receber?.clientes;
                            const clienteNome = cliente?.nome || 'N/A';
                            const razaoSocial = cliente?.razao_social;
                            const descricao = p.contas_receber?.descricao || 'N/A';
                            const contaId = p.contas_receber?.id || 'N/A';
                            const isExpanded = expandedCards.has(p.id);

                            return (
                                <Card key={p.id} className={cn("shadow-sm", isPaga && 'bg-green-500/5 border-green-500/20')}>
                                    <CardContent className="p-4">
                                        {/* Cabeçalho: Cliente + Status */}
                                        <div className="flex items-start justify-between gap-2 mb-3">
                                            <div className="flex-1 min-w-0">
                                                {razaoSocial && <div className="font-bold text-sm truncate">{razaoSocial}</div>}
                                                <div className={cn("text-sm truncate", razaoSocial && "text-muted-foreground")}>{clienteNome}</div>
                                                <div className="text-xs text-muted-foreground truncate mt-1">{descricao}</div>
                                            </div>
                                            <Badge variant={statusVariant} className="shrink-0">
                                                {p.status === 'paga' ? 'recebida' : p.status}
                                            </Badge>
                                        </div>

                                        {/* Linha 1: Valor + Vencimento */}
                                        <div className="flex justify-between items-center mb-3 pb-3 border-b">
                                            <div>
                                                <div className="text-xs text-muted-foreground">Valor</div>
                                                <div className="text-lg font-bold">{formatCurrency(p.valor_parcela)}</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-xs text-muted-foreground">Vencimento</div>
                                                <div className="text-sm font-medium">{formatDate(p.data_vencimento)}</div>
                                                <div className="text-xs text-muted-foreground">Parcela {p.numero_parcela}</div>
                                            </div>
                                        </div>

                                        {/* Linha 2: Botões de Ação Principais */}
                                        <div className="flex flex-col gap-2 mb-3">
                                            <Button 
                                                variant="outline" 
                                                size="sm" 
                                                onClick={() => handleOpenPagamento(p)} 
                                                disabled={isPaga || p.status === 'bloqueada' || p.status === 'cancelada'}
                                                className="w-full"
                                                title={isPaga ? 'Esta parcela já foi recebida' : (p.status === 'bloqueada' || p.status === 'cancelada' ? `Status: ${p.status}`: 'Registrar recebimento')}
                                            >
                                                <BadgeDollarSign className="w-4 h-4 mr-2" /> Receber
                                            </Button>
                                            
                                            {isPaga && (
                                                <Button 
                                                    variant="secondary" 
                                                    size="sm" 
                                                    onClick={() => handleOpenRecibo(p.id)}
                                                    className="w-full bg-blue-500 hover:bg-blue-600 text-white"
                                                >
                                                    <FileText className="w-4 h-4 mr-2" /> Recibo
                                                </Button>
                                            )}

                                            {!isPaga && onGerarBoleto && (
                                                <div className="flex flex-col gap-2">
                                                    <Button 
                                                        variant="outline" 
                                                        size="sm" 
                                                        onClick={() => onGerarBoleto(p)}
                                                        className="w-full border-blue-500 text-blue-600 hover:bg-blue-50"
                                                        title="Gerar boleto bancário (vence no prazo da parcela ou D+3)"
                                                    >
                                                        <Receipt className="w-4 h-4 mr-2" /> Gerar Boleto
                                                    </Button>
                                                    <Button 
                                                        variant="outline" 
                                                        size="sm" 
                                                        onClick={() => onGerarLinkPagBank?.(p, 'pix')}
                                                        className="w-full border-green-500 text-green-600 hover:bg-green-50"
                                                        title="PIX Inteligente: expira no vencimento ou D+7"
                                                    >
                                                        <QrCode className="w-4 h-4 mr-2" /> Gerar PIX
                                                    </Button>
                                                    <Button 
                                                        variant="outline" 
                                                        size="sm" 
                                                        onClick={() => onGerarLinkPagBank?.(p, 'checkout')}
                                                        className="w-full border-purple-500 text-purple-600 hover:bg-purple-50"
                                                        title="Link Checkout: Cartão+PIX+Boleto (expira em 24h)"
                                                    >
                                                        <ShoppingCart className="w-4 h-4 mr-2" /> Gerar Link Pagamento
                                                    </Button>
                                                </div>
                                            )}

                                            {!isPaga && onMapearComExtrato && (
                                                <Button 
                                                    variant="outline" 
                                                    size="sm" 
                                                    onClick={() => onMapearComExtrato(p)}
                                                    className="w-full border-orange-500 text-orange-600 hover:bg-orange-50"
                                                    title="Vincular parcela com transação do extrato bancário"
                                                >
                                                    <Link2 className="w-4 h-4 mr-2" /> Mapear com Extrato
                                                </Button>
                                            )}
                                        </div>

                                        {/* Linha 3: Status PagBank */}
                                        {(p.pagbank_charge_id || p.pagbank_checkout_id) && (
                                            <div className="pt-3 border-t">
                                                <div className="text-xs font-medium text-muted-foreground mb-2">Status PagBank</div>
                                                {isLinkExpirado(p) ? (
                                                    <div className="flex flex-col gap-2">
                                                        <Badge variant="destructive" className="w-fit text-xs">
                                                            <AlertTriangle className="h-3 w-3 mr-1" />
                                                            Link Expirado
                                                        </Badge>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => onRegerarLinkPagBank?.(p)}
                                                            className="w-full text-orange-600 border-orange-600 hover:bg-orange-50"
                                                        >
                                                            <RefreshCw className="h-3 w-3 mr-2" />
                                                            Regerar Link
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-2">
                                                        <div className="flex items-center justify-between">
                                                            <Badge variant="default" className="text-xs bg-green-600">
                                                                <Check className="h-3 w-3 mr-1" />
                                                                Link Ativo
                                                            </Badge>
                                                            {p.pagbank_link_expira_em && (
                                                                <span className="text-[10px] text-muted-foreground">
                                                                    Expira: {new Date(p.pagbank_link_expira_em).toLocaleDateString('pt-BR', {
                                                                        day: '2-digit',
                                                                        month: '2-digit',
                                                                        hour: '2-digit',
                                                                        minute: '2-digit'
                                                                    })}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <PagBankPaymentStatus status={p.pagbank_status as any} />
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => onVisualizarLinkPagBank?.(p)}
                                                            className="w-full"
                                                        >
                                                            <Eye className="h-3 w-3 mr-2" />
                                                            Ver Link PagBank
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Botão Expandir/Recolher Detalhes */}
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => toggleCardExpansion(p.id)}
                                            className="w-full mt-3 text-xs"
                                        >
                                            {isExpanded ? 'Ocultar detalhes' : 'Ver mais detalhes'}
                                        </Button>

                                        {/* Detalhes Expandidos */}
                                        {isExpanded && (
                                            <div className="mt-3 pt-3 border-t space-y-2 text-xs">
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground">ID Parcela:</span>
                                                    <Button
                                                        variant="link"
                                                        size="sm"
                                                        className="p-0 h-auto font-mono text-xs"
                                                        onClick={() => setCodigoParaVisualizar({ title: 'ID da Parcela', code: p.id })}
                                                    >
                                                        {p.id.substring(0, 12)}...
                                                    </Button>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground">ID Conta:</span>
                                                    <Button
                                                        variant="link"
                                                        size="sm"
                                                        className="p-0 h-auto font-mono text-xs"
                                                        onClick={() => setCodigoParaVisualizar({ title: 'ID da Conta', code: contaId })}
                                                    >
                                                        {contaId.substring(0, 12)}...
                                                    </Button>
                                                </div>
                                                {p.pagbank_checkout_id && (
                                                    <div className="flex justify-between">
                                                        <span className="text-muted-foreground">Cód. Conta PagBank:</span>
                                                        <Button
                                                            variant="link"
                                                            size="sm"
                                                            className="p-0 h-auto font-mono text-xs"
                                                            onClick={() => setCodigoParaVisualizar({ 
                                                                title: 'Código da Conta (PagBank)', 
                                                                description: 'Este é o ID do checkout gerado pelo PagBank.',
                                                                code: p.pagbank_checkout_id! 
                                                            })}
                                                        >
                                                            Ver Código
                                                        </Button>
                                                    </div>
                                                )}
                                                {p.pagbank_charge_id && (
                                                    <div className="flex justify-between">
                                                        <span className="text-muted-foreground">Cód. Transação PagBank:</span>
                                                        <Button
                                                            variant="link"
                                                            size="sm"
                                                            className="p-0 h-auto font-mono text-xs"
                                                            onClick={() => setCodigoParaVisualizar({ 
                                                                title: 'Código da Transação (PagBank)', 
                                                                description: 'Este é o ID da cobrança (charge) ou pedido (order) no PagBank.',
                                                                code: p.pagbank_charge_id! 
                                                            })}
                                                        >
                                                            Ver Código
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            );
                        })
                    )}
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
            
            <ReciboRecebimentoDialog
                parcelaId={parcelaParaRecibo}
                open={reciboDialogOpen}
                onOpenChange={setReciboDialogOpen}
            />
            
            <EditarParcelaPagaDialog
                parcelaId={parcelaParaEditar}
                open={editarDialogOpen}
                onOpenChange={setEditarDialogOpen}
                onSaveComplete={() => {
                    setEditarDialogOpen(false);
                    if (onRefreshData) {
                        onRefreshData();
                    }
                }}
            />
        </Card>
    );
};

export default TabelaParcelas;