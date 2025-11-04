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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { PlanoContas } from '@/types/plano-contas';

const formSchema = z.object({
  stripe_publishable_key: z.string().min(1, 'A chave publicável é obrigatória.'),
  stripe_secret_key: z.string().min(1, 'A chave secreta é obrigatória.'),
  conta_sintetica_id: z.string().uuid('Selecione uma conta contábil válida.').nullable(),
});

type FormValues = z.infer<typeof formSchema>;

const FormConfiguracoesStripe: React.FC = () => {
  const { role, usuario, carregando: carregandoSessao } = useSessao();
  const [loadingData, setLoadingData] = useState(true);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [contasContabeis, setContasContabeis] = useState<PlanoContas[]>([]);
  const [loadingContas, setLoadingContas] = useState(true);
  
  const isAdmin = role === 'Admin';
  const adminId = usuario?.id;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      stripe_publishable_key: '',
      stripe_secret_key: '',
      conta_sintetica_id: null,
    },
  });
  
  const fetchContasContabeis = useCallback(async () => {
    if (!adminId) return;
    setLoadingContas(true);
    
    // Busca apenas contas analíticas do Admin (que serão usadas como contas sintéticas de recebimento)
    const { data, error } = await supabase
        .from('plano_contas')
        .select('id, Conta, Descricao, Analitica')
        .eq('proprietario_id', adminId)
        .eq('Analitica', 'Sim') // Apenas contas analíticas
        .order('Conta');
        
    if (error) {
        showError('Erro ao carregar Plano de Contas: ' + error.message);
        setContasContabeis([]);
    } else {
        setContasContabeis(data as PlanoContas[]);
    }
    setLoadingContas(false);
  }, [adminId]);

  const fetchConfig = useCallback(async () => {
    if (!isAdmin) {
      setLoadingData(false);
      return;
    }
    
    setLoadingData(true);
    
    // Busca a configuração global (proprietario_id IS NULL)
    const { data, error } = await supabase
      .from('configuracoes_stripe')
      .select('id, stripe_publishable_key, stripe_secret_key, conta_sintetica_id')
      .is('proprietario_id', null)
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      showError('Erro ao carregar configurações do Stripe: ' + error.message);
    } else if (data) {
      setExistingId(data.id);
      
      // Usando form.reset para preencher os valores existentes
      form.reset({
        stripe_publishable_key: data.stripe_publishable_key || '',
        stripe_secret_key: data.stripe_secret_key || '',
        // O Select precisa de uma string ou undefined, não null
        conta_sintetica_id: data.conta_sintetica_id || undefined, 
      });
    } else {
      setExistingId(null);
      // Se não houver dados, reseta para os defaults (vazios)
      form.reset({
        stripe_publishable_key: '',
        stripe_secret_key: '',
        conta_sintetica_id: undefined,
      });
    }
    setLoadingData(false);
  }, [isAdmin, form]);

  useEffect(() => {
    if (!carregandoSessao && isAdmin) {
      fetchContasContabeis();
      fetchConfig();
    }
  }, [carregandoSessao, isAdmin, fetchConfig, fetchContasContabeis]);

  const onSubmit = async (values: FormValues) => {
    if (!isAdmin) {
      showError('Apenas administradores podem salvar esta configuração.');
      return;
    }
    
    if (!values.conta_sintetica_id) {
        showError('Selecione a Conta Contábil Sintética de destino.');
        return;
    }
    
    const dataToSave = {
      stripe_publishable_key: values.stripe_publishable_key,
      stripe_secret_key: values.stripe_secret_key,
      conta_sintetica_id: values.conta_sintetica_id,
      proprietario_id: null, // Chave global
    };

    try {
      let error = null;
      
      if (existingId) {
        const { error: updateError } = await supabase
          .from('configuracoes_stripe')
          .update(dataToSave)
          .eq('id', existingId);
        error = updateError;
      } else {
        const { error: insertError } = await supabase
          .from('configuracoes_stripe')
          .insert(dataToSave);
        error = insertError;
      }

      if (error) throw error;

      showSuccess('Configurações do Stripe salvas com sucesso!');
      fetchConfig();
    } catch (error: any) {
      showError(`Falha ao salvar configurações: ${error.message}`);
    }
  };

  if (!isAdmin) {
    return <p className="text-red-500">Acesso negado. Apenas administradores podem gerenciar as credenciais do Stripe.</p>;
  }

  if (loadingData || loadingContas) {
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
                <Input placeholder="pk_test_..." {...field} value={field.value || ''} />
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
                <Input placeholder="sk_test_..." {...field} value={field.value || ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="conta_sintetica_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Conta Contábil de Recebimento (Stripe)</FormLabel>
              <Select 
                onValueChange={field.onChange} 
                // Garante que o valor do Select seja uma string ou undefined
                value={field.value || undefined}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a conta analítica de destino" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                    {contasContabeis.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                            {c.Conta} - {c.Descricao}
                        </SelectItem>
                    ))}
                </SelectContent>
              </Select>
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