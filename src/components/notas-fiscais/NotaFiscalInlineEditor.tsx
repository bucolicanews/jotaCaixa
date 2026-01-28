import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { Loader2, Upload, FileText, CheckCircle2, Mail, MessageSquare, Link, CalendarIcon, RefreshCw, Send, Eye, AlertTriangle } from 'lucide-react';
import { formatCurrency, formatarData } from '@/utils/formatters';
import { NotaFiscal, NFConfig, ParcelaNF } from '@/types/nota-fiscal';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

interface NotaFiscalInlineEditorProps {
    parcela: ParcelaNF;
    notaFiscal: NotaFiscal | undefined;
    configNF: NFConfig | null;
    onUpdate: () => void;
    handleUploadNF: (parcela: ParcelaNF, file: File, numeroNota: string, dataEmissao: Date) => Promise<void>;
    handleSendNF: (nota: NotaFiscal, tipo: 'whatsapp' | 'email' | 'webhook') => Promise<void>;
}

const NotaFiscalInlineEditor: React.FC<NotaFiscalInlineEditorProps> = ({
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

    const isNFEmitted = !!notaFiscal;
    const isNFUploaded = !!notaFiscal?.anexo_url;
    const isWebhookConfigured = !!configNF?.webhook_n8n_url;
    const isFullySent = notaFiscal?.status === 'Enviada com Sucesso';
    const isSendingError = notaFiscal?.status === 'Erro Envio';

    useEffect(() => {
        if (notaFiscal) {
            setNumeroNota(notaFiscal.numero_nota || '');
            setDataEmissao(notaFiscal.data_emissao ? new Date(notaFiscal.data_emissao + 'T00:00:00') : new Date());
        }
    }, [notaFiscal]);

    const handleUpload = async () => {
        if (!file && !isNFEmitted) {
            toast.error('Selecione o arquivo da NF.');
            return;
        }
        if (!numeroNota || !dataEmissao) {
            toast.error('Preencha o número da NF e a data de emissão.');
            return;
        }
        setUploading(true);
        await handleUploadNF(parcela, file || undefined, numeroNota, dataEmissao);
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
    
    const getStatusBadge = (nota: NotaFiscal | undefined) => {
        if (!nota) return <Badge variant="warning">Pendente</Badge>;
        
        switch (nota.status) {
            case 'Nota Emitida':
                return <Badge variant="default">Emitida</Badge>;
            case 'Enviada Cliente':
                return <Badge variant="secondary">Aguardando</Badge>;
            case 'Enviada com Sucesso':
                return <Badge variant="success">Sucesso</Badge>;
            case 'Erro Envio':
                return <Badge variant="destructive">Erro</Badge>;
            default:
                return <Badge variant="warning">Pendente</Badge>;
        }
    };

    const isSendingOrUploading = sending !== null || uploading;
    const isDataChanged = numeroNota !== (notaFiscal?.numero_nota || '') || (dataEmissao && format(dataEmissao, 'yyyy-MM-dd') !== (notaFiscal?.data_emissao || format(new Date(), 'yyyy-MM-dd')));
    const canUpdate = isDataChanged || !!file;

    return (
        <>
            {/* Coluna Nº NF */}
            <TableCell className="font-mono text-xs w-[100px]">
                <Input 
                    value={numeroNota} 
                    onChange={(e) => setNumeroNota(e.target.value)} 
                    disabled={isSendingOrUploading}
                    placeholder="Nº NF"
                    className="h-8 text-xs"
                />
            </TableCell>

            {/* Coluna Data Emissão */}
            <TableCell className="w-[120px]">
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal h-8 text-xs", !dataEmissao && "text-muted-foreground")} disabled={isSendingOrUploading}>
                            {dataEmissao ? format(dataEmissao, 'dd/MM/yyyy', { locale: ptBR }) : "Data"}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dataEmissao} onSelect={setDataEmissao} initialFocus locale={ptBR} /></PopoverContent>
                </Popover>
            </TableCell>

            {/* Coluna Anexo/Upload */}
            <TableCell className="w-[120px]">
                <div className="flex flex-col space-y-1">
                    <Button 
                        onClick={handleUpload} 
                        disabled={isSendingOrUploading || !canUpdate}
                        variant={isNFUploaded ? 'outline' : 'default'}
                        className="h-8 text-xs w-full"
                    >
                        {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (isNFUploaded ? <RefreshCw className="mr-2 h-4 w-4" /> : <Upload className="mr-2 h-4 w-4" />)}
                        {isNFUploaded ? 'Atualizar' : 'Anexar'}
                    </Button>
                    <Input 
                        id={`file-upload-${parcela.id}`} 
                        type="file" 
                        accept=".pdf,.xml" 
                        onChange={(e) => setFile(e.target.files?.[0] || null)} 
                        disabled={isSendingOrUploading}
                        className="hidden"
                    />
                    <Button 
                        variant="link" 
                        size="xs" 
                        onClick={() => document.getElementById(`file-upload-${parcela.id}`)?.click()}
                        className="p-0 h-auto text-xs text-muted-foreground"
                        disabled={isSendingOrUploading}
                    >
                        {file ? `Arquivo: ${file.name.substring(0, 15)}...` : (isNFUploaded ? 'Trocar Anexo' : 'Selecionar Arquivo')}
                    </Button>
                </div>
            </TableCell>

            {/* Coluna Status */}
            <TableCell className="w-[100px] text-center">
                {getStatusBadge(notaFiscal)}
                {isNFUploaded && (
                    <Button variant="link" size="xs" onClick={handleViewAnexo} className="p-0 h-auto text-xs mt-1">
                        <Eye className="w-3 h-3 mr-1" /> Ver
                    </Button>
                )}
            </TableCell>

            {/* Coluna Envio */}
            <TableCell className="w-[150px] text-right">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button 
                            variant="secondary" 
                            size="sm" 
                            disabled={!isNFUploaded || isSendingOrUploading}
                            className="h-8 text-xs w-full"
                        >
                            {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                            {sending ? sending.toUpperCase() : 'Enviar NF'}
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem 
                            onClick={() => handleSend('webhook')} 
                            disabled={!isWebhookConfigured || sending !== null}
                            className={cn("bg-blue-500/10 text-blue-700")}
                        >
                            <Link className="w-4 h-4 mr-2" /> Webhook N8N
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                            onClick={() => handleSend('whatsapp')} 
                            disabled={!parcela.cliente_telefone || sending !== null}
                            className={cn(!notaFiscal?.enviado_whatsapp && "bg-green-500/10 text-green-700")}
                        >
                            <MessageSquare className="w-4 h-4 mr-2" /> WhatsApp
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                            onClick={() => handleSend('email')} 
                            disabled={!parcela.cliente_email || sending !== null}
                            className={cn(!notaFiscal?.enviado_email && "bg-orange-500/10 text-orange-700")}
                        >
                            <Mail className="w-4 h-4 mr-2" /> Email
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </TableCell>
        </>
    );
};

export default NotaFiscalInlineEditor;