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
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useSessao } from '@/hooks/use-sessao';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { AdminParcelaPagar } from '@/types/contas-pagar';
import useSaldoContaCalculado from '@/hooks/use-saldo-conta-calculado';
import { Separator } from '../ui/separator';
import { Historico } from '@/types/historico';
import { Checkbox } from '../ui/checkbox';
import { PlanoContas } from '@/types/plano-contas'; // Importando PlanoContas
import { useContabilConfig } from '@/hooks/use-contabil-config'; // Importando useContabilConfig

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
  
  // Campos de Histórico
  historico_id: z.string().uuid('Selecione um histórico válido.').nullable(),
  salvar_como_padrao: z.boolean().optional(),
  
  // NOVO CAMPO: Conta de Resultado (Despesa/Custo)
  conta_resultado_id: z.string().uuid('Selecione a conta de resultado.').nullable(),
});

type FormValues = z.infer<typeof formSchema>;

interface RegistrarPagamentoCPDialogProps {
  parcela: ParcelaParaPagamento | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaveComplete: () => void;
}

const RegistrarPagamentoCPDialog: React.FC<RegistrarPagamentoCPDialogProps> = ({ parcela, open, onOpenChange, onSaveComplete }) => {
  const { role, usuario } = useSessao();
  const { configMap } = useContabilConfig();
  const isAdmin = role === 'Admin';
  
  const [historicos, setHistoricos] = useState<Historico[]>([]);
  const [loadingHistoricos, setLoadingHistoricos] = useState(true);
  const [contasDespesa, setContasDespesa] = useState<PlanoContas[]>([]); // NOVO ESTADO
  const [loadingContasDespesa, setLoadingContasDespesa] = useState(true); // NOVO ESTADO
  
  const [mapeamentoContabil, setMapeamentoContabil] = useState<Record<string, string | null>>({});
  const [isInitialized, setIsInitialized] = useState(false);
  
  const tabelaPagamentos = 'admin_pagamentos';
  const tabelaParcelas = 'admin_parcelas_pagar';
  const tabelaContasPagar = 'admin_contas_pagar';
  
  const adminId = usuario?.id;

  const { contas: contasOrigem, carregando: loadingContas, refetch: refetchSaldos } = useSaldoContaCalculado('todos', 'todos', '', 'bancos');

  const saldoDevedor = parcela ? parcela.valor_parcela - (parcela.valor_pago || 0) : 0;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      data_pagamento: new Date(),
      forma_pagamento: 'Pix',
      pagamentos: [],
      historico_id: null,
      salvar_como_padrao: false,
      conta_resultado_id: null, // NOVO DEFAULT
    },
  });
  
  const { control, watch } = form;
  const { fields, append, remove } = useFieldArray({
    control,
    name: "pagamentos",
  });

  const pagamentosArray = watch('pagamentos');
  const totalPago = pagamentosArray.reduce((sum, p) => sum + (Number(p.valor_pago) || 0), 0);
  const restante = saldoDevedor - totalPago;

  const fetchMapeamentoContabil = useCallback(async () => {
    if (!isAdmin || !adminId) return;
    
    const { data, error } = await supabase
        .from('configuracao_contas_pagar')
        .select('tipo_registro, conta_contabil_id')
        .eq('proprietario_id', adminId);
        
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
  }, [isAdmin, adminId]);
  
  const fetchHistoricos = useCallback(async () => {
    if (!adminId) return;
    setLoadingHistoricos(true);
    const { data, error } = await supabase
        .from('historicos')
        .select('id, descricao, codigo')
        .eq('proprietario_id', adminId)
        .order('descricao');
        
    if (error) {
        console.error('Erro ao carregar históricos:', error);
        setHistoricos([]);
    } else {
        setHistoricos(data as Historico[]);
    }
    setLoadingHistoricos(false);
  }, [adminId]);
  
  const fetchContasDespesa = useCallback(async () => {
    if (!adminId) return;
    setLoadingContasDespesa(true);
    
    const custoCode = configMap.Custo || '5';
    const despesaCode = configMap.Despesa || '6';
    
    const { data, error } = await supabase
        .from('plano_contas')
        .select('id, Conta, Descricao')
        .eq('proprietario_id', adminId)
        .eq('Analitica', 'Sim')
        .eq('is_conta_resultado', true)
        .or(`Conta.like.${custoCode}.%,Conta.like.${despesaCode}.%`)
        .order('Conta');
        
    if (error) {
        showError('Erro ao carregar contas de despesa/custo: ' + error.message);
        setContasDespesa([]);
    } else {
        setContasDespesa(data as PlanoContas[]);
    }
    setLoadingContasDespesa(false);
  }, [adminId, configMap.Custo, configMap.Despesa]);
  
  const fetchConfigAndDefaults = useCallback(async () => {
    if (!isAdmin || !adminId) return;
    
    // 1. Buscar Histórico Padrão
    const { data: historicoData } = await supabase
        .from('configuracao_historico_padrao')
        .select('historico_id')
        .eq('proprietario_id', adminId)
        .eq('tipo_registro', 'pagamento_padrao')
        .limit(1)
        .single();
        
    // 2. Buscar Conta de Resultado Padrão
    const { data: resultadoData } = await supabase
        .from('configuracao_contas_pagar')
        .select('conta_contabil_id')
        .eq('proprietario_id', adminId)
        .eq('tipo_registro', 'pagamento')
        .limit(1)
        .single();
        
    const defaultHistoricoId = historicoData?.historico_id || null;
    const defaultResultadoId = resultadoData?.conta_contabil_id || null;
    
    form.setValue('historico_id', defaultHistoricoId);
    form.setValue('conta_resultado_id', defaultResultadoId);
  }, [isAdmin, adminId, form]);

  useEffect(() => {
      if (open) {
          setIsInitialized(false);
          refetchSaldos();
          fetchHistoricos();
          fetchContasDespesa();
          if (isAdmin) {
              fetchMapeamentoContabil();
              fetchConfigAndDefaults();
          }
      }
  }, [open, isAdmin, refetchSaldos, fetchMapeamentoContabil, fetchHistoricos, fetchContasDespesa, fetchConfigAndDefaults]);

  useEffect(() => {
    if (open && !loadingContas && !isInitialized) {
        form.reset({
            data_pagamento: new Date(),
            forma_pagamento: 'Pix',
            pagamentos: contasOrigem.length > 0 
                ? [{ conta_id: contasOrigem[0].id, valor_pago: saldoDevedor }]
                : [],
            historico_id: form.getValues('historico_id'), // Mantém o valor padrão carregado
            salvar_como_padrao: false,
            conta_resultado_id: form.getValues('conta_resultado_id'), // Mantém o valor padrão carregado
        });
        setIsInitialized(true);
    }
  }, [open, loadingContas, contasOrigem, saldoDevedor, isInitialized, form]);

  const onSubmit = async (values: FormValues) => {
    if (!parcela || !adminId || !values.conta_resultado_id) {
        showError('Dados da parcela, administrador ou conta de resultado estão incompletos.');
        return;
    }
    
    if (Math.abs(restante) > 0.01) {
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

    const contaPagamento = mapeamentoContabil['pagamento'];
    const contaParcelaPagar = mapeamentoContabil['parcela_pagar'];
    
    // 0. Buscar a Conta Patrimonial da Conta Sintética (para o lançamento de estorno)
    const { data: contaSintetica, error: csError } = await supabase
        .from(tabelaContasPagar)
        .select('id_conta_patrimonial, descricao') // RENOMEADO
        .eq('id', parcela.conta_pagar_id)
        .single();
        
    if (csError) {
        showError('Erro ao buscar conta sintética para Balanço: ' + csError.message);
        return;
    }
    const contaPatrimonial = contaSintetica?.id_conta_patrimonial;
    const descricaoContaSintetica = contaSintetica?.descricao || 'Pagamento';
    
    // CORREÇÃO DE FUSO HORÁRIO
    const dataPagamento = values.data_pagamento;
    const dataNoonUTC = new Date(Date.UTC(dataPagamento.getFullYear(), dataPagamento.getMonth(), dataPagamento.getDate(), 12, 0, 0));
    const dataPagamentoISO = dataNoonUTC.toISOString();

    try {
      for (const pagamento of values.pagamentos) {
        // 1. Registrar Pagamento (Histórico)
        const pagamentoPayload = { 
            parcela_id: parcela.id, 
            admin_id: adminId, 
            valor_pago: pagamento.valor_pago, 
            conta_id: pagamento.conta_id,
            id_conta_contabil: contaPagamento, // Conta de Ativo/Passivo (Pagamento)
            data_pagamento: dataPagamentoISO,
            forma_pagamento: values.forma_pagamento,
            tipo_pagamento: 'total',
            historico_id: values.historico_id,
            id_conta_resultado: values.conta_resultado_id, // NOVO CAMPO
        };
        
        const { error: pagamentoError } = await supabase.from(tabelaPagamentos).insert(pagamentoPayload);
        if (pagamentoError) throw pagamentoError;
        
        // 2. Registrar o Lançamento na conta de Saldo (Movimentação de Caixa/Banco) - CRÉDITO (Ativo)
        const lancamentoAtivoPayload = {
            proprietario_id: adminId,
            data_movimentacao: dataPagamentoISO,
            descricao: `Pagamento Parcela ${parcela.id} - ${parcela.fornecedor}`, 
            valor: pagamento.valor_pago,
            tipo: 'Saida' as const, // Saída do Ativo
            conta_bancaria_id: pagamento.conta_id,
            conta_contabil_id: contaPagamento, // Conta de Ativo/Passivo (Pagamento)
            origem: 'pagamento_manual',
            historico_id: values.historico_id,
        };
        
        const { error: lancamentoAtivoError } = await supabase.from('lancamentos').insert(lancamentoAtivoPayload);
        if (lancamentoAtivoError) throw lancamentoAtivoError;
        
        // 3. Registrar o Lançamento na conta de Resultado (DRE) - DÉBITO (Despesa)
        const lancamentoDespesaPayload = {
            proprietario_id: adminId,
            data_movimentacao: dataPagamentoISO,
            descricao: `Despesa/Custo: ${descricaoContaSintetica}`,
            valor: pagamento.valor_pago,
            tipo: 'Saida' as const, // Saída na Despesa (aumenta o saldo da conta 4.x.x/5.x.x)
            conta_bancaria_id: null,
            conta_contabil_id: values.conta_resultado_id, // Conta de Despesa/Custo (4.x.x/5.x.x)
            historico_id: values.historico_id,
        };
        
        const { error: lancamentoDespesaError } = await supabase.from('lancamentos').insert(lancamentoDespesaPayload);
        if (lancamentoDespesaError) throw lancamentoDespesaError;
        
        // 4. Lançamento de Estorno da Conta Patrimonial (CP) - DÉBITO (Ativo)
        if (contaPatrimonial) {
            const lancamentoPatrimonialPayload = {
                proprietario_id: adminId,
                data_movimentacao: dataPagamentoISO,
                descricao: `Estorno Patrimonial CP: ${descricaoContaSintetica}`,
                valor: pagamento.valor_pago,
                tipo: 'Entrada' as const, // Entrada no Passivo (diminui o saldo da conta 2.x.x)
                conta_bancaria_id: null,
                conta_contabil_id: contaPatrimonial, // Conta Patrimonial (2.x.x)
                historico_id: values.historico_id,
            };
            await supabase.from('lancamentos').insert(lancamentoPatrimonialPayload);
        } else {
            console.warn('Aviso: Conta Patrimonial não mapeada na conta sintética. Balanço pode estar incompleto.');
        }
      }

      // 5. Atualizar a parcela para 'paga'
      await supabase.from(tabelaParcelas).update({
        status: 'paga',
        valor_pago: (parcela.valor_pago || 0) + totalPago,
        data_pagamento: format(dataPagamento, 'yyyy-MM-dd'),
        id_conta_contabil: contaParcelaPagar,
      }).eq('id', parcela.id);
      
      // 6. Verificar se a conta sintética está quitada
      const { count: parcelasPendentesCount, error: countError } = await supabase
          .from(tabelaParcelas)
          .select('id', { count: 'exact', head: true })
          .eq('conta_pagar_id', parcela.conta_pagar_id)
          .in('status', ['aberta', 'parcial', 'reprogramada']);
          
      if (countError) {
          console.error('Erro ao contar parcelas pendentes:', countError);
      } else if (parcelasPendentesCount === 0) {
          const { error: updateContaError } = await supabase
              .from(tabelaContasPagar)
              .update({ status: 'pago' })
              .eq('id', parcela.conta_pagar_id);
              
          if (updateContaError) {
                  console.error('Erro ao atualizar conta sintética para pago:', updateContaError);
              }
          }
      
      // 7. Salvar Histórico Padrão (se marcado)
      if (isAdmin && values.salvar_como_padrao && values.historico_id) {
          await supabase.from('configuracao_historico_padrao').upsert({
              proprietario_id: adminId,
              tipo_registro: 'pagamento_padrao',
              historico_id: values.historico_id,
          }, { onConflict: 'proprietario_id, tipo_registro' });
      }

      showSuccess('Pagamento registrado com sucesso!');
      onSaveComplete();
    } catch (error: any) {
      showError(`Falha ao registrar pagamento: ${error.message}`);
    }
  };

  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Registrar Pagamento</DialogTitle>
          <DialogDescription>Saldo devedor da parcela: {formatCurrency(saldoDevedor)}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="data_pagamento" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>Data do Pagamento</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "dd/MM/yy") : <span>Data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="forma_pagamento" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>Forma de Pagamento</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
            </div>
            
            <Separator />
            
            <div className="space-y-4">
                <FormLabel>Fontes de Pagamento (Ativo)</FormLabel>
                {fields.map((item, index) => (
                    <div key={item.id} className="flex items-end space-x-2 p-2 border rounded-md">
                        <FormField
                            control={control}
                            name={`pagamentos.${index}.conta_id`}
                            render={({ field }) => (
                                <FormItem className="flex-1">
                                    <Select onValueChange={field.onChange} value={field.value || undefined} disabled={loadingContas}>
                                        <FormControl><SelectTrigger><SelectValue placeholder="Selecione a conta" /></SelectTrigger></FormControl>
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
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => append({ conta_id: '', valor_pago: 0 })}>
                    <PlusCircle className="w-4 h-4 mr-2" /> Adicionar Fonte de Pagamento
                </Button>
            </div>
            
            <Separator />
            
            {/* NOVO CAMPO: Conta de Resultado (Despesa/Custo) */}
            <FormField
                control={form.control}
                name="conta_resultado_id"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Conta de Resultado (Despesa/Custo)</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || undefined} disabled={loadingContasDespesa}>
                            <FormControl>
                                <SelectTrigger>
                                    <SelectValue placeholder={loadingContasDespesa ? "Carregando Contas..." : `Selecione a conta de Despesa/Custo (${configMap.Custo}.x.x ou ${configMap.Despesa}.x.x)`} />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                <SelectItem value={null as any}>Nenhum (Não Mapear)</SelectItem>
                                {contasDespesa.map(c => (
                                    <SelectItem key={c.id} value={c.id}>
                                        {c.Conta} - {c.Descricao}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <FormMessage />
                        {contasDespesa.length === 0 && !loadingContasDespesa && (
                            <p className="text-sm text-red-500">
                                Nenhuma conta de Despesa/Custo ({configMap.Custo}.x.x ou {configMap.Despesa}.x.x) marcada como "Conta de Resultado".
                            </p>
                        )}
                    </FormItem>
                )}
            />
            
            {/* Histórico */}
            {isAdmin && (
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
            
            <div className="p-4 bg-secondary rounded-md space-y-2 text-sm">
                <div className="flex justify-between font-medium"><p>Total Informado:</p><p>{formatCurrency(totalPago)}</p></div>
                <Separator />
                <div className={cn("flex justify-between font-bold text-lg", Math.abs(restante) > 0.01 ? 'text-red-600' : 'text-green-600')}>
                    <p>Restante a Pagar:</p>
                    <p>{formatCurrency(restante)}</p>
                </div>
            </div>

            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting || Math.abs(restante) > 0.01}>
              <Loader2 className={cn("mr-2 h-4 w-4 animate-spin", !form.formState.isSubmitting && "hidden")} />
              Confirmar Pagamento
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default RegistrarPagamentoCPDialog;