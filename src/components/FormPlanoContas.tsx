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

const formSchema = z.object({
  codigo_conta: z.string().min(1, 'O código é obrigatório.'),
  nome_conta: z.string().min(1, 'O nome é obrigatório.'),
  tipo: z.enum(['Analítica', 'Sintética'], {
    required_error: 'O tipo é obrigatório.',
  }),
});

type FormValues = z.infer<typeof formSchema>;

interface FormPlanoContasProps {
  empresaId: string;
  contaInicial?: PlanoContas | null;
  onSaveComplete: () => void;
}

const FormPlanoContas: React.FC<FormPlanoContasProps> = ({ empresaId, contaInicial, onSaveComplete }) => {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      codigo_conta: contaInicial?.codigo_conta || '',
      nome_conta: contaInicial?.nome_conta || '',
      tipo: contaInicial?.tipo || 'Analítica',
    },
  });

  const onSubmit = async (values: FormValues) => {
    const dataToSave = {
      empresa_id: empresaId,
      codigo_conta: values.codigo_conta,
      nome_conta: values.nome_conta,
      tipo: values.tipo,
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
          name="codigo_conta"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Código da Conta</FormLabel>
              <FormControl>
                <Input placeholder="Ex: 1.0.1.01.0101" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="nome_conta"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome da Conta</FormLabel>
              <FormControl>
                <Input placeholder="Ex: Caixa Matriz" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="tipo"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tipo</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Analítica">Analítica (Lançamentos)</SelectItem>
                  <SelectItem value="Sintética">Sintética (Agrupamento)</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar Conta
        </Button>
      </form>
    </Form>
  );
};

export default FormPlanoContas;