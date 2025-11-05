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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { AdminParcelaPagar } from '@/types/contas-pagar';
import useSaldoContaCalculado from '@/hooks/use-saldo-conta-calculado';
import { Separator } from './ui/separator';

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
  const isAdmin = role === 'Admin';
  
  const [mapeamentoContabil, setMapeamentoContabil] = useState<Record<string, string | null>>({});
  const [isInitialized, setIsInitialized] = useState(false); // State to prevent re-initialization loop
  
  const tabelaPagamentos = 'admin_pagamentos';
  const tabelaParcelas = 'admin_parcelas_pagar';
  
  const adminId = usuario?.id;

  const { contas: contasOrigem, carregando: loadingContas, refetch: refetchSaldos } = useSaldoContaCalculado('todos', 'todos', '');

  const saldoDevedor = parcela ? parcela.valor_parcela - (parcela.valor_pago || 0) : 0;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      data_pagamento: new Date(),
      forma_pagamento: 'Pix',
      pagamentos: [],
    },
  });
  
  const { control, watch } = form;
  const { fields, append, remove } = useFieldArray({
    control,
    name: "pagamentos",
  });

  const pagamentosArray = watch('pagamentos');
  const totalPago = pagamentosArray.reduce((sum, p) => sum + (p.valor_pago || 0), 0);
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
  
  // Effect to fetch data and reset initialization state when dialog opens
  useEffect(() => {
      if (open) {
          setIsInitialized(false); // Reset initialization on open
          refetchSaldos();
          if (isAdmin) {
              fetchMapeamentoContabil();
          }
      }
  }, [open, isAdmin, refetchSaldos, fetchMapeamentoContabil]);

  // Effect to initialize the form once data is loaded
  useEffect(() => {
    if (open && !loadingContas && !isInitialized) {
        form.reset({
            data_pagamento: new Date(),
            forma_pagamento: 'Pix',
            pagamentos: contasOrigem.length > 0 
                ? [{ conta_id: contasOrigem[0].id, valor_pago: saldoDevedor }]
                : []
        });
        setIsInitialized(true); // Mark as initialized
    }
  }, [open, loadingContas, contasOrigem, saldoDevedor, isInitialized, form]);

  const onSubmit = async (values: FormValues) => {
    if (!parcela || !adminId) {
        showError('Dados da parcela ou do administrador estão incompletos.');
        return;
    }
    
    if (Math.abs(restante) > 0.01) {
        showError('O valor total pago deve ser igual ao saldo devedor da parcela.');
        return;
    }

    // --- VERIFICAÇÃO DE SALDO PARA CADA PAGAMENTO ---
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
    // --- FIM DA VERIFICAÇÃO ---

    const contaPagamento = mapeamentoContabil['pagamento'];
    const contaParcelaPagar = mapeamentoContabil['parcela_pagar'];

    try {
      // 1. Registrar cada pagamento e lançamento
      for (const pagamento of values.pagamentos) {
        const pagamentoPayload = { 
            parcela_id: parcela.id, 
            admin_id: adminId, 
            valor_pago: pagamento.valor_pago, 
            conta_id: pagamento.conta_id,
            id_conta_contabil: contaPagamento,
            data_pagamento: values.data_pagamento.toISOString(),
            forma_pagamento: values.forma_pagamento,
            tipo_pagamento: 'total', // Assumindo que o total das partes quita a parcela
        };
        
        const { error: pagamentoError } = await supabase.from(tabelaPagamentos).insert(pagamentoPayload);
        if (pagamentoError) throw pagamentoError;
        
        const lancamentoPayload = {
            empresa_id: adminId,
            data_movimentacao: values.data_pagamento.toISOString(),
            descricao: `Pagamento Parcela ${parcela.id} - ${parcela.fornecedor}`,
            valor: pagamento.valor_pago,
            tipo: 'Saida' as const,
            conta_bancaria_id: pagamento.conta_id,
            conta_contabil_id: contaPagamento,
        };
        
        const { error: lancamentoError } = await supabase.from('lancamentos').insert(lancamentoPayload);
        if (lancamentoError) throw lancamentoError;
      }

      // 2. Atualizar a parcela para 'paga'
      await supabase.from(tabelaParcelas).update({
        status: 'paga',
        valor_pago: (parcela.valor_pago || 0) + totalPago,
        data_pagamento: format(values.data_pagamento, 'yyyy-MM-dd'),
        id_conta_contabil: contaParcelaPagar,
      }).eq('id', parcela.id);

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
          <DialogTitle>Registrar Pagamento (Múltiplas Contas)</DialogTitle>
          <DialogDescription>Saldo devedor da parcela: {formatCurrency(saldoDevedor)}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="data_pagamento" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>Data do Pagamento</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "dd/MM/yy") : <span>Data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="forma_pagamento" render={({ field }) => (<FormItem><FormLabel>Forma de Pagamento</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
            </div>
            
            <Separator />
            
            <div className="space-y-4">
                <FormLabel>Fontes de Pagamento</FormLabel>
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
            
            <div className="p-4 bg-secondary rounded-md space-y-2 text-sm">
                <div className="flex justify-between font-medium"><p>Total a Pagar:</p><p>{formatCurrency(saldoDevedor)}</p></div>
                <div className="flex justify-between font-medium"><p>Total Informado:</p><p>{formatCurrency(totalPago)}</p></div>
                <Separator />
                <div className={cn("flex justify-between font-bold text-lg", restante === 0 ? 'text-green-600' : 'text-red-600')}>
                    <p>Restante:</p>
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