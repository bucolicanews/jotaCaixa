import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, addDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

interface ParcelaParaPagamento {
  id: string;
  conta_receber_id: string;
  empresa_id: string;
  valor_parcela: number;
  valor_pago: number;
}

const formSchema = z.object({
  valor_recebido: z.coerce.number().positive('O valor deve ser maior que zero.'),
  data_pagamento: z.date({ required_error: 'A data é obrigatória.' }),
  forma_pagamento: z.string().min(1, 'A forma de pagamento é obrigatória.'),
  acao_saldo_restante: z.enum(['desconto', 'reprogramar', 'parcelar']).optional(),
  nova_data_vencimento: z.date().optional(),
  numero_novas_parcelas: z.coerce.number().int().min(2).optional(),
  intervalo_dias_novas_parcelas: z.coerce.number().int().min(1).optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface RegistrarPagamentoDialogProps {
  parcela: ParcelaParaPagamento | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaveComplete: () => void;
}

const RegistrarPagamentoDialog: React.FC<RegistrarPagamentoDialogProps> = ({ parcela, open, onOpenChange, onSaveComplete }) => {
  const saldoDevedor = parcela ? parcela.valor_parcela - parcela.valor_pago : 0;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      valor_recebido: saldoDevedor,
      data_pagamento: new Date(),
      forma_pagamento: 'Pix',
      acao_saldo_restante: 'reprogramar',
      numero_novas_parcelas: 2,
      intervalo_dias_novas_parcelas: 30,
    },
  });

  const valorRecebido = form.watch('valor_recebido');
  const acaoSaldoRestante = form.watch('acao_saldo_restante');
  const isPagamentoParcial = valorRecebido > 0 && valorRecebido < saldoDevedor;
  const saldoRestante = saldoDevedor - valorRecebido;

  const onSubmit = async (values: FormValues) => {
    if (!parcela) return;

    try {
      // 1. Registrar o recebimento
      await supabase.from('recebimentos').insert({
        parcela_id: parcela.id,
        empresa_id: parcela.empresa_id,
        valor_recebido: values.valor_recebido,
        data_recebimento: values.data_pagamento.toISOString(),
        forma_pagamento: values.forma_pagamento,
        tipo_recebimento: isPagamentoParcial ? 'parcial' : 'total',
      });

      // 2. Lidar com a parcela original e o saldo restante
      if (!isPagamentoParcial) { // Pagamento Total
        await supabase.from('parcelas_contas_receber').update({ status: 'paga', valor_pago: parcela.valor_parcela, data_pagamento: values.data_pagamento.toISOString() }).eq('id', parcela.id);
      } else { // Pagamento Parcial
        if (values.acao_saldo_restante === 'desconto') {
          await supabase.from('parcelas_contas_receber').update({ status: 'paga', valor_pago: parcela.valor_parcela, observacao: `Recebido R$ ${values.valor_recebido.toFixed(2)} com R$ ${saldoRestante.toFixed(2)} de desconto.` }).eq('id', parcela.id);
        } else if (values.acao_saldo_restante === 'reprogramar') {
          await supabase.from('parcelas_contas_receber').update({ status: 'paga', valor_pago: parcela.valor_parcela, observacao: `Recebido R$ ${values.valor_recebido.toFixed(2)}. Saldo de R$ ${saldoRestante.toFixed(2)} reprogramado.` }).eq('id', parcela.id);
          await supabase.from('parcelas_contas_receber').insert({ conta_receber_id: parcela.conta_receber_id, empresa_id: parcela.empresa_id, numero_parcela: 99, valor_parcela: saldoRestante, data_vencimento: format(values.nova_data_vencimento!, 'yyyy-MM-dd'), status: 'reprogramada' });
        } else if (values.acao_saldo_restante === 'parcelar') {
          await supabase.from('parcelas_contas_receber').update({ status: 'paga', valor_pago: parcela.valor_parcela, observacao: `Recebido R$ ${values.valor_recebido.toFixed(2)}. Saldo de R$ ${saldoRestante.toFixed(2)} parcelado.` }).eq('id', parcela.id);
          const valorNovaParcela = saldoRestante / values.numero_novas_parcelas!;
          const novasParcelas = Array.from({ length: values.numero_novas_parcelas! }).map((_, i) => ({
            conta_receber_id: parcela.conta_receber_id,
            empresa_id: parcela.empresa_id,
            numero_parcela: 100 + i, // Usar números altos para indicar que são subparcelas
            valor_parcela: valorNovaParcela,
            data_vencimento: format(addDays(values.nova_data_vencimento!, i * values.intervalo_dias_novas_parcelas!), 'yyyy-MM-dd'),
            status: 'reprogramada',
          }));
          await supabase.from('parcelas_contas_receber').insert(novasParcelas);
        }
      }
      showSuccess('Pagamento registrado com sucesso!');
      onSaveComplete();
    } catch (error: any) {
      showError(`Falha ao registrar pagamento: ${error.message}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar Pagamento</DialogTitle>
          <DialogDescription>Saldo devedor da parcela: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(saldoDevedor)}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="valor_recebido" render={({ field }) => (<FormItem><FormLabel>Valor Recebido</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="data_pagamento" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>Data</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "dd/MM/yy") : <span>Data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem>)} />
            </div>
            <FormField control={form.control} name="forma_pagamento" render={({ field }) => (<FormItem><FormLabel>Forma de Pagamento</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
            
            {isPagamentoParcial && (
              <div className="space-y-4 pt-4 border-t">
                <h3 className="font-semibold text-destructive">Saldo restante: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(saldoRestante)}</h3>
                <FormField control={form.control} name="acao_saldo_restante" render={({ field }) => (
                  <FormItem><FormLabel>O que fazer com o saldo restante?</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="space-y-2"><FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="desconto" /></FormControl><FormLabel className="font-normal">Conceder Desconto (Perdoar)</FormLabel></FormItem><FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="reprogramar" /></FormControl><FormLabel className="font-normal">Reprogramar Saldo</FormLabel></FormItem><FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="parcelar" /></FormControl><FormLabel className="font-normal">Parcelar Saldo</FormLabel></FormItem></RadioGroup></FormControl></FormItem>
                )} />
                {acaoSaldoRestante === 'reprogramar' && <FormField control={form.control} name="nova_data_vencimento" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>Nova Data de Vencimento</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "PPP") : <span>Escolha a data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem>)} />}
                {acaoSaldoRestante === 'parcelar' && (
                  <div className="grid grid-cols-3 gap-4 items-end">
                    <FormField control={form.control} name="numero_novas_parcelas" render={({ field }) => (<FormItem><FormLabel>Nº Parcelas</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="intervalo_dias_novas_parcelas" render={({ field }) => (<FormItem><FormLabel>Intervalo</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="nova_data_vencimento" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>1º Venc.</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "dd/MM/yy") : <span>Data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem>)} />
                  </div>
                )}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}><Loader2 className={cn("mr-2 h-4 w-4 animate-spin", !form.formState.isSubmitting && "hidden")} />Confirmar Recebimento</Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default RegistrarPagamentoDialog;