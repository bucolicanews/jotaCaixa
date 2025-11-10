import React, { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2, Settings } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';

const formSchema = z.object({
  mascara_codigo: z.string().min(5, 'A máscara é obrigatória.').regex(/^[0\.]+$/, 'A máscara deve conter apenas zeros (0) e pontos (.). Ex: 0.0.00.0000'),
});

type FormValues = z.infer<typeof formSchema>;

interface FormConfiguracaoPlanoContasProps {
  proprietarioId: string;
}

const FormConfiguracaoPlanoContas: React.FC<FormConfiguracaoPlanoContasProps> = ({ proprietarioId }) => {
  const [loadingData, setLoadingData] = useState(true);
  const [existingId, setExistingId] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      mascara_codigo: '0.0.00.0000',
    },
  });

  const fetchConfig = useCallback(async () => {
    setLoadingData(true);
    
    const { data, error } = await supabase
      .from('configuracao_plano_contas')
      .select('id, mascara_codigo')
      .eq('proprietario_id', proprietarioId)
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      showError('Erro ao carregar configuração do Plano de Contas: ' + error.message);
    } else if (data) {
      setExistingId(data.id);
      form.reset({ mascara_codigo: data.mascara_codigo });
    }
    setLoadingData(false);
  }, [proprietarioId, form]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const onSubmit = async (values: FormValues) => {
    setLoadingData(true);
    
    const dataToSave = {
      proprietario_id: proprietarioId,
      mascara_codigo: values.mascara_codigo,
    };

    try {
      let error = null;
      
      if (existingId) {
        const { error: updateError } = await supabase
          .from('configuracao_plano_contas')
          .update(dataToSave)
          .eq('id', existingId);
        error = updateError;
      } else {
        const { error: insertError } = await supabase
          .from('configuracao_plano_contas')
          .insert(dataToSave);
        error = insertError;
      }

      if (error) throw error;

      showSuccess('Máscara do Plano de Contas salva com sucesso!');
      fetchConfig();
    } catch (error: any) {
      showError(`Falha ao salvar configuração: ${error.message}`);
    } finally {
      setLoadingData(false);
    }
  };

  if (loadingData) {
    return <div className="flex justify-center items-center h-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <h3 className="font-semibold flex items-center"><Settings className="w-4 h-4 mr-2" /> Máscara de Código Contábil</h3>
        <p className="text-sm text-muted-foreground">
            Defina o formato que as contas analíticas devem seguir. Use '0' para dígitos e '.' para separadores.
        </p>
        <FormField
          control={form.control}
          name="mascara_codigo"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Máscara (Ex: 0.0.00.0000)</FormLabel>
              <FormControl>
                <Input placeholder="0.0.00.0000" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar Máscara
        </Button>
      </form>
    </Form>
  );
};

export default FormConfiguracaoPlanoContas;