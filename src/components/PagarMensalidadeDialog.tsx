import React, { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, Loader2, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Plano } from '@/types/plano';

interface ContaPagarPlano {
  id: string;
  data_vencimento: string;
  valor: number;
  fornecedor: string;
}

interface PagarMensalidadeDialogProps {
  contaPagar: ContaPagarPlano | null;
  clienteId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaveComplete: () => void;
}

const formSchema = z.object({
  valor_pago: z.coerce.number().positive('O valor deve ser maior que zero.'),
  data_pagamento: z.date({ required_error: 'A data é obrigatória.' }),
  forma_pagamento: z.string().min(1, 'A forma de pagamento é obrigatória.'),
  novo_plano_id: z.string().uuid('Selecione um plano válido.').optional().or(z.literal('')),
});

type FormValues = z.infer<typeof formSchema>;

const FORMAS_PAGAMENTO = ['Pix', 'Transferência', 'Boleto', 'Cartão Manual'];

const PagarMensalidadeDialog: React.FC<PagarMensalidadeDialogProps> = ({ contaPagar, clienteId, open, onOpenChange, onSaveComplete }) => {
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [loadingPlanos, setLoadingPlanos] = useState(true);
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      valor_pago: contaPagar?.valor || 0,
      data_pagamento: new Date(),
      forma_pagamento: 'Pix',
      novo_plano_id: '',
    },
  });
  
  // Resetar valores quando a conta muda
  useEffect(() => {
      if (contaPagar) {
          form.reset({
              valor_pago: contaPagar.valor,
              data_pagamento: new Date(),
              forma_pagamento: 'Pix',
              novo_plano_id: '',
          });
      }
  }, [contaPagar, form]);

  const fetchPlanos = useCallback(async () => {
    setLoadingPlanos(true);
    const { data, error } = await supabase
      .from('planos')
      .select('*')
      .order('preco_mensal', { ascending: true });

    if (error) {
      showError('Erro ao carregar planos: ' + error.message);
      setPlanos([]);
    } else {
      setPlanos(data as Plano[]);
    }
    setLoadingPlanos(false);
  }, []);

  useEffect(() => {
    if (open) {
        fetchPlanos();
    }
  }, [open, fetchPlanos]);
  
  const planoSelecionadoId = form.watch('novo_plano_id');
  const planoAtual = planos.find(p => p.id === planoSelecionadoId);

  const onSubmit = async (values: FormValues) => {
    if (!contaPagar || !clienteId) return;
    
    // Se nenhum plano novo foi selecionado, usamos o plano atual do cliente (que está no perfil)
    const clienteProfile = (await supabase.from('tbl_clientes').select('plano_id').eq('id', clienteId).single()).data;
    const planoParaRenovacao = values.novo_plano_id || clienteProfile?.plano_id;
    
    if (!planoParaRenovacao) {
        showError('Plano de renovação não encontrado. Tente novamente.');
        return;
    }

    try {
        const { error } = await supabase.rpc('manual_subscription_renewal', {
            p_cliente_id: clienteId,
            p_plano_id: planoParaRenovacao,
            p_conta_pagar_id: contaPagar.id,
            p_valor_pago: values.valor_pago,
            p_forma_pagamento: values.forma_pagamento,
        });

        if (error) throw error;

        showSuccess('Mensalidade paga e assinatura renovada com sucesso!');
        onSaveComplete();
        onOpenChange(false);

    } catch (error: any) {
        console.error('Erro ao renovar assinatura:', error);
        showError(`Falha ao processar pagamento e renovação: ${error.message}`);
    }
  };

  if (!contaPagar || !clienteId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Pagar Mensalidade e Renovar Assinatura</DialogTitle>
          <DialogDescription>
            Pagamento referente à mensalidade de <strong>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(contaPagar.valor)}</strong>, vencimento em {format(parseISO(contaPagar.data_vencimento), 'dd/MM/yyyy')}.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            
            <h3 className="font-semibold text-base pt-2">Detalhes do Pagamento</h3>
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="valor_pago" render={({ field }) => (<FormItem><FormLabel>Valor Recebido</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField control={form.control} name="data_pagamento" render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>Data</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "dd/MM/yy") : <span>Data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem>)} />
            </div>
            
            <FormField control={form.control} name="forma_pagamento" render={({ field }) => (
                <FormItem>
                    <FormLabel>Forma de Pagamento</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                            <SelectTrigger>
                                <SelectValue placeholder="Selecione a forma de pagamento" />
                            </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            {FORMAS_PAGAMENTO.map(f => (
                                <SelectItem key={f} value={f}>{f}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <FormMessage />
                </FormItem>
            )} />
            
            <h3 className="font-semibold text-base pt-4 border-t flex items-center">
                <Package className="w-4 h-4 mr-2" /> Renovar/Trocar Plano (Opcional)
            </h3>
            <FormField control={form.control} name="novo_plano_id" render={({ field }) => (
                <FormItem>
                    <FormLabel>Plano para Próxima Renovação</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={loadingPlanos}>
                        <FormControl>
                            <SelectTrigger>
                                <SelectValue placeholder={loadingPlanos ? "Carregando Planos..." : "Manter Plano Atual"} />
                            </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            <SelectItem value="">Manter Plano Atual</SelectItem>
                            {planos.map(p => (
                                <SelectItem key={p.id} value={p.id}>
                                    {p.nome} ({new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.preco_mensal)}/mês)
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <FormMessage />
                </FormItem>
            )} />
            
            {planoSelecionadoId && planoAtual && (
                <div className="p-3 bg-blue-100 dark:bg-blue-900/20 border border-blue-500 rounded-md text-sm text-blue-600 dark:text-blue-400">
                    A próxima mensalidade será baseada no preço do plano **{planoAtual.nome}** ({new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(planoAtual.preco_mensal)}).
                </div>
            )}

            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar Pagamento e Renovar
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default PagarMensalidadeDialog;