import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, FileText, Link, Mail, MessageSquare, Eye, Send, Edit } from 'lucide-react';
import { formatCurrency, formatarData } from '@/utils/formatters';
import { NotaFiscal, NFConfig, ParcelaNF } from '@/types/nota-fiscal';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import NotaFiscalInlineEditor from './NotaFiscalInlineEditor'; // NOVO IMPORT

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
    handleUploadNF,
    handleSendNF,
    onUpdate,
}) => {
    
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
                        <TableHead className="w-[100px]">Valor</TableHead>
                        <TableHead className="w-[100px]">Pagamento</TableHead>
                        <TableHead className="w-[100px]">Nº NF</TableHead>
                        <TableHead className="w-[120px]">Emissão</TableHead>
                        <TableHead className="w-[120px]">Anexo/Upload</TableHead>
                        <TableHead className="w-[100px] text-center">Status</TableHead>
                        <TableHead className="w-[150px] text-right">Envio</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {parcelasParaNF.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={8} className="text-center py-4 text-muted-foreground">
                                Nenhuma parcela paga encontrada.
                            </TableCell>
                        </TableRow>
                    ) : (
                        parcelasParaNF.map((parcela) => {
                            const nota = notasFiscais[parcela.id];

                            return (
                                <TableRow key={parcela.id}>
                                    <TableCell className="font-medium text-sm">
                                        {parcela.cliente_nome}
                                        {nota?.editada && <Badge variant="outline" className="ml-2 text-xs border-amber-500 text-amber-600">Editada</Badge>}
                                    </TableCell>
                                    <TableCell className="font-semibold">{formatCurrency(parcela.valor_parcela)}</TableCell>
                                    <TableCell className="text-sm">{formatarData(parcela.data_pagamento)}</TableCell>
                                    
                                    {/* Componente de Edição Inline */}
                                    <NotaFiscalInlineEditor
                                        parcela={parcela}
                                        notaFiscal={nota}
                                        configNF={configNF}
                                        onUpdate={onUpdate}
                                        handleUploadNF={handleUploadNF}
                                        handleSendNF={handleSendNF}
                                    />
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