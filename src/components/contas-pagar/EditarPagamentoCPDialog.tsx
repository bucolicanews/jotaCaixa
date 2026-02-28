import React, { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, CalendarIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useSessao } from '@/hooks/use-sessao';
import { useOwner } from '@/hooks/use-owner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import useSaldoContaCalculado from '@/hooks/use-saldo-conta-calculado';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Calendar } from '../ui/calendar';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Separator } from '../ui/separator';
import FormExtratoManualCP from './FormExtratoManualCP';
import { AdminParcelaPagar } from '@/types/contas-pagar';

interface ParcelaParaPagamentoCP extends AdminParcelaPagar {
    fornecedor: string;
}

interface EditarPagamentoCPDialogProps {
    parcelaId: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSaveComplete: () => void;
}

const formSchema = z.object({
    conta_id: z.string().uuid('Selecione a conta de origem.'),
    valor_pago: z.coerce.number().positive('O valor deve ser maior que zero.'),
    data_pagamento: z.date({ required_error: 'A data é obrigatória.' }),
    forma_pagamento: z.string().min(1, 'A forma de pagamento é obrigatória.'),
    historico_id: z.string().uuid('Selecione um histórico.').nullable(),
});

type FormValues = z.infer<typeof formSchema>;

const EditarPagamentoCPDialog: React.FC<EditarPagamentoCPDialogProps> = ({
    parcelaId,
    open,
    onOpenChange,
    onSaveComplete,
}) => {
    const { role, usuario, perfil } = useSessao();
    const { ownerId } = useOwner();

    const isDirectAdmin = role === 'Admin';
    const adminIdFromProfile = (perfil as any)?.admin_id ?? null;
    const isAdminOrEmployee = isDirectAdmin || (role === 'Usuario' && !!adminIdFromProfile);
    const proprietarioId = isDirectAdmin ? usuario?.id : (isAdminOrEmployee ? adminIdFromProfile : ((perfil as any)?.cliente_id || (perfil as any)?.id));

    const tabelaParcelas = isAdminOrEmployee ? 'admin_parcelas_pagar' : 'parcelas_contas_pagar';
    const tabelaPagamentos = isAdminOrEmployee ? 'admin_pagamentos' : 'pagamentos';
    const tabelaContasPagar = isAdminOrEmployee ? 'admin_contas_pagar' : 'contas_pagar';

    const [loading, setLoading] = useState(false);
    const [historicos, setHistoricos] = useState<{ id: string; descricao: string; codigo?: string }[]>([]);
    const [parcelaData, setParcelaData] = useState<any>(null);
    const [extratoManualDialog, setExtratoManualDialog] = useState(false);
    const [pendingExtratoData, setPendingExtratoData] = useState<{
        parcela: ParcelaParaPagamentoCP;
        pagamentoDetalhes: { conta_id: string; valor_pago: number }[];
        formaPagamento: string;
        dataPagamento: Date;
        historicoId: string | null;
        contaPatrimonialId: string | null;
        mapeamentoContabil: Record<string, string | null>;
    } | null>(null);

    const { contas: contasOrigem, refetch: refetchSaldos } = useSaldoContaCalculado('todos', 'todos', '', 'bancos');

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            conta_id: '',
            valor_pago: 0,
            data_pagamento: new Date(),
            forma_pagamento: 'Pix',
            historico_id: null,
        },
    });

    const fetchHistoricos = useCallback(async () => {
        if (!proprietarioId) return;
        const { data } = await supabase
            .from('historicos')
            .select('id, descricao, codigo')
            .eq('proprietario_id', proprietarioId)
            .order('descricao');
        setHistoricos(data || []);
    }, [proprietarioId]);

    const fetchPagamentoData = useCallback(async () => {
        if (!parcelaId || !proprietarioId) return;
        setLoading(true);
        try {
            const { data: pagamento, error: pagErr } = await supabase
                .from(tabelaPagamentos)
                .select('conta_id, valor_pago, data_pagamento, forma_pagamento, historico_id')
                .eq('parcela_id', parcelaId)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (pagErr) throw pagErr;

            const { data: parcela, error: parcelaErr } = await supabase
                .from(tabelaParcelas)
                .select('id, conta_pagar_id, valor_parcela, valor_pago, numero_parcela, admin_id')
                .eq('id', parcelaId)
                .single();

            if (parcelaErr) throw parcelaErr;
            setParcelaData(parcela);

            const dataPag = pagamento.data_pagamento
                ? new Date(pagamento.data_pagamento + 'T12:00:00')
                : new Date();
            form.reset({
                conta_id: pagamento.conta_id || '',
                valor_pago: pagamento.valor_pago || 0,
                data_pagamento: isNaN(dataPag.getTime()) ? new Date() : dataPag,
                forma_pagamento: pagamento.forma_pagamento || 'Pix',
                historico_id: pagamento.historico_id || null,
            });
        } catch (e: any) {
            showError('Erro ao carregar dados do pagamento: ' + e.message);
        } finally {
            setLoading(false);
        }
    }, [parcelaId, proprietarioId, tabelaPagamentos, tabelaParcelas, form]);

    useEffect(() => {
        if (open && parcelaId) {
            refetchSaldos();
            fetchHistoricos();
            fetchPagamentoData();
        }
    }, [open, parcelaId]);

    const onSubmit = async (values: FormValues) => {
        if (!parcelaId || !proprietarioId || !parcelaData) {
            showError('Dados incompletos.');
            return;
        }
        setLoading(true);
        try {
            const dataNoonUTC = new Date(Date.UTC(
                values.data_pagamento.getFullYear(),
                values.data_pagamento.getMonth(),
                values.data_pagamento.getDate(),
                12, 0, 0
            ));
            const dataPagamentoISO = dataNoonUTC.toISOString();

            await supabase
                .from(tabelaPagamentos)
                .update({
                    conta_id: values.conta_id,
                    valor_pago: values.valor_pago,
                    data_pagamento: format(values.data_pagamento, 'yyyy-MM-dd'),
                    forma_pagamento: values.forma_pagamento,
                    historico_id: values.historico_id,
                })
                .eq('parcela_id', parcelaId);

            const { error: deleteLancErr } = await supabase
                .from('lancamentos')
                .delete()
                .eq('proprietario_id', proprietarioId)
                .eq('documento', parcelaId)
                .not('origem', 'like', '%_estornada');

            if (deleteLancErr) throw deleteLancErr;

            const { data: contaSintetica } = await supabase
                .from(tabelaContasPagar)
                .select('id_conta_patrimonial, descricao, fornecedor')
                .eq('id', parcelaData.conta_pagar_id)
                .single();

            const { data: configData } = await supabase
                .from('configuracao_contas_pagar')
                .select('tipo_registro, conta_contabil_id')
                .eq('proprietario_id', proprietarioId);

            const configMap = (configData || []).reduce((acc: any, item: any) => {
                acc[item.tipo_registro] = item.conta_contabil_id;
                return acc;
            }, {} as Record<string, string | null>);

            const contaPatrimonial = contaSintetica?.id_conta_patrimonial || null;
            const origemVincular = `pagamento_cp:${parcelaId}`;
            const totalPago = values.valor_pago;

            const contaDestinoDetalhe = contasOrigem.find(c => c.id === values.conta_id);
            const contaContabilBanco = (contaDestinoDetalhe as any)?.plano_contas?.id || null;
            const isBankPayment = (contaDestinoDetalhe as any)?.plano_contas?.is_banco === true;

            const allLancamentos: any[] = [];
            const idBancoCredito = crypto.randomUUID();

            if (contaPatrimonial) {
                const idPassivo = crypto.randomUUID();
                allLancamentos.push({
                    id: idPassivo,
                    proprietario_id: proprietarioId,
                    data_movimentacao: dataPagamentoISO,
                    descricao: `Baixa Passivo CP: ${contaSintetica?.fornecedor || ''} (Parcela ${parcelaData.numero_parcela})`,
                    valor: totalPago,
                    tipo: 'Entrada' as const,
                    conta_bancaria_id: null,
                    conta_contabil_id: contaPatrimonial,
                    origem: origemVincular,
                    documento: parcelaId,
                    historico_id: values.historico_id,
                    conta_resultado_id: idBancoCredito,
                });
            }

            allLancamentos.push({
                id: idBancoCredito,
                proprietario_id: proprietarioId,
                data_movimentacao: dataPagamentoISO,
                descricao: `Pagamento Parcela ${parcelaId.substring(0, 8)} - ${contaSintetica?.fornecedor || ''}`,
                valor: totalPago,
                tipo: 'Saida' as const,
                conta_bancaria_id: values.conta_id,
                conta_contabil_id: contaContabilBanco,
                origem: origemVincular,
                documento: parcelaId,
                historico_id: values.historico_id,
                conta_resultado_id: allLancamentos.length > 0 ? allLancamentos[0].id : null,
            });

            if (allLancamentos.length > 0) {
                const { error: lancErr } = await supabase.from('lancamentos').insert(allLancamentos);
                if (lancErr) throw lancErr;
            }

            showSuccess('Lançamentos regenerados com sucesso!');

            if (isBankPayment) {
                const parcelaCP: ParcelaParaPagamentoCP = {
                    id: parcelaId,
                    conta_pagar_id: parcelaData.conta_pagar_id,
                    admin_id: parcelaData.admin_id,
                    empresa_id: proprietarioId,
                    numero_parcela: parcelaData.numero_parcela,
                    valor_parcela: parcelaData.valor_parcela,
                    valor_pago: parcelaData.valor_pago,
                    data_vencimento: '',
                    data_pagamento: format(values.data_pagamento, 'yyyy-MM-dd'),
                    status: 'paga',
                    fornecedor: contaSintetica?.fornecedor || '',
                } as any;

                setPendingExtratoData({
                    parcela: parcelaCP,
                    pagamentoDetalhes: [{ conta_id: values.conta_id, valor_pago: totalPago }],
                    formaPagamento: values.forma_pagamento,
                    dataPagamento: values.data_pagamento,
                    historicoId: values.historico_id,
                    contaPatrimonialId: contaPatrimonial,
                    mapeamentoContabil: configMap,
                });
                onOpenChange(false);
                setExtratoManualDialog(true);
            } else {
                onOpenChange(false);
                onSaveComplete();
            }
        } catch (e: any) {
            showError('Falha ao atualizar: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg max-h-[95vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Atualizar Lançamentos Contábeis</DialogTitle>
                    <DialogDescription>
                        Revise os dados do pagamento e salve para regenerar os lançamentos contábeis.
                    </DialogDescription>
                </DialogHeader>

                {loading ? (
                    <div className="flex justify-center items-center h-32">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : (
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                            <FormField
                                control={form.control}
                                name="valor_pago"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="font-bold">Valor Pago</FormLabel>
                                        <FormControl>
                                            <Input type="number" step="0.01" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="data_pagamento"
                                render={({ field }) => (
                                    <FormItem className="flex flex-col">
                                        <FormLabel>Data do Pagamento</FormLabel>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <FormControl>
                                                    <Button
                                                        variant="outline"
                                                        className={cn('pl-3 text-left font-normal', !field.value && 'text-muted-foreground')}
                                                    >
                                                        {field.value instanceof Date && !isNaN(field.value.getTime()) ? format(field.value, 'dd/MM/yyyy', { locale: ptBR }) : <span>Data</span>}
                                                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                    </Button>
                                                </FormControl>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0">
                                                <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus locale={ptBR} />
                                            </PopoverContent>
                                        </Popover>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="forma_pagamento"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Forma de Pagamento</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl>
                                            <SelectContent>
                                                <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                                                <SelectItem value="Pix">Pix</SelectItem>
                                                <SelectItem value="Cartão">Cartão</SelectItem>
                                                <SelectItem value="Boleto">Boleto</SelectItem>
                                                <SelectItem value="Transferência">Transferência</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <Separator />

                            <FormField
                                control={form.control}
                                name="conta_id"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Conta de Origem</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value || ''}>
                                            <FormControl><SelectTrigger><SelectValue placeholder="Selecione a conta" /></SelectTrigger></FormControl>
                                            <SelectContent>
                                                {contasOrigem.map(c => (
                                                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="historico_id"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Histórico</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value || ''}>
                                            <FormControl><SelectTrigger><SelectValue placeholder="Selecione o histórico" /></SelectTrigger></FormControl>
                                            <SelectContent>
                                                {historicos.map(h => (
                                                    <SelectItem key={h.id} value={h.id}>
                                                        {h.codigo ? `[${h.codigo}] ` : ''}{h.descricao}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <div className="flex gap-3 justify-end pt-4 border-t">
                                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                                    Cancelar
                                </Button>
                                <Button type="submit" disabled={loading}>
                                    {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</> : 'Salvar e Gerar Lançamentos'}
                                </Button>
                            </div>
                        </form>
                    </Form>
                )}
            </DialogContent>
        </Dialog>

        {extratoManualDialog && pendingExtratoData && (
            <Dialog open={extratoManualDialog} onOpenChange={setExtratoManualDialog}>
                <DialogContent className="sm:max-w-lg max-h-[95vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Registro de Extrato Manual</DialogTitle>
                        <DialogDescription>
                            Confirme os detalhes do extrato bancário para esta atualização de pagamento.
                        </DialogDescription>
                    </DialogHeader>
                    <FormExtratoManualCP
                        parcela={pendingExtratoData.parcela}
                        pagamentoDetalhes={pendingExtratoData.pagamentoDetalhes}
                        formaPagamento={pendingExtratoData.formaPagamento}
                        dataPagamento={pendingExtratoData.dataPagamento}
                        historicoId={pendingExtratoData.historicoId}
                        contaPatrimonialId={pendingExtratoData.contaPatrimonialId}
                        contasOrigem={contasOrigem}
                        mapeamentoContabil={pendingExtratoData.mapeamentoContabil}
                        onSaveComplete={() => {
                            setExtratoManualDialog(false);
                            setPendingExtratoData(null);
                            onSaveComplete();
                        }}
                        onClose={() => {
                            setExtratoManualDialog(false);
                            setPendingExtratoData(null);
                            onSaveComplete();
                        }}
                    />
                </DialogContent>
            </Dialog>
        )}
        </>
    );
};

export default EditarPagamentoCPDialog;
