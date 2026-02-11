import React, { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BadgeDollarSign, Eye, FileText, Link2, RefreshCw, Check, AlertTriangle, Receipt, QrCode, ShoppingCart, Edit } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PagBankPaymentStatus } from '@/components/contas-receber/PagBankPaymentStatus';
import { VisualizarCodigoDialog } from '@/components/ui/VisualizarCodigoDialog';
import ReciboRecebimentoDialog from './ReciboRecebimentoDialog';
import EditarParcelaPagaDialog from './EditarParcelaPagaDialog';
import { ExtendedParcelaDetalhada } from '@/types/contas-receber';

// Tipos importados do ContasReceber.tsx
type ParcelaStatus = 'aberta' | 'parcial' | 'paga' | 'reprogramada' | 'cancelada' | 'bloqueada';
type BadgeVariant = 'success' | 'warning' | 'secondary' | 'destructive' | 'default' | 'info';

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
    onSyncStatus?: (parcelaId: string) => void;
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
    onSyncStatus,
}) => {
    const [codigoParaVisualizar, setCodigoParaVisualizar] = useState<{ title: string; description?: string, code: string } | null>(null);
    const [reciboDialogOpen, setReciboDialogOpen] = useState(false);
    const [parcelaParaRecibo, setParcelaParaRecibo] = useState<string | null>(null);
    const [editarDialogOpen, setEditarDialogOpen] = useState(false);
    const [parcelaParaEditar, setParcelaParaEditar] = useState<string | null>(null);

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
                {/* Desktop Table */}
                <div className="hidden lg:block overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[120px]">Ações</TableHead>
                                <TableHead>ID Parcela</TableHead>
                                <TableHead>Cliente</TableHead>
                                <TableHead>Descrição</TableHead>
                                <TableHead>Vencimento</TableHead>
                                <TableHead>Valor</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Pagamento</TableHead>
                                <TableHead>Método</TableHead>
                                <TableHead>Conta/Caixa</TableHead>
                                <TableHead>Vlr. Recebido</TableHead>
                                <TableHead>Juros</TableHead>
                                <TableHead>Conta Patrimonial</TableHead>
                                <TableHead>Conta Resultado</TableHead>
                                <TableHead>Histórico</TableHead>
                                <TableHead>PagBank</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {parcelasFiltradas.length === 0 ? (
                                <TableRow><TableCell colSpan={16} className="text-center h-24">Nenhuma parcela encontrada no período.</TableCell></TableRow>
                            ) : (
                                parcelasFiltradas.map((p) => {
                                    const statusVariant = getBadgeVariant(p.status, p.data_vencimento);
                                    const isPaga = p.status === 'paga';
                                    const cliente = p.contas_receber?.clientes;
                                    const clienteNome = cliente?.nome || 'N/A';
                                    const razaoSocial = cliente?.razao_social;
                                    const descricao = p.contas_receber?.descricao || 'N/A';
                                    const contaPatrimonial = p.contas_receber?.plano_contas_patrimonial;
                                    const contaResultado = p.contas_receber?.plano_contas_resultado;
                                    const historico = p.contas_receber?.historicos;
                                    
                                    const jurosCalculados = p.valor_juros || (p.valor_pago > p.valor_parcela ? p.valor_pago - p.valor_parcela : 0);

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
                                                        <div className="flex gap-1">
                                                            <Button 
                                                                variant="outline" 
                                                                size="sm" 
                                                                onClick={() => onGerarBoleto(p)}
                                                                className="flex-1 border-blue-500 text-blue-600 hover:bg-blue-50"
                                                                title="Gerar boleto bancário"
                                                            >
                                                                <Receipt className="w-3 h-3 mr-1" /> Boleto
                                                            </Button>
                                                            <Button 
                                                                variant="outline" 
                                                                size="sm" 
                                                                onClick={() => onGerarLinkPagBank?.(p, 'pix')}
                                                                className="flex-1 border-green-500 text-green-600 hover:bg-green-50"
                                                                title="Gerar PIX"
                                                            >
                                                                <QrCode className="w-3 h-3 mr-1" /> PIX
                                                            </Button>
                                                            <Button 
                                                                variant="outline" 
                                                                size="sm" 
                                                                onClick={() => onGerarLinkPagBank?.(p, 'checkout')}
                                                                className="flex-1 border-purple-500 text-purple-600 hover:bg-purple-50"
                                                                title="Gerar Link de Pagamento"
                                                            >
                                                                <ShoppingCart className="w-3 h-3 mr-1" /> Link
                                                            </Button>
                                                        </div>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="font-mono text-xs">{p.id.substring(0, 8)}</TableCell>
                                            <TableCell className="font-medium">
                                                {razaoSocial && <div className="font-bold text-foreground">{razaoSocial}</div>}
                                                <div className={cn(razaoSocial && "text-xs text-muted-foreground")}>{clienteNome}</div>
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">{descricao}</TableCell>
                                            <TableCell>{formatDate(p.data_vencimento)}</TableCell>
                                            <TableCell>{formatCurrency(p.valor_parcela)}</TableCell>
                                            <TableCell>
                                                <Badge variant={statusVariant}>{p.status === 'paga' ? 'recebida' : p.status}</Badge>
                                            </TableCell>
                                            
                                            <TableCell className="text-sm">{p.data_pagamento ? formatDate(p.data_pagamento) : '-'}</TableCell>
                                            <TableCell className="text-sm">{p.forma_pagamento || '-'}</TableCell>
                                            <TableCell className="text-sm">{p.conta_nome || '-'}</TableCell>
                                            <TableCell className="font-semibold text-green-600">{p.valor_pago ? formatCurrency(p.valor_pago) : '-'}</TableCell>
                                            <TableCell className="text-sm text-red-600">{jurosCalculados > 0 ? formatCurrency(jurosCalculados) : '-'}</TableCell>
                                            
                                            <TableCell className="text-xs text-muted-foreground" title={contaPatrimonial?.Descricao}>
                                                {contaPatrimonial ? `${contaPatrimonial.Conta}` : '-'}
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground" title={contaResultado?.Descricao}>
                                                {contaResultado ? `${contaResultado.Conta}` : '-'}
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground" title={historico?.descricao}>
                                                {historico ? `${historico.codigo || ''}` : '-'}
                                            </TableCell>
                                            
                                            <TableCell>
                                                {p.pagbank_status === 'PAID' ? (
                                                    <PagBankPaymentStatus status={p.pagbank_status as any} />
                                                ) : (p.pagbank_charge_id || p.pagbank_checkout_id) ? (
                                                    <div className="space-y-1 text-center">
                                                        {isLinkExpirado(p) ? (
                                                            <Badge variant="destructive" className="w-fit text-xs"><AlertTriangle className="h-3 w-3 mr-1" />Expirado</Badge>
                                                        ) : (
                                                            <Badge variant="default" className="w-fit text-xs bg-green-600"><Check className="h-3 w-3 mr-1" />Ativo</Badge>
                                                        )}
                                                        <PagBankPaymentStatus status={p.pagbank_status as any} />
                                                        <div className="flex flex-col gap-1">
                                                            <Button size="xs" variant="outline" onClick={() => onVisualizarLinkPagBank?.(p)}><Eye className="h-3 w-3 mr-1" />Ver Link</Button>
                                                            {!isPaga && (
                                                                <Button size="xs" variant="secondary" onClick={() => onSyncStatus?.(p.id)}><RefreshCw className="h-3 w-3 mr-1" />Sincronizar</Button>
                                                            )}
                                                            {isLinkExpirado(p) && !isPaga && (
                                                                <Button size="xs" variant="outline" onClick={() => onRegerarLinkPagBank?.(p)} className="text-orange-600 border-orange-600 hover:bg-orange-50"><RefreshCw className="h-3 w-3 mr-1" />Regerar</Button>
                                                            )}
                                                        </div>
                                                    </div>
                                                ) : p.status === 'aberta' ? (
                                                    <Button size="xs" onClick={() => onGerarLinkPagBank?.(p)}>Gerar Link</Button>
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

                {/* Mobile/Tablet Cards */}
                <div className="lg:hidden space-y-4">
                    {parcelasFiltradas.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">Nenhuma parcela encontrada no período.</div>
                    ) : (
                        parcelasFiltradas.map((p) => {
                            const statusVariant = getBadgeVariant(p.status, p.data_vencimento);
                            const isPaga = p.status === 'paga';
                            const cliente = p.contas_receber?.clientes;
                            const clienteNome = cliente?.nome || 'N/A';
                            const razaoSocial = cliente?.razao_social;
                            const descricao = p.contas_receber?.descricao || 'N/A';
                            const isExpanded = expandedCards.has(p.id);
                            const jurosCalculados = p.valor_juros || (p.valor_pago > p.valor_parcela ? p.valor_pago - p.valor_parcela : 0);

                            return (
                                <Card key={p.id} className={cn("shadow-sm", isPaga && 'bg-green-500/5 border-green-500/20')}>
                                    <CardContent className="p-4">
                                        <div className="flex items-start justify-between gap-2 mb-3">
                                            <div className="flex-1 min-w-0">
                                                {razaoSocial && <div className="font-bold text-sm truncate">{razaoSocial}</div>}
                                                <div className={cn("text-sm truncate", razaoSocial && "text-muted-foreground")}>{clienteNome}</div>
                                                <div className="text-xs text-muted-foreground truncate mt-1">{descricao}</div>
                                            </div>
                                            <Badge variant={statusVariant} className="shrink-0">{p.status === 'paga' ? 'recebida' : p.status}</Badge>
                                        </div>
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
                                        
                                        {isPaga && (
                                            <div className="grid grid-cols-2 gap-2 mb-3 text-xs bg-muted/30 p-2 rounded">
                                                <div><span className="text-muted-foreground">Pagamento:</span> {formatDate(p.data_pagamento!)}</div>
                                                <div><span className="text-muted-foreground">Método:</span> {p.forma_pagamento}</div>
                                                <div className="col-span-2"><span className="text-muted-foreground">Conta:</span> {p.conta_nome}</div>
                                                <div className="font-bold text-green-600">Recebido: {formatCurrency(p.valor_pago || 0)}</div>
                                                <div className="text-red-600">Juros: {formatCurrency(jurosCalculados)}</div>
                                            </div>
                                        )}

                                        <div className="flex flex-col gap-2 mb-3">
                                            <Button variant="outline" size="sm" onClick={() => handleOpenPagamento(p)} disabled={isPaga || p.status === 'bloqueada' || p.status === 'cancelada'} className="w-full" title={isPaga ? 'Esta parcela já foi recebida' : (p.status === 'bloqueada' || p.status === 'cancelada' ? `Status: ${p.status}`: 'Registrar recebimento')}>
                                                <BadgeDollarSign className="w-4 h-4 mr-2" /> Receber
                                            </Button>
                                            {isPaga && (
                                                <Button variant="secondary" size="sm" onClick={() => handleOpenRecibo(p.id)} className="w-full bg-blue-500 hover:bg-blue-600 text-white"><FileText className="w-4 h-4 mr-2" /> Recibo</Button>
                                            )}
                                            {!isPaga && onGerarBoleto && (
                                                <div className="flex flex-col gap-2">
                                                    <Button variant="outline" size="sm" onClick={() => onGerarBoleto(p)} className="w-full border-blue-500 text-blue-600 hover:bg-blue-50" title="Gerar boleto bancário"><Receipt className="w-4 h-4 mr-2" /> Gerar Boleto</Button>
                                                    <Button variant="outline" size="sm" onClick={() => onGerarLinkPagBank?.(p, 'pix')} className="w-full border-green-500 text-green-600 hover:bg-green-50" title="Gerar PIX"><QrCode className="w-4 h-4 mr-2" /> Gerar PIX</Button>
                                                    <Button variant="outline" size="sm" onClick={() => onGerarLinkPagBank?.(p, 'checkout')} className="w-full border-purple-500 text-purple-600 hover:bg-purple-50" title="Gerar Link de Pagamento"><ShoppingCart className="w-4 h-4 mr-2" /> Gerar Link Pagamento</Button>
                                                </div>
                                            )}
                                        </div>
                                        <Button variant="ghost" size="sm" onClick={() => toggleCardExpansion(p.id)} className="w-full mt-3 text-xs">{isExpanded ? 'Ocultar detalhes' : 'Ver mais detalhes'}</Button>
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