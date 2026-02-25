import React, { useState, useEffect, useCallback } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, Loader2, PlusCircle, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useOwner } from '@/hooks/use-owner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { AdminParcelaPagar } from '@/types/contas-pagar';
import useSaldoContaCalculado, { SaldoCalculado } from '@/hooks/use-saldo-conta-calculado';
import { Separator } from '../ui/separator';
import { Historico } from '@/types/historico';
import { Checkbox } from '../ui/checkbox';
import { PlanoContas } from '@/types/plano-contas';
import { useContabilConfig } from '@/hooks/use-contabil-config';
import FormExtratoManualCP from './FormExtratoManualCP';
import { formatCurrency } from '@/utils/formatters';

interface ParcelaParaPagamento extends AdminParcelaPagar {
  fornecedor: string;
}

const formSchema = z.object({
  data_pagamento: z.date({ required_error: 'A data é obrigatória.' }),
  forma_pagamento: z.string().min(1, 'A forma de pagamento é obrigatória.'),
  pagamentos: z.array(z.object({
    conta_id: z.string().uuid('Selecione uma conta de origem.'),
    valor_pago: z.coerce.number().positive('O valor deve ser maior que zero.'),
  })).min(1, 'Adicione pelo menos uma forma de pagamento.'),
  
  acao_saldo_restante: z.enum(['desconto', 'reprogramar', 'parcelar']).optional(),
  nova_data_vencimento: z.date().optional(),
  numero_novas_parcelas: z.coerce.number().int().min(2).optional(),
  intervalo_dias_novas_parcelas: z.coerce.number().int().min(1).optional(),
  
  historico_id: z.string().uuid('Selecione um histórico válido.').nullable(),
  salvar_como_padrao: z.boolean().optional(),
  
  conta_patrimonial_id: z.string().uuid('Selecione a conta patrimonial.').nullable(),
});

type FormValues = z.infer<typeof formSchema>;

interface RegistrarPagamentoCPDialogProps {
  parcela: ParcelaParaPagamento | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaveComplete: () => void;
}

const RegistrarPagamentoCPDialog: React.FC<RegistrarPagamentoCPDialogProps> = ({ parcela, open, onOpenChange, onSaveComplete }) => {
  const { ownerId, ownerType } = useOwner();
  const { configMap } = useContabilConfig();
  
  const isAdminOrEmployee = ownerType === 'Admin' || ownerType === 'AdminUsuario';
  
  const [historicos, setHistoricos] = useState<Historico[]>([]);
  const [loadingHistoricos, setLoadingHistoricos] = useState(true);
  const [contasPatrimoniais, setContasPatrimoniais] = useState<PlanoContas[]>([]);
  const [loadingContasPatrimoniais, setLoadingContasPatrimoniais] = useState(true);
  const [mapeamentoContabil, setMapeamentoContabil] = useState<Record<string, string | null>>({});
  const [isInitialized, setIsInitialized] = useState(false);
  const [extratoManualDialog, setExtratoManualDialog] = useState(false);
  const [pendingPaymentData, setPendingPaymentData] = useState<FormValues & { isPagamentoParcial: boolean, saldoRestante: number } | null>(null);

  const tabelaPagamentos = isAdminOrEmployee ? 'admin_pagamentos' : 'pagamentos';
  const tabelaParcelas = isAdminOrEmployee ? 'admin_parcelas_pagar' : 'parcelas_contas_pagar';
  const tabelaContasPagar = isAdminOrEmployee ? 'admin_contas_pagar' : 'contas_pagar';
  
  const proprietarioId = ownerId;

  const { contas: contasOrigem, carregando: loadingContas, refetch: refetchSaldos } = useSaldoContaCalculado('todos', 'todos', '', 'bancos', false);

  const saldoDevedor = parcela ? parcela.valor_parcela - (parcela.valor_pago || 0) : 0;
  const valorInicial = saldoDevedor > 0.01 ? saldoDevedor : (parcela?.valor_pago || 0);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    context: { saldoDevedor },
    defaultValues: {
      data_pagamento: new Date(),
      forma_pagamento: 'Pix',
      pagamentos: [],
      historico_id: null,
      salvar_como_padrao: false,
      conta_patrimonial_id: null,
      acao_saldo_restante: 'desconto',
      nova_data_vencimento: addDays(new Date(), 30),
      numero_novas_parcelas: 2,
      intervalo_dias_novas_parcelas: 30,
    },
  });
  
  const { control, watch, reset } = form;
  const { fields, append, remove } = useFieldArray({
    control,
    name: "pagamentos",
  });

  const pagamentosArray = watch('pagamentos');
  const totalPago = pagamentosArray.reduce((sum, p) => sum + (Number(p.valor_pago) || 0), 0);
  const restante = saldoDevedor - totalPago;
  const acaoSaldoRestante = watch('acao_saldo_restante');
  const isPagamentoParcial = restante > 0.01;

  const fetchMapeamentoContabil = useCallback(async () => {
    if (!proprietarioId) return;
    
    const { data, error } = await supabase
        .from('configuracao_contas_pagar')
        .select('tipo_registro, conta_contabil_id')
        .eq('proprietario_id', proprietarioId);
        
    if (error) {
        console.error('Erro ao buscar mapeamento contábil CP:', error);
        setMapeamentoContabil({});
    } else {
        const map = (data as { tipo_registro: string, conta_contabil_id: string | null }[]).reduce((acc, item) => {
            acc[item.tipo_registro] = item.conta_contabil_id;
            return acc;
        }, {} as Record<string, string | null>);
        setMapeamentoContabil(map);
    }
  }, [proprietarioId]);
  
  const fetchHistoricos = useCallback(async () => {
    if (!proprietarioId) return;
    setLoadingHistoricos(true);
    const { data, error } = await supabase
        .from('historicos')
        .select('id, descricao, codigo')
        .eq('proprietario_id', proprietarioId)
        .order('descricao');
        
    if (error) {
        console.error('Erro ao carregar históricos:', error);
        setHistoricos([]);
    } else {
        setHistoricos(data as Historico[]);
    }
    setLoadingHistoricos(false);
  }, [proprietarioId]);
  
  const fetchContasPatrimoniais = useCallback(async () => {
    if (!proprietarioId) return;
    setLoadingContasPatrimoniais(true);
    
    const passivoCode = configMap.Passivo || '2';
    
    const { data, error } = await supabase
        .from('plano_contas')
        .select('id, Conta, Descricao')
        .eq('proprietario_id', proprietarioId)
        .eq('Analitica', 'Sim')
        .eq('is_conta_patrimonial', true)
        .eq('is_a_pagar', true)
        .like('Conta', `${passivoCode}.%`)
        .order('Conta');
        
    if (error) {
        showError('Erro ao carregar contas patrimoniais: ' + error.message);
        setContasPatrimoniais([]);
    } else {
        setContasPatrimoniais(data as PlanoContas[]);
    }
    setLoadingContasPatrimoniais(false);
  }, [proprietarioId, configMap.Passivo]);
  
  const fetchHistoricoPadrao = useCallback(async () => {
    if (!isAdminOrEmployee || !proprietarioId) return null;
    
    const { data, error } = await supabase
        .from('configuracao_historico_padrao')
        .select('historico_id')
        .eq('proprietario_id', proprietarioId)
        .eq('tipo_registro', 'pagamento_padrao')
        .limit(1)
        .single();
        
    if (error && error.code !== 'PGRST116') {
        console.error('Erro ao buscar histórico padrão CP:', error);
    }
    
    return data?.historico_id || null;
  }, [isAdminOrEmployee, proprietarioId]);

  useEffect(() => {
      if (open && proprietarioId) {
          setIsInitialized(false);
          refetchSaldos();
          fetchHistoricos();
          fetchContasPatrimoniais();
          fetchMapeamentoContabil();
      }
  }, [open, proprietarioId, refetchSaldos, fetchHistoricos, fetchContasPatrimoniais, fetchMapeamentoContabil]);

  useEffect(() => {
    if (open && !loadingContas && !isInitialized && proprietarioId) {
        const initialize = async () => {
            const defaultHistoricoId = await fetchHistoricoPadrao();
            
            const { data: contaSintetica } = await supabase
                .from(tabelaContasPagar)
                .select('id_conta_patrimonial')
                .eq('id', parcela!.conta_pagar_id)
                .single();
                
            const contaPatrimonialId = contaSintetica?.id_conta_patrimonial || null;
            
            reset({
                data_pagamento: new Date(),
                forma_pagamento: 'Pix',
                pagamentos: contasOrigem.length > 0 
                    ? [{ conta_id: contasOrigem[0].id, valor_pago: valorInicial }]
                    : [],
                historico_id: defaultHistoricoId,
                salvar_como_padrao: false,
                conta_patrimonial_id: contaPatrimonialId,
                acao_saldo_restante: 'desconto',
                nova_data_vencimento: addDays(new Date(), 30),
                numero_novas_parcelas: 2,
                intervalo_dias_novas_parcelas: 30,
            });
            setIsInitialized(true);
        };
        initialize();
    }
    if (!open) {
        setIsInitialized(false);
    }
  }, [open, loadingContas, contasOrigem, valorInicial, isInitialized, reset, fetchHistoricoPadrao, parcela, tabelaContasPagar, proprietarioId]);

  useEffect(() => {
    if (open && !loadingContas && isInitialized && fields.length === 0 && contasOrigem.length > 0) {
      append({ conta_id: contasOrigem[0].id, valor_pago: valorInicial });
    }
  }, [open, loadingContas, contasOrigem, valorInicial, isInitialized, append, fields.length]);

  const saveDirectPayment = async (values: FormValues, comprovanteUrl: string | null = null) => {
    if (!parcela || !proprietarioId) return;

    const dataPagamento = values.data_pagamento;
    const dataNoonUTC = new Date(Date.UTC(dataPagamento.getFullYear(), dataPagamento.getMonth(), dataPagamento.getDate(), 12, 0, 0));
    const dataPagamentoISO = dataNoonUTC.toISOString();
    const totalPago = values.pagamentos.reduce((s, p) => s + p.valor_pago, 0);
    const origemVincular = `pagamento_cp:${parcela.id}`;

    const { data: contaSintetica } = await supabase
        .from(tabelaContasPagar)
        .select('id_conta_patrimonial')
        .eq('id', parcela.conta_pagar_id)
        .single();
    const contaPatrimonial = contaSintetica?.id_conta_patrimonial || null;

    for (const pagamento of values.pagamentos) {
        const pagamentoPayload = {
            parcela_id: parcela.id,
            [isAdminOrEmployee ? 'admin_id' : 'empresa_id']: proprietarioId,
            valor_pago: pagamento.valor_pago,
            conta_id: pagamento.conta_id,
            data_pagamento: dataPagamentoISO,
            forma_pagamento: values.forma_pagamento,
            tipo_pagamento: isPagamentoParcial ? 'parcial' : 'total',
            historico_id: values.historico_id,
        };
        const { error: pagErr } = await supabase.from(tabelaPagamentos).insert(pagamentoPayload);
        if (pagErr) { showError('Erro ao registrar pagamento: ' + pagErr.message); return; }

        const contaSelecionada = contasOrigem.find(c => c.id === pagamento.conta_id);
        const contaContabilBanco = (contaSelecionada as any)?.plano_contas?.id || null;

        const idAtivo = crypto.randomUUID();
        const idPassivo = crypto.randomUUID();

        const lancamentos: any[] = [{
            id: idAtivo,
            proprietario_id: proprietarioId,
            data_movimentacao: dataPagamentoISO,
            descricao: `Pagamento Parcela ${parcela.id.substring(0, 8)} - ${parcela.fornecedor}`,
            valor: pagamento.valor_pago,
            tipo: 'Saida' as const,
            conta_bancaria_id: pagamento.conta_id,
            conta_contabil_id: contaContabilBanco,
            origem: origemVincular,
            documento: parcela.id,
            historico_id: values.historico_id,
            conta_resultado_id: idPassivo,
        }];

        if (contaPatrimonial) {
            lancamentos.push({
                id: idPassivo,
                proprietario_id: proprietarioId,
                data_movimentacao: dataPagamentoISO,
                descricao: `Baixa Passivo CP: ${parcela.fornecedor} (Parcela ${parcela.numero_parcela})`,
                valor: pagamento.valor_pago,
                tipo: 'Entrada' as const,
                conta_bancaria_id: null,
                conta_contabil_id: contaPatrimonial,
                origem: origemVincular,
                documento: parcela.id,
                historico_id: values.historico_id,
                conta_resultado_id: idAtivo,
            });
        }

        const { error: lancErr } = await supabase.from('lancamentos').insert(lancamentos);
        if (lancErr) { showError('Erro ao gerar lançamentos: ' + lancErr.message); return; }
    }

    const novoValorPago = (parcela.valor_pago || 0) + totalPago;
    const saldoApos = parcela.valor_parcela - novoValorPago;
    const novoStatus = saldoApos <= 0.01 ? 'paga' : 'parcial';

    await supabase.from(tabelaParcelas).update({
        status: novoStatus,
        valor_pago: novoValorPago,
        data_pagamento: format(dataPagamento, 'yyyy-MM-dd'),
    }).eq('id', parcela.id);

    if (novoStatus === 'paga') {
        const { count } = await supabase.from(tabelaParcelas)
            .select('id', { count: 'exact', head: true })
            .eq('conta_pagar_id', parcela.conta_pagar_id)
            .in('status', ['aberta', 'parcial', 'reprogramada']);
        if (count === 0) {
            await supabase.from(tabelaContasPagar).update({ status: 'pago' }).eq('id', parcela.conta_pagar_id);
        }
    }

    onSaveComplete();
  };

  const onSubmit = async (values: FormValues) => {
    if (!parcela || !proprietarioId) {
        showError('Dados da parcela ou proprietário estão incompletos.');
        return;
    }
    
    if (Math.abs(restante) > 0.01 && !isPagamentoParcial) {
        showError('O valor total pago deve ser igual ao saldo devedor da parcela.');
        return;
    }

    for (const pagamento of values.pagamentos) {
        const contaSelecionada = contasOrigem.find(c => c.id === pagamento.conta_id);
        if (!contaSelecionada) {
            showError(`Conta de origem com ID ${pagamento.conta_id} não encontrada.`);
            return;
        }
        if (contaSelecionada.saldo_atual < pagamento.valor_pago) {
            showError(`Saldo insuficiente na conta "${contaSelecionada.nome}". Saldo: ${formatCurrency(contaSelecionada.saldo_atual)}, Tentativa de Pagar: ${formatCurrency(pagamento.valor_pago)}`);
            return;
        }
    }
    
    const hasBankPayment = values.pagamentos.some(p => {
        const conta = contasOrigem.find(c => c.id === p.conta_id);
        return conta?.plano_contas?.is_banco === true;
    });
    
    if (hasBankPayment) {
        setPendingPaymentData({ ...values, isPagamentoParcial, saldoRestante: restante });
        setExtratoManualDialog(true);
        return;
    }
    
    await saveDirectPayment(values);
    onOpenChange(false);
  };

  const isSubmitDisabled = loadingContas || form.formState.isSubmitting || (Math.abs(restante) > 0.01 && !isPagamentoParcial) || (isPagamentoParcial && !acaoSaldoRestante);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar Pagamento</DialogTitle>
            <DialogDescription>Saldo devedor da parcela: {formatCurrency(saldoDevedor)}</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="data_pagamento" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>Data do Pagamento</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "dd/MM/yy", { locale: ptBR }) : <span>Data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus locale={ptBR} /></PopoverContent></Popover><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="forma_pagamento" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>Forma de Pagamento</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
              </div>
              
              <Separator />
              
              <div className="space-y-4">
                  <FormLabel>Fontes de Pagamento (Ativo)</FormLabel>
                  {fields.map((item, index) => {
                      const conta = contasOrigem.find(c => c.id === item.conta_id);
                      const isBank = conta?.plano_contas?.is_banco;

                      return (
                          <div key={item.id} className="flex items-end space-x-2 p-2 border rounded-md">
                              <FormField
                                  control={control}
                                  name={`pagamentos.${index}.conta_id`}
                                  render={({ field }) => (
                                      <FormItem className="flex-1">
                                          <Select onValueChange={field.onChange} value={field.value || undefined} disabled={loadingContas}>
                                              <FormControl><SelectTrigger className={cn(isBank && 'border-blue-500')}><SelectValue placeholder="Selecione a conta" /></SelectTrigger></FormControl>
                                              <SelectContent>
                                                  {contasOrigem.map(c => (
                                                      <SelectItem key={c.id} value={c.id}>
                                                          {c.nome} ({formatCurrency(c.saldo_atual)})
                                                      </SelectItem>
                                                  ))}
                                              </SelectContent>
                                          </Select>
                                          <FormMessage />
                                      </FormItem>
                                  )}
                              />
                              <FormField
                                  control={control}
                                  name={`pagamentos.${index}.valor_pago`}
                                  render={({ field }) => (
                                      <FormItem className="w-1/3">
                                          <FormControl><Input type="number" step="0.01" placeholder="Valor" {...field} /></FormControl>
                                          <FormMessage />
                                      </FormItem>
                                  )}
                              />
                              <Button type="button" variant="destructive" size="icon" onClick={() => remove(index)} disabled={fields.length <= 1}>
                                  <Trash2 className="w-4 h-4" />
                              </Button>
                          </div>
                      );
                  })}
                  <Button type="button" variant="outline" size="sm" onClick={() => append({ conta_id: '', valor_pago: 0 })}>
                      <PlusCircle className="w-4 h-4 mr-2" /> Adicionar Fonte de Pagamento
                  </Button>
              </div>
              
              <Separator />
              
              <FormField
                control={form.control}
                name="conta_patrimonial_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Conta Patrimonial (Obrigação a Pagar)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || undefined} disabled={loadingContasPatrimoniais}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={loadingContasPatrimoniais ? "Carregando Contas..." : `Selecione a conta de Passivo (${configMap.Passivo}.x.x)`} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={null as any}>Nenhum (Não Mapear)</SelectItem>
                        {contasPatrimoniais.map(c => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.Conta} - {c.Descricao}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                    {contasPatrimoniais.length === 0 && !loadingContasPatrimoniais && (
                      <p className="text-sm text-red-500">
                        Nenhuma conta Patrimonial marcada como Contas a Pagar no Plano de Contas.
                      </p>
                    )}
                  </FormItem>
                )}
              />
              
              {(isAdminOrEmployee) && (
                  <div className="space-y-2 pt-2 border-t">
                      <FormField
                          control={form.control}
                          name="historico_id"
                          render={({ field }) => (
                              <FormItem>
                                  <FormLabel>Histórico do Pagamento (Opcional)</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value || undefined} disabled={loadingHistoricos}>
                                      <FormControl>
                                          <SelectTrigger>
                                              <SelectValue placeholder={loadingHistoricos ? "Carregando Históricos..." : "Selecione o histórico"} />
                                          </SelectTrigger>
                                      </FormControl>
                                      <SelectContent>
                                          <SelectItem value={null as any}>Nenhum</SelectItem>
                                          {historicos.map(h => (
                                              <SelectItem key={h.id} value={h.id}>
                                                  {h.codigo && `[${h.codigo}] `}{h.descricao}
                                              </SelectItem>
                                          ))}
                                      </SelectContent>
                                  </Select>
                                  <FormMessage />
                              </FormItem>
                          )}
                      />
                      <FormField
                          control={form.control}
                          name="salvar_como_padrao"
                          render={({ field }) => (
                              <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-3">
                                  <FormControl>
                                      <Checkbox
                                          checked={field.value}
                                          onCheckedChange={field.onChange}
                                          disabled={!form.watch('historico_id')}
                                      />
                                  </FormControl>
                                  <div className="space-y-1 leading-none">
                                      <FormLabel>
                                          Definir este Histórico como Padrão para Pagamentos
                                      </FormLabel>
                                  </div>
                              </FormItem>
                          )}
                      />
                  </div>
              )}
              
              {isPagamentoParcial && (
                <div className="space-y-4 pt-4 border-t">
                  <h3 className="font-semibold text-destructive">Saldo restante: {formatCurrency(restante)}</h3>
                  <FormField control={form.control} name="acao_saldo_restante" render={({ field }) => (
                    <FormItem><FormLabel>O que fazer com o saldo restante?</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="space-y-2"><FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="desconto" /></FormControl><FormLabel className="font-normal">Conceder Desconto Obtido (Receita)</FormLabel></FormItem><FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="reprogramar" /></FormControl><FormLabel className="font-normal">Reprogramar Saldo</FormLabel></FormItem><FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="parcelar" /></FormControl><FormLabel className="font-normal">Parcelar Saldo</FormLabel></FormItem></RadioGroup></FormControl></FormItem>
                  )} />
                  {acaoSaldoRestante === 'reprogramar' && <FormField control={form.control} name="nova_data_vencimento" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>Nova Data de Vencimento</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "PPP", { locale: ptBR }) : <span>Escolha a data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus locale={ptBR} /></PopoverContent></Popover><FormMessage /></FormItem>)} />}
                  {acaoSaldoRestante === 'parcelar' && (
                    <div className="grid grid-cols-3 gap-4 items-end">
                      <FormField control={control} name="numero_novas_parcelas" render={({ field }) => (<FormItem><FormLabel>Nº Parcelas</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
                      <FormField control={control} name="intervalo_dias_novas_parcelas" render={({ field }) => (<FormItem><FormLabel>Intervalo</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
                      <FormField control={control} name="nova_data_vencimento" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>1º Venc.</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("w-full text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "dd/MM/yy", { locale: ptBR }) : <span>Data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus locale={ptBR} /></PopoverContent></Popover><FormMessage /></FormItem>)} />
                    </div>
                  )}
                </div>
              )}
              
              <div className="p-4 bg-secondary rounded-md space-y-2 text-sm">
                <div className="flex justify-between font-medium"><p>Total Informado:</p><p>{formatCurrency(totalPago)}</p></div>
                <Separator />
                <div className={cn("flex justify-between font-bold text-lg", Math.abs(restante) > 0.01 ? 'text-red-600' : 'text-green-600')}>
                  <p>Restante a Pagar:</p>
                  <p>{formatCurrency(restante)}</p>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitDisabled}>
                <Loader2 className={cn("mr-2 h-4 w-4 animate-spin", !form.formState.isSubmitting && "hidden")} />
                Confirmar Pagamento
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {extratoManualDialog && pendingPaymentData && parcela && (
        <Dialog open={extratoManualDialog} onOpenChange={setExtratoManualDialog}>
          <DialogContent className="sm:max-w-lg max-h-[95vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Registro de Extrato Manual</DialogTitle>
              <DialogDescription>Confirme os detalhes do extrato para evitar duplicidade na conciliação.</DialogDescription>
            </DialogHeader>
            <FormExtratoManualCP
              parcela={parcela}
              pagamentoDetalhes={pendingPaymentData.pagamentos.map(p => ({ conta_id: p.conta_id, valor_pago: p.valor_pago }))}
              formaPagamento={pendingPaymentData.forma_pagamento}
              dataPagamento={pendingPaymentData.data_pagamento}
              historicoId={pendingPaymentData.historico_id}
              contaPatrimonialId={pendingPaymentData.conta_patrimonial_id}
              contasOrigem={contasOrigem}
              mapeamentoContabil={mapeamentoContabil}
              onSaveComplete={onSaveComplete}
              onClose={() => setExtratoManualDialog(false)}
              parentValues={pendingPaymentData}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

export default RegistrarPagamentoCPDialog;