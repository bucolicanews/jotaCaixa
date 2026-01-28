import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, FileText, Link, Mail, MessageSquare, Eye, Send } from 'lucide-react';
import { formatCurrency, formatarData } from '@/utils/formatters';
import { NotaFiscal, NFConfig, ParcelaNF } from '@/types/nota-fiscal';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'; // IMPORT ADICIONADO

interface NotaFiscalListViewProps {
    parcelasParaNF: ParcelaNF[];
    notasFiscais: Record<string, NotaFiscal>;
    configNF: NFConfig | null;
    carregando: boolean;
    handleUploadNF: (parcela: ParcelaNF, file: File, numeroNota: string, dataEmissao: Date) => Promise<void>;
    handleSendNF: (nota: NotaFiscal, tipo: 'whatsapp' | 'email' | 'webhook') => Promise<void>;
    onUpdate: () => void;
}

const NotaFiscalListView: React.FC<NotaFiscalListViewProps> = ({
    parcelasParaNF,
    notasFiscais,
    configNF,
    carregando,
    handleSendNF,
    onUpdate,
}) => {
    
    const [sending, setSending] = React.useState<string | null>(null);

    const getStatusBadge = (nota: NotaFiscal | undefined) => {
        if (!nota) return <Badge variant="warning">Pendente Emissão</Badge>;
        
        switch (nota.status) {
            case 'Nota Emitida':
                if (nota.enviado_email || nota.enviado_whatsapp) {
                    return <Badge variant="default">Enviada Parcial</Badge>;
                }
                return <Badge variant="default">Emitida</Badge>;
            case 'Enviada Cliente':
                return <Badge variant="success">Enviada</Badge>;
            case 'Erro Envio':
                return <Badge variant="destructive">Erro Envio</Badge>;
            default:
                return <Badge variant="warning">Pendente Emissão</Badge>;
        }
    };

    const handleSend = async (nota: NotaFiscal, tipo: 'whatsapp' | 'email' | 'webhook') => {
        setSending(nota.id + tipo);
        await handleSendNF(nota, tipo);
        setSending(null);
    };

    if (carregando) {
        return (
            <div className="flex justify-center items-center h-32">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="overflow-x-auto">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-[150px]">Cliente</TableHead>
                        <TableHead className="w-[100px]">Nº NF</TableHead>
                        <TableHead className="w-[100px]">Valor</TableHead>
                        <TableHead className="w-[100px]">Pagamento</TableHead>
                        <TableHead className="w-[120px]">Status</TableHead>
                        <TableHead className="w-[150px] text-right">Ações</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {parcelasParaNF.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={6} className="text-center py-4 text-muted-foreground">
                                Nenhuma parcela paga encontrada.
                            </TableCell>
                        </TableRow>
                    ) : (
                        parcelasParaNF.map((parcela) => {
                            const nota = notasFiscais[parcela.id];
                            const isNFEmitted = !!nota?.anexo_url;
                            const isWebhookConfigured = !!configNF?.webhook_n8n_url;

                            return (
                                <TableRow key={parcela.id}>
                                    <TableCell className="font-medium text-sm">{parcela.cliente_nome}</TableCell>
                                    <TableCell className="font-mono text-xs">{nota?.numero_nota || '-'}</TableCell>
                                    <TableCell className="font-semibold">{formatCurrency(parcela.valor_parcela)}</TableCell>
                                    <TableCell className="text-sm">{formatarData(parcela.data_pagamento)}</TableCell>
                                    <TableCell>{getStatusBadge(nota)}</TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end space-x-1">
                                            {isNFEmitted && (
                                                <>
                                                    <Button variant="ghost" size="icon" onClick={() => window.open(nota!.anexo_url!, '_blank')} title="Visualizar Anexo">
                                                        <Eye className="w-4 h-4" />
                                                    </Button>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon" title="Enviar NF">
                                                                <Send className="w-4 h-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem 
                                                                onClick={() => handleSend(nota!, 'whatsapp')} 
                                                                disabled={!parcela.cliente_telefone || sending === nota!.id + 'whatsapp'}
                                                            >
                                                                <MessageSquare className="w-4 h-4 mr-2" /> WhatsApp
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem 
                                                                onClick={() => handleSend(nota!, 'email')} 
                                                                disabled={!parcela.cliente_email || sending === nota!.id + 'email'}
                                                            >
                                                                <Mail className="w-4 h-4 mr-2" /> Email
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem 
                                                                onClick={() => handleSend(nota!, 'webhook')} 
                                                                disabled={!isWebhookConfigured || sending === nota!.id + 'webhook'}
                                                            >
                                                                <Link className="w-4 h-4 mr-2" /> Webhook N8N
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </>
                                            )}
                                            {!isNFEmitted && (
                                                <Button variant="secondary" size="sm" onClick={() => toast.info('Use a visualização em Card para anexar a NF.')}>
                                                    Anexar NF
                                                </Button>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            );
                        })
                    )}
                </TableBody>
            </Table>
        </div>
    );
};

export default NotaFiscalListView;