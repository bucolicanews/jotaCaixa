import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ExtendedParcelaDetalhada, ParcelaParaPagamento } from '@/types/contas-receber';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { Badge } from './ui/badge';
import RegistrarPagamentoDialog from './RegistrarPagamentoDialog';
import { CheckCircle, XCircle, DollarSign, Clock } from 'lucide-react';

interface DetalhesParcelasDialogProps {
    parcela: ExtendedParcelaDetalhada | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSaveComplete: () => void;
}

// Função auxiliar para mapear ExtendedParcelaDetalhada para ParcelaParaPagamento
const mapToParcelaParaPagamento = (parcela: ExtendedParcelaDetalhada): ParcelaParaPagamento => {
    if (!parcela.contas_receber) {
        throw new Error("Dados de conta a receber ausentes para mapeamento.");
    }
    
    return {
        id: parcela.id,
        conta_receber_id: parcela.conta_receber_id,
        valor_parcela: parcela.valor_parcela,
        valor_pago: parcela.valor_pago,
        numero_parcela: parcela.numero_parcela,
        
        // Campos derivados da estrutura aninhada:
        empresa_id: parcela.contas_receber.empresa_id, 
        cliente_id: parcela.contas_receber.cliente_id,
    };
};

const DetalhesParcelasDialog: React.FC<DetalhesParcelasDialogProps> = ({ parcela, open, onOpenChange, onSaveComplete }) => {
    const [pagamentoDialogOpen, setPagamentoDialogOpen] = useState(false);
    const [parcelaSelecionada, setParcelaSelecionada] = useState<ParcelaParaPagamento | null>(null);

    const statusMap = {
        'aberta': { text: 'Aberta', variant: 'secondary', icon: <Clock className="h-3 w-3 mr-1" /> },
        'parcial': { text: 'Parcialmente Paga', variant: 'warning', icon: <DollarSign className="h-3 w-3 mr-1" /> },
        'paga': { text: 'Paga', variant: 'success', icon: <CheckCircle className="h-3 w-3 mr-1" /> },
        'reprogramada': { text: 'Reprogramada', variant: 'info', icon: <Clock className="h-3 w-3 mr-1" /> },
        'cancelada': { text: 'Cancelada', variant: 'destructive', icon: <XCircle className="h-3 w-3 mr-1" /> },
    };

    const handleOpenPagamento = () => {
        if (parcela) {
            try {
                const mappedParcela = mapToParcelaParaPagamento(parcela);
                setParcelaSelecionada(mappedParcela);
                setPagamentoDialogOpen(true);
            } catch (e) {
                console.error(e);
                // Tratar erro de dados ausentes, se necessário
            }
        }
    };
    
    const handlePaymentComplete = () => {
        setPagamentoDialogOpen(false);
        onSaveComplete();
    };

    if (!parcela) return null;

    const statusInfo = statusMap[parcela.status] || statusMap['aberta'];
    const valorPendente = parcela.valor_parcela - parcela.valor_pago;

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-[600px]">
                    <DialogHeader>
                        <DialogTitle>Detalhes da Parcela #{parcela.numero_parcela}</DialogTitle>
                        <DialogDescription>
                            {parcela.contas_receber?.descricao || 'Descrição não disponível'}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Cliente</p>
                                <p className="font-semibold">{parcela.contas_receber?.clientes?.nome || 'N/A'}</p>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Vencimento</p>
                                <p className="font-semibold">{formatDate(parcela.data_vencimento)}</p>
                            </div>
                        </div>

                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Valor Total</TableHead>
                                    <TableHead>Valor Pago</TableHead>
                                    <TableHead>Pendente</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <TableRow>
                                    <TableCell>
                                        <Badge variant={statusInfo.variant as any} className="flex items-center w-fit">
                                            {statusInfo.icon} {statusInfo.text}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="font-medium">{formatCurrency(parcela.valor_parcela)}</TableCell>
                                    <TableCell className="text-green-600 font-medium">{formatCurrency(parcela.valor_pago)}</TableCell>
                                    <TableCell className="text-red-600 font-medium">{formatCurrency(valorPendente)}</TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                        
                        {parcela.data_pagamento && (
                            <p className="text-sm text-muted-foreground">Data de Pagamento: {formatDate(parcela.data_pagamento)}</p>
                        )}
                    </div>

                    {valorPendente > 0 && (
                        <Button onClick={handleOpenPagamento} className="w-full mt-4">
                            Registrar Pagamento
                        </Button>
                    )}
                </DialogContent>
            </Dialog>

            {/* Registrar Pagamento Dialog */}
            <RegistrarPagamentoDialog
                parcela={parcelaSelecionada} 
                open={pagamentoDialogOpen}
                onOpenChange={setPagamentoDialogOpen}
                onSaveComplete={handlePaymentComplete}
            />
        </>
    );
};

export default DetalhesParcelasDialog;