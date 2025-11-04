import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { PlanoContas } from '@/types/plano-contas';
import { Checkbox } from './ui/checkbox';
import { cn } from '@/lib/utils';

const formSchema = z.object({
  Conta: z.string().min(1, 'O código é obrigatório.'),
  codigo_reduzido: z.string().optional().or(z.literal('')),
  Descricao: z.string().min(1, 'A descrição é obrigatória.'),
  Analitica: z.enum(['Sim', 'Não'], {
    required_error: 'O tipo é obrigatório.',
  }),
  is_conta_saldo: z.boolean().optional(), // NOVO CAMPO
});

type FormValues = z.infer<typeof formSchema>;

interface FormPlanoContasProps {
  proprietarioId: string;
  contaInicial?: PlanoContas | null;
  onSaveComplete: () => void;
}

const FormPlanoContas: React.FC<FormPlanoContasProps> = ({ proprietarioId, contaInicial, onSaveComplete }) => {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      Conta: contaInicial?.Conta || '',
      codigo_reduzido: contaInicial?.codigo_reduzido || '',
      Descricao: contaInicial?.Descricao || '',
      Analitica: contaInicial?.Analitica || 'Não',
      is_conta_saldo: contaInicial?.is_conta_saldo || false, // Valor inicial
    },
  });
  
  const isAnalitica = form.watch('Analitica') === 'Sim';

  const onSubmit = async (values: FormValues) => {
    const dataToSave = {
      proprietario_id: proprietarioId,
      Conta: values.Conta,
      codigo_reduzido: values.codigo_reduzido || null,
      Descricao: values.Descricao,
      Analitica: values.Analitica,
      is_conta_saldo: values.Analitica === 'Sim' ? values.is_conta_saldo : false, // Só permite se for Analítica
    };

    let error = null;

    if (contaInicial) {
      // Atualizar
      const result = await supabase
        .from('plano_contas')
        .update(dataToSave)
        .eq('id', contaInicial.id);
      error = result.error;
    } else {
      // Inserir
      const result = await supabase
        .from('plano_contas')
        .insert(dataToSave);
      error = result.error;
    }

    if (error) {
      showError(`Falha ao salvar conta: ${error.message}`);
    } else {
      showSuccess(`Conta salva com sucesso!`);
      onSaveComplete();
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="Conta"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Código da Conta (Ex: 1.0.1.01.0101)</FormLabel>
              <FormControl>
                <Input placeholder="Ex: 1.0.1.01.0101" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="codigo_reduzido"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Código Reduzido (Opcional)</FormLabel>
              <FormControl>
                <Input placeholder="Ex: 1010101" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="Descricao"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descrição</FormLabel>
              <FormControl>
                <Input placeholder="Ex: Caixa Matriz" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="Analitica"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Analítica (Permite Lançamentos)</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Sim">Sim</SelectItem>
                  <SelectItem value="Não">Não</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        
        {/* NOVO CAMPO: IS CONTA SALDO */}
        <FormField
            control={form.control}
            name="is_conta_saldo"
            render={({ field }) => (
                <FormItem className={cn("flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 transition-opacity", isAnalitica ? 'opacity-100' : 'opacity-50 pointer-events-none')}>
                    <FormControl>
                        <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={!isAnalitica}
                        />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                        <FormLabel>
                            Usar como Conta de Saldo (Caixa/Banco)
                        </FormLabel>
                        <p className="text-sm text-muted-foreground">
                            Se marcada, esta conta contábil poderá ser vinculada a uma Conta/Caixa em Bancos.
                        </p>
                    </div>
                </FormItem>
            )}
        />
        {/* FIM NOVO CAMPO */}
        
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar Conta
        </Button>
      </form>
    </Form>
  );
};

export default FormPlanoContas;