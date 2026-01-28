import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, FileText, CheckCircle2, Mail, MessageSquare, Link, AlertTriangle, Receipt, CalendarIcon, RefreshCw, Send } from 'lucide-react';
import { formatCurrency, formatarData } from '@/utils/formatters';
import { NotaFiscal, NFConfig, ParcelaNF } from '@/types/nota-fiscal';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'; // IMPORT ADICIONADO

interface NotaFiscalCardProps {
    parcela: ParcelaNF;
    notaFiscal: NotaFiscal | undefined;
    configNF: NFConfig | null;
    onUpdate: () => void;
    handleUploadNF: (parcela: ParcelaNF, file: File, numeroNota: string, dataEmissao: Date) => Promise<void>;
    handleSendNF: (nota: NotaFiscal, tipo: 'whatsapp' | 'email' | 'webhook') => Promise<void>;
}

const NotaFiscalCard: React.FC<NotaFiscalCardProps> = ({
    parcela,
    notaFiscal,
    configNF,
    onUpdate,
    handleUploadNF,
    handleSendNF,
}) => {
    const [file, setFile] = useState<File | null>(null);
    const [numeroNota, setNumeroNota] = useState(notaFiscal?.numero_nota || '');
    const [dataEmissao, setDataEmissao] = useState<Date | undefined>(notaFiscal?.data_emissao ? new Date(notaFiscal.data_emissao + 'T00:00:00') : new Date());
    const [uploading, setUploading] = useState(false);
    const [sending, setSending] = useState<string | null>(null);

    const isNFEmitted = notaFiscal?.status === 'Nota Emitida' || notaFiscal?.status === 'Enviada Cliente' || notaFiscal?.status === 'Enviada com Sucesso' || notaFiscal?.status === 'Erro Envio';
    const isNFUploaded = !!notaFiscal?.anexo_url;
    const isWebhookConfigured = !!configNF?.webhook_n8n_url;
    const isFullySent = notaFiscal?.status === 'Enviada com Sucesso'; // NOVO: Status final
    const isSendingError = notaFiscal?.status === 'Erro Envio';

    useEffect(() => {
        if (notaFiscal) {
            setNumeroNota(notaFiscal.numero_nota || '');
            setDataEmissao(notaFiscal.data_emissao ? new Date(notaFiscal.data_emissao + 'T00:00:00') : new Date());
        }
    }, [notaFiscal]);

    const handleUpload = async () => {
        if (!file || !numeroNota || !dataEmissao) {
            toast.error('Preencha o número da NF, a data e selecione o arquivo.');
            return;
        }
        setUploading(true);
        await handleUploadNF(parcela, file, numeroNota, dataEmissao);
        setUploading(false);
        setFile(null);
    };

    const handleSend = async (tipo: 'whatsapp' | 'email' | 'webhook') => {
        if (!notaFiscal || !notaFiscal.anexo_url) {
            toast.error('Anexe a Nota Fiscal antes de enviar.');
            return;
        }
        setSending(tipo);
        await handleSendNF(notaFiscal, tipo);
        setSending(null);
    };
    
    const handleViewAnexo = () => {
        if (notaFiscal?.anexo_url) {
            window.open(notaFiscal.anexo_url, '_blank');
        }
    };
    
    const getStatusBadge = (status: string | undefined) => {
        if (!status || status === 'Pendente Emissão') return <Badge variant="warning">Pendente Emissão</Badge>;
        if (status === 'Nota Emitida') return <Badge variant="default">Emitida</Badge>;
        if (status === 'Enviada Cliente') return <Badge variant="secondary">Aguardando Confirmação</Badge>;
        if (status === 'Enviada com Sucesso') return <Badge variant="success">Enviada com Sucesso</Badge>;
        if (status === 'Erro Envio') return <Badge variant="destructive">Erro Envio</Badge>;
        return <Badge variant="secondary">{status}</Badge>;
    };

    return (
        <Card className={cn("border-l-4", isNFEmitted ? (isFullySent ? "border-green-500" : (isSendingError ? "border-red-500" : "border-blue-500")) : "border-yellow-500")}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-lg">
                    {parcela.cliente_nome}
                </CardTitle>
                {getStatusBadge(notaFiscal?.status)}
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div><p className="text-muted-foreground">Valor</p><p className="font-bold">{formatCurrency(parcela.valor_parcela)}</p></div>
                    <div><p className="text-muted-foreground">Pagamento</p><p>{formatarData(parcela.data_pagamento)}</p></div>
                    <div><p className="text-muted-foreground">Vencimento</p><p>{formatarData(parcela.data_vencimento)}</p></div>
                    <div><p className="text-muted-foreground">Descrição</p><p className="truncate">{parcela.descricao_conta}</p></div>
                </div>

                <Separator />

                {/* Seção de Upload/Emissão */}
                <div className="space-y-3 p-3 border rounded-md">
                    <h3 className="font-semibold text-base flex items-center">
                        <FileText className="w-4 h-4 mr-2" /> Dados da Nota Fiscal
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="numeroNota">Nº da Nota</Label>
                            <Input 
                                id="numeroNota" 
                                value={numeroNota} 
                                onChange={(e) => setNumeroNota(e.target.value)} 
                                disabled={uploading || isNFEmitted}
                                placeholder="Ex: 12345"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="dataEmissao">Data Emissão</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !dataEmissao && "text-muted-foreground")} disabled={uploading || isNFEmitted}>
                                        {dataEmissao ? format(dataEmissao, 'dd/MM/yyyy', { locale: ptBR }) : "Selecione a data"}
                                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dataEmissao} onSelect={setDataEmissao} initialFocus locale={ptBR} /></PopoverContent>
                            </Popover>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="anexoNF">Anexo (PDF/XML)</Label>
                            <Input 
                                id="anexoNF" 
                                type="file" 
                                accept=".pdf,.xml" 
                                onChange={(e) => setFile(e.target.files?.[0] || null)} 
                                disabled={uploading || isNFEmitted}
                            />
                        </div>
                    </div>
                    
                    {isNFUploaded ? (
                        <div className="flex justify-between items-center pt-2 border-t">
                            <span className="text-sm text-green-600 flex items-center">
                                <CheckCircle2 className="w-4 h-4 mr-1" /> NF Anexada: {notaFiscal?.numero_nota}
                            </span>
                            <Button variant="link" size="sm" onClick={handleViewAnexo}>
                                <Link className="w-4 h-4 mr-1" /> Visualizar Anexo
                            </Button>
                        </div>
                    ) : (
                        <Button onClick={handleUpload} disabled={uploading || !file || !numeroNota || !dataEmissao} className="w-full">
                            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                            Anexar NF e Marcar como Emitida
                        </Button>
                    )}
                </div>

                {/* Seção de Envio */}
                {isNFEmitted && (
                    <div className="space-y-3 p-3 border rounded-md">
                        <h3 className="font-semibold text-base flex items-center">
                            <Send className="w-4 h-4 mr-2" /> Enviar ao Cliente
                        </h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <Button 
                                onClick={() => handleSend('whatsapp')} 
                                disabled={sending !== null || !parcela.cliente_telefone}
                                variant={notaFiscal?.enviado_whatsapp ? 'success' : 'outline'}
                                className="w-full"
                            >
                                {sending === 'whatsapp' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageSquare className="mr-2 h-4 w-4" />}
                                {notaFiscal?.enviado_whatsapp ? 'Reenviar WhatsApp' : 'Enviar WhatsApp'}
                            </Button>
                            
                            <Button 
                                onClick={() => handleSend('email')} 
                                disabled={sending !== null || !parcela.cliente_email}
                                variant={notaFiscal?.enviado_email ? 'success' : 'outline'}
                                className="w-full"
                            >
                                {sending === 'email' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                                {notaFiscal?.enviado_email ? 'Reenviar Email' : 'Enviar Email'}
                            </Button>
                            
                            <Button 
                                onClick={() => handleSend('webhook')} 
                                disabled={sending !== null || !isWebhookConfigured}
                                variant={notaFiscal?.status === 'Enviada com Sucesso' ? 'default' : 'secondary'}
                                className="w-full"
                            >
                                {sending === 'webhook' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link className="mr-2 h-4 w-4" />}
                                Enviar Webhook N8N
                            </Button>
                        </div>
                        
                        <div className="text-xs text-muted-foreground pt-2 border-t">
                            <p className="flex items-center">
                                Status de Envio: 
                                <span className={cn("ml-1 font-semibold", isFullySent ? 'text-green-600' : (isSendingError ? 'text-red-600' : 'text-amber-600'))}>
                                    {isFullySent ? 'Enviada com Sucesso' : (isSendingError ? 'Erro no Envio' : (notaFiscal?.status === 'Enviada Cliente' ? 'Aguardando Confirmação' : 'Pendente'))}
                                </span>
                            </p>
                            {!isWebhookConfigured && <p className="text-red-500 flex items-center mt-1"><AlertTriangle className="w-3 h-3 mr-1" /> Webhook N8N não configurado.</p>}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

export default NotaFiscalCard;