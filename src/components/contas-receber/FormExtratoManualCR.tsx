import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2, Save, Upload, FileText, XCircle, CheckCircle2, CalendarIcon, PlusCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { cn } from '@/lib/utils';
import { format, addDays } from 'date-fns';
import { SaldoCalculado } from '@/hooks/use-saldo-conta-calculado';
import { Textarea } from '../ui/textarea';
import { Separator } from "@/components/ui/separator";
import { useSessao } from '@/hooks/use-sessao';
import { PlanoContas } from '@/types/plano-contas';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Calendar } from '../ui/calendar';
import { ptBR } from 'date-fns/locale';
import { useContabilConfig } from '@/hooks/use-contabil-config';
import { saveRecebimentoAndLancamentos } from './RegistrarPagamentoDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

const formatCurrency = (value: number) =>
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const COMPROVANTE_BUCKET = 'comprovantes-financeiros'; 

interface DescricaoExtrato {
    id: string;
    descricao: string;
    status: boolean;
    ordem: number;
}

interface IdentificacaoExtrato {
    id: string;
    descricao: string;
    status: boolean;
    ordem: number;
}

interface ParcelaParaRecebimento {
    id: string;
    conta_receber_id: string;
    empresa_id: string;
    valor_parcela: number;
    valor_pago: number;
    cliente_id: string | null;
}

interface RecebimentoDetalhe {
    conta_id: string;
    valor_recebido: number;
}

interface FormExtratoManualCRProps {
    parcela: ParcelaParaRecebimento;
    recebimentoDetalhes: RecebimentoDetalhe;
    formaPagamento: string;
    dataPagamento: Date;
    historicoId: string | null;
    contaPatrimonialId: string | null;
    codigoTransacao: string | null; // NOVO PROP
    contasDestino: SaldoCalculado[];
    isPagamentoParcial: boolean;
    saldoRestante: number;
    onSaveComplete: () => void;
    onClose: () => void;
}

const formSchema = z.object({
    descricao_extrato: z.string().min(1, 'A descrição é obrigatória.'),
    identificacao: z.string().optional().or(z.literal('')),
    observacao: z.string().optional().or(z.literal('')),
    comprovante_url: z.string().optional().or(z.literal('')),
    acao_saldo_restante: z.enum(['desconto', 'reprogramar', 'parcelar']).optional(),
    nova_data_vencimento: z.date().optional(),
    numero_novas_parcelas: z.coerce.number().int().min(2).optional(),
    intervalo_dias_novas_parcelas: z.coerce.number().int().min(1).optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface FormNovoItemProps {
    tipo: 'descricao' | 'identificacao';
    proprietarioId: string;
    isAdmin: boolean;
    proximaOrdem: number;
    onSaveComplete: (novoId: string) => void;
    onClose: () => void;
}

const FormNovoItem: React.FC<FormNovoItemProps> = ({ tipo, proprietarioId, isAdmin, proximaOrdem, onSaveComplete, onClose }) => {
    const [descricao, setDescricao] = useState('');
    const [status, setStatus] = useState(true);
    const [ordem, setOrdem] = useState(proximaOrdem);
    const [loading, setLoading] = useState(false);

    const tabela = isAdmin 
        ? (tipo === 'descricao' ? 'admin_descricao_extrato' : 'admin_identificacao_extrato')
        : (tipo === 'descricao' ? 'descricao_extrato' : 'identificacao_extrato');
    const campoId = isAdmin ? 'admin_id' : 'empresa_id';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!descricao.trim()) {
            showError('O campo é obrigatório.');
            return;
        }
        setLoading(true);

        const dataToSave = {
            descricao: descricao.trim(),
            status,
            ordem,
            [campoId]: proprietarioId,
        };

        const { data, error } = await supabase.from(tabela).insert(dataToSave).select('id').single();

        if (error) {
            showError(`Falha ao salvar: ${error.message}`);
        } else {
            showSuccess(`${tipo === 'descricao' ? 'Descrição' : 'Identificador'} salvo com sucesso!`);
            onSaveComplete(data.id);
        }
        setLoading(false);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="descricao">{tipo === 'descricao' ? 'Descrição' : 'Identificador'}</Label>
                <Input
                    id="descricao"
                    placeholder={tipo === 'descricao' ? "Ex: Recebimento PIX, Pagamento Fornecedor" : "Ex: PIX, TED, DOC, Boleto"}
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                    disabled={loading}
                    autoFocus
                />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="ordem">Ordem</Label>
                    <Input
                        id="ordem"
                        type="number"
                        min={0}
                        value={ordem}
                        onChange={(e) => setOrdem(parseInt(e.target.value) || 0)}
                        disabled={loading}
                    />
                </div>
                <div className="flex items-center space-x-2 pt-6">
                    <Switch id="status" checked={status} onCheckedChange={setStatus} disabled={loading} />
                    <Label htmlFor="status">Ativo</Label>
                </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Salvar'}
            </Button>
        </form>
    );
};

const FormExtratoManualCR: React.FC<FormExtratoManualCRProps> = ({
    parcela,
    recebimentoDetalhes,
    formaPagamento,
    dataPagamento,
    historicoId,
    contaPatrimonialId,
    codigoTransacao,
    contasDestino,
    isPagamentoParcial,
    saldoRestante,
    onSaveComplete,
    onClose,
}) => {
    const { role, usuario, perfil } = useSessao();
    const isAdmin = role === 'Admin';
    
    const [loading, setLoading] = useState(false);
    const [comprovanteFile, setComprovanteFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    
    const [descricoes, setDescricoes] = useState<DescricaoExtrato[]>([]);
    const [identificadores, setIdentificadores] = useState<IdentificacaoExtrato[]>([]);
    const [loadingDescricoes, setLoadingDescricoes] = useState(true);
    const [loadingIdentificadores, setLoadingIdentificadores] = useState(true);
    
    const [dialogNovaDescricao, setDialogNovaDescricao] = useState(false);
    const [dialogNovoIdentificador, setDialogNovoIdentificador] = useState(false);
    
    const proprietarioDaSessao = isAdmin ? usuario?.id : (perfil as any)?.cliente_id || (perfil as any)?.id;

    const valorRecebido = recebimentoDetalhes.valor_recebido;
    const contaDestinoId = recebimentoDetalhes.conta_id;
    
    const tabelaDescricao = isAdmin ? 'admin_descricao_extrato' : 'descricao_extrato';
    const tabelaIdentificacao = isAdmin ? 'admin_identificacao_extrato' : 'identificacao_extrato';
    const campoId = isAdmin ? 'admin_id' : 'empresa_id';
    
    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            descricao_extrato: '',
            identificacao: '',
            observacao: '',
            comprovante_url: '',
            acao_saldo_restante: 'reprogramar',
            nova_data_vencimento: addDays(new Date(), 30),
            numero_novas_parcelas: 2,
            intervalo_dias_novas_parcelas: 30,
        },
    });
    
    const acaoSaldoRestante = form.watch('acao_saldo_restante');
    
    const carregarDescricoes = useCallback(async () => {
        if (!proprietarioDaSessao) return;
        setLoadingDescricoes(true);
        const { data, error } = await supabase
            .from(tabelaDescricao)
            .select('*')
            .eq(campoId, proprietarioDaSessao)
            .eq('status', true)
            .order('ordem', { ascending: true });
        if (!error) setDescricoes(data || []);
        setLoadingDescricoes(false);
    }, [proprietarioDaSessao, tabelaDescricao, campoId]);
    
    const carregarIdentificadores = useCallback(async () => {
        if (!proprietarioDaSessao) return;
        setLoadingIdentificadores(true);
        const { data, error } = await supabase
            .from(tabelaIdentificacao)
            .select('*')
            .eq(campoId, proprietarioDaSessao)
            .eq('status', true)
            .order('ordem', { ascending: true });
        if (!error) setIdentificadores(data || []);
        setLoadingIdentificadores(false);
    }, [proprietarioDaSessao, tabelaIdentificacao, campoId]);
    
    useEffect(() => {
        carregarDescricoes();
        carregarIdentificadores();
    }, [carregarDescricoes, carregarIdentificadores]);
    
    const handleNovaDescricaoSalva = (novoId: string) => {
        setDialogNovaDescricao(false);
        carregarDescricoes().then(() => {
            const novaDescricao = descricoes.find(d => d.id === novoId);
            if (novaDescricao) {
                form.setValue('descricao_extrato', novaDescricao.descricao);
            }
        });
        setTimeout(() => {
            supabase.from(tabelaDescricao).select('descricao').eq('id', novoId).single().then(({ data }) => {
                if (data) form.setValue('descricao_extrato', data.descricao);
            });
        }, 100);
    };
    
    const handleNovoIdentificadorSalvo = (novoId: string) => {
        setDialogNovoIdentificador(false);
        carregarIdentificadores().then(() => {
            const novoIdent = identificadores.find(i => i.id === novoId);
            if (novoIdent) {
                form.setValue('identificacao', novoIdent.descricao);
            }
        });
        setTimeout(() => {
            supabase.from(tabelaIdentificacao).select('descricao').eq('id', novoId).single().then(({ data }) => {
                if (data) form.setValue('identificacao', data.descricao);
            });
        }, 100);
    };
    
    const uploadComprovante = async (file: File, parcelaId: string): Promise<string> => {
        setIsUploading(true);
        const fileExt = file.name.split('.').pop();
        const fileName = `${proprietarioDaSessao}/${parcelaId}/comprovantes-cr/${Date.now()}.${fileExt}`;
        try {
            const { data, error: uploadError } = await supabase.storage
                .from(COMPROVANTE_BUCKET)
                .upload(fileName, file, { cacheControl: '3600', upsert: false });
            if (uploadError) throw new Error(uploadError.message);
            const { data: publicUrlData } = supabase.storage.from(COMPROVANTE_BUCKET).getPublicUrl(data.path);
            showSuccess('Comprovante enviado com sucesso!');
            return publicUrlData.publicUrl;
        } catch (error: any) {
            showError('Falha ao fazer upload do comprovante: ' + error.message);
            throw error;
        } finally {
            setIsUploading(false);
        }
    };

    const onSubmit = async (values: FormValues) => {
        if (!proprietarioDaSessao || !parcela) {
            showError('Dados da parcela ou administrador estão incompletos.');
            return;
        }
        
        if (!values.descricao_extrato) {
            showError('Selecione uma descrição para o extrato.');
            return;
        }
        
        setLoading(true);

        try {
            let comprovanteUrl: string | null = values.comprovante_url || null;

            if (comprovanteFile) {
                comprovanteUrl = await uploadComprovante(comprovanteFile, parcela.id);
            }
            
            const contaDestinoDetalhe = contasDestino.find(c => c.id === contaDestinoId);
            const extratosPayload = [];
            
            if (contaDestinoDetalhe?.plano_contas?.is_banco) { 
                const valorExtrato = Math.abs(valorRecebido); 
                const contaContabilRecebimento = isAdmin 
                    ? (await supabase.from('configuracao_contas_receber').select('conta_contabil_id').eq('proprietario_id', proprietarioDaSessao).eq('tipo_registro', 'recebimento').single()).data?.conta_contabil_id 
                    : null;
                
                extratosPayload.push({
                    empresa_id: proprietarioDaSessao,
                    id_saldo_contas: contaDestinoId,
                    data: format(dataPagamento, 'yyyy-MM-dd'),
                    descricao: values.descricao_extrato,
                    valor: valorExtrato,
                    tipo: 'Entrada' as const,
                    identificacao: (values.identificacao && values.identificacao !== '__nenhum__') ? values.identificacao : null,
                    conciliado: false,
                    conta_contabil_id: contaContabilRecebimento,
                });
            }
            
            if (extratosPayload.length > 0) {
                const { error: extratoError } = await supabase.from('extratos').insert(extratosPayload);
                if (extratoError) throw extratoError;
            }
            
            const fullValues: any = {
                ...values,
                valor_recebido: valorRecebido,
                data_pagamento: dataPagamento,
                forma_pagamento: formaPagamento,
                conta_id: contaDestinoId,
                historico_id: historicoId,
                conta_patrimonial_id: contaPatrimonialId,
                codigo_transacao: codigoTransacao, // NOVO CAMPO
                acao_saldo_restante: isPagamentoParcial ? values.acao_saldo_restante : undefined,
                nova_data_vencimento: isPagamentoParcial ? values.nova_data_vencimento : undefined,
                numero_novas_parcelas: isPagamentoParcial ? values.numero_novas_parcelas : undefined,
                intervalo_dias_novas_parcelas: isPagamentoParcial ? values.intervalo_dias_novas_parcelas : undefined,
            };

            await saveRecebimentoAndLancamentos({
                values: fullValues,
                parcela,
                proprietarioDaSessao,
                isAdmin,
                contasDestino,
                comprovanteUrl,
            });

            showSuccess('Recebimento e Extrato registrados com sucesso!');
            onSaveComplete();
            onClose();

        } catch (error: any) {
            console.error('Erro no fluxo de recebimento/extrato:', error);
            showError(`Falha ao registrar recebimento: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setComprovanteFile(e.target.files?.[0] || null);
    };
    
    const handleRemoveFile = () => {
        setComprovanteFile(null);
        form.setValue('comprovante_url', '');
    };
    
    const isSubmitting = loading || isUploading;
    const proximaOrdemDescricao = descricoes.length > 0 ? Math.max(...descricoes.map(d => d.ordem)) + 1 : 0;
    const proximaOrdemIdentificador = identificadores.length > 0 ? Math.max(...identificadores.map(i => i.ordem)) + 1 : 0;

    return (
        <>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <h3 className="text-lg font-semibold">Detalhes do Extrato Bancário</h3>
                    <p className="text-sm text-muted-foreground">
                        Confirme os dados que serão registrados na tabela `extratos` para evitar duplicidade na conciliação.
                    </p>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2 p-3 bg-secondary rounded-md">
                            <p className="text-sm font-medium">Conta de Destino</p>
                            <p className="text-xs font-mono">{contasDestino.find(c => c.id === contaDestinoId)?.nome}</p>
                        </div>
                        <div className="space-y-2 p-3 bg-secondary rounded-md">
                            <p className="text-sm font-medium">Data / Valor Recebido</p>
                            <p className="text-xs font-mono">{format(dataPagamento, 'dd/MM/yyyy')}</p>
                            <p className="text-lg font-bold text-green-600">{formatCurrency(valorRecebido)}</p>
                        </div>
                    </div>
                    
                    <FormField control={form.control} name="descricao_extrato" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Descrição no Extrato</FormLabel>
                            <div className="flex gap-2">
                                <Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting || loadingDescricoes}>
                                    <FormControl>
                                        <SelectTrigger className="flex-1">
                                            <SelectValue placeholder={loadingDescricoes ? "Carregando..." : "Selecione uma descrição"} />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {descricoes.map(d => (
                                            <SelectItem key={d.id} value={d.descricao}>{d.descricao}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button type="button" variant="outline" size="icon" onClick={() => setDialogNovaDescricao(true)} disabled={isSubmitting}>
                                    <PlusCircle className="h-4 w-4" />
                                </Button>
                            </div>
                            <FormMessage />
                        </FormItem>
                    )} />
                    
                    <FormField control={form.control} name="identificacao" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Identificação / Documento (Opcional)</FormLabel>
                            <div className="flex gap-2">
                                <Select onValueChange={field.onChange} value={field.value || undefined} disabled={isSubmitting || loadingIdentificadores}>
                                    <FormControl>
                                        <SelectTrigger className="flex-1">
                                            <SelectValue placeholder={loadingIdentificadores ? "Carregando..." : "Selecione um identificador (opcional)"} />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="__nenhum__">Nenhum</SelectItem>
                                        {identificadores.map(i => (
                                            <SelectItem key={i.id} value={i.descricao}>{i.descricao}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button type="button" variant="outline" size="icon" onClick={() => setDialogNovoIdentificador(true)} disabled={isSubmitting}>
                                    <PlusCircle className="h-4 w-4" />
                                </Button>
                            </div>
                            <FormMessage />
                        </FormItem>
                    )} />
                    
                    <FormField control={form.control} name="observacao" render={({ field }) => (
                        <FormItem><FormLabel>Observação (Opcional)</FormLabel><FormControl><Textarea rows={2} placeholder="Observações sobre o recebimento..." {...field} disabled={isSubmitting} /></FormControl><FormMessage /></FormItem>
                    )} />
                    
                    <Separator />
                    
                    <h3 className="text-lg font-semibold flex items-center"><FileText className="w-5 h-5 mr-2" /> Comprovante (Opcional)</h3>
                    <div className="space-y-2">
                        <Input type="file" accept="image/*, application/pdf" onChange={handleFileChange} disabled={isSubmitting} />
                        {comprovanteFile && (
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-green-600 flex items-center"><CheckCircle2 className="w-4 h-4 mr-1" /> {comprovanteFile.name}</span>
                                <Button variant="link" size="sm" onClick={handleRemoveFile} disabled={isSubmitting}>
                                    <XCircle className="w-4 h-4 mr-1" /> Remover
                                </Button>
                            </div>
                        )}
                    </div>
                    
                    {isPagamentoParcial && (
                        <div className="space-y-4 pt-4 border-t">
                            <h3 className="font-semibold text-destructive">Saldo restante: {formatCurrency(saldoRestante)}</h3>
                            <FormField control={form.control} name="acao_saldo_restante" render={({ field }) => (
                                <FormItem><FormLabel>O que fazer com o saldo restante?</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="space-y-2"><FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="desconto" /></FormControl><FormLabel className="font-normal">Conceder Desconto (Perdoar)</FormLabel></FormItem><FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="reprogramar" /></FormControl><FormLabel className="font-normal">Reprogramar Saldo</FormLabel></FormItem><FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="parcelar" /></FormControl><FormLabel className="font-normal">Parcelar Saldo</FormLabel></FormItem></RadioGroup></FormControl><FormMessage /></FormItem>
                            )} />
                            {acaoSaldoRestante === 'reprogramar' && <FormField control={form.control} name="nova_data_vencimento" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>Nova Data de Vencimento</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "PPP", { locale: ptBR }) : <span>Escolha a data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus locale={ptBR} /></PopoverContent></Popover><FormMessage /></FormItem>)} />}
                            {acaoSaldoRestante === 'parcelar' && (
                                <div className="grid grid-cols-3 gap-4 items-end">
                                    <FormField control={form.control} name="numero_novas_parcelas" render={({ field }) => (<FormItem><FormLabel>Nº Parcelas</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
                                    <FormField control={form.control} name="intervalo_dias_novas_parcelas" render={({ field }) => (<FormItem><FormLabel>Intervalo</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
                                    <FormField control={form.control} name="nova_data_vencimento" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>1º Venc.</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("w-full text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "dd/MM/yy") : <span>Data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus locale={ptBR} /></PopoverContent></Popover><FormMessage /></FormItem>)} />
                                </div>
                            )}
                        </div>
                    )}

                    <Button type="submit" className="w-full" disabled={isSubmitting}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        <Save className="mr-2 h-4 w-4" /> Confirmar Recebimento e Extrato
                    </Button>
                </form>
            </Form>
            
            <Dialog open={dialogNovaDescricao} onOpenChange={setDialogNovaDescricao}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Nova Descrição</DialogTitle></DialogHeader>
                    {proprietarioDaSessao && (
                        <FormNovoItem
                            tipo="descricao"
                            proprietarioId={proprietarioDaSessao}
                            isAdmin={isAdmin}
                            proximaOrdem={proximaOrdemDescricao}
                            onSaveComplete={handleNovaDescricaoSalva}
                            onClose={() => setDialogNovaDescricao(false)}
                        />
                    )}
                </DialogContent>
            </Dialog>
            
            <Dialog open={dialogNovoIdentificador} onOpenChange={setDialogNovoIdentificador}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Novo Identificador</DialogTitle></DialogHeader>
                    {proprietarioDaSessao && (
                        <FormNovoItem
                            tipo="identificacao"
                            proprietarioId={proprietarioDaSessao}
                            isAdmin={isAdmin}
                            proximaOrdem={proximaOrdemIdentificador}
                            onSaveComplete={handleNovoIdentificadorSalvo}
                            onClose={() => setDialogNovoIdentificador(false)}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
};

export default FormExtratoManualCR;