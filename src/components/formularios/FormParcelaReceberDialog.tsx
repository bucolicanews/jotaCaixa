import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { Parcela } from '@/types/contas-receber';

const formSchema = z.object({
  valor_parcela: z.coerce.number().positive('O valor deve ser maior que zero.'),
  data_vencimento: z.date({ required_error: 'A data é obrigatória.' }),
});

type FormValues = z.infer<typeof formSchema>;

interface FormParcelaReceberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parcelaInicial: Parcela;
  onSaveComplete: () => void;
  tabelaParcelas: string;
}

const FormParcelaReceberDialog: React.FC<FormParcelaReceberDialogProps> = ({ open, onOpenChange, parcelaInicial, onSaveComplete, tabelaParcelas }) => {
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      valor_parcela: parcelaInicial.valor_parcela,
      data_vencimento: parseISO(parcelaInicial.data_vencimento + 'T00:00:00'),
    },
  });

  const onSubmit = async (values: FormValues) => {
    if (parcelaInicial.status === 'paga' || parcelaInicial.status === 'cancelada' || parcelaInicial.status === 'bloqueada') {
        showError('Não é possível editar parcelas pagas, canceladas ou bloqueadas.');
        return;
    }
    
    const dataToSave = {
      valor_parcela: values.valor_parcela,
      data_vencimento: format(values.data_vencimento, 'yyyy-MM-dd'),
      updated_at: new Date().toISOString(),
    };

    try {
      const { error } = await supabase
        .from(tabelaParcelas)
        .update(dataToSave)
        .eq('id', parcelaInicial.id);

      if (error) throw error;

      showSuccess('Parcela atualizada com sucesso!');
      onSaveComplete();
      onOpenChange(false);
    } catch (error: any) {
      showError(`Falha ao salvar parcela: ${error.message}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Editar Parcela Nº {parcelaInicial.numero_parcela}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="valor_parcela" render={({ field }) => (
              <FormItem>
                <FormLabel>Valor da Parcela</FormLabel>
                <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            
            <FormField control={form.control} name="data_vencimento" render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Data de Vencimento</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                        {field.value ? format(field.value, "PPP", { locale: ptBR }) : <span>Escolha a data</span>}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus locale={ptBR} />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )} />
            
            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar Parcela
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default FormParcelaReceberDialog;