import React, { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useSessao } from '@/hooks/use-sessao';

const formSchema = z.object({
  stripe_publishable_key: z.string().min(1, 'A chave publicável é obrigatória.'),
  stripe_secret_key: z.string().min(1, 'A chave secreta é obrigatória.'),
});

type FormValues = z.infer<typeof formSchema>;

const FormConfiguracoesStripe: React.FC = () => {
  const { role, carregando: carregandoSessao } = useSessao();
  const [loadingData, setLoadingData] = useState(true);
  const isAdmin = role === 'Admin';

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      stripe_publishable_key: '',
      stripe_secret_key: '',
    },
  });

  const fetchConfig = useCallback(async () => {
    if (!isAdmin) {
      setLoadingData(false);
      return;
    }
    
    setLoadingData(true);
    
    // Busca a configuração global (empresa_id IS NULL)
    const { data, error } = await supabase
      .from('configuracoes_stripe')
      .select('id, stripe_publishable_key, stripe_secret_key')
      .is('empresa_id', null)
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = No rows found
      showError('Erro ao carregar configurações do Stripe: ' + error.message);
    } else if (data) {
      form.reset({
        stripe_publishable_key: data.stripe_publishable_key || '',
        stripe_secret_key: data.stripe_secret_key || '',
      });
    }
    setLoadingData(false);
  }, [isAdmin, form]);

  useEffect(() => {
    if (!carregandoSessao) {
      fetchConfig();
    }
  }, [carregandoSessao, fetchConfig]);

  const onSubmit = async (values: FormValues) => {
    if (!isAdmin) {
      showError('Apenas administradores podem salvar esta configuração.');
      return;
    }
    
    const dataToSave = {
      stripe_publishable_key: values.stripe_publishable_key,
      stripe_secret_key: values.stripe_secret_key,
      empresa_id: null, // Chave global
    };

    try {
      // Tenta atualizar ou inserir (upsert)
      const { error } = await supabase
        .from('configuracoes_stripe')
        .upsert(dataToSave, { onConflict: 'empresa_id' }); // Conflito em empresa_id=NULL

      if (error) throw error;

      showSuccess('Configurações do Stripe salvas com sucesso!');
      fetchConfig(); // Re-busca para garantir que o cache seja atualizado (se houver)
    } catch (error: any) {
      showError(`Falha ao salvar configurações: ${error.message}`);
    }
  };

  if (!isAdmin) {
    return <p className="text-red-500">Acesso negado. Apenas administradores podem gerenciar as credenciais do Stripe.</p>;
  }

  if (loadingData) {
    return <div className="flex justify-center items-center h-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="stripe_publishable_key"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Chave Publicável (pk_test_...)</FormLabel>
              <FormControl>
                <Input placeholder="pk_test_..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="stripe_secret_key"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Chave Secreta (sk_test_...)</FormLabel>
              <FormControl>
                <Input placeholder="sk_test_..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar Credenciais
        </Button>
      </form>
    </Form>
  );
};

export default FormConfiguracoesStripe;