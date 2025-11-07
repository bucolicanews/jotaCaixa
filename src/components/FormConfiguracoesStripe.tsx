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
import { Historico } from '@/types/historico'; // Importando Historico

const formSchema = z.object({
  stripe_publishable_key: z.string().min(1, 'A chave publicável é obrigatória.'),
  stripe_secret_key: z.string().min(1, 'A chave secreta é obrigatória.'),
  conta_sintetica_id: z.string().uuid('Selecione uma conta contábil válida.').nullable(),
  conta_receber_id: z.string().uuid('Selecione uma conta contábil válida.').nullable(),
  historico_padrao_id: z.string().uuid('Selecione um histórico padrão válido.').nullable(), // NOVO CAMPO
});

type FormValues = z.infer<typeof formSchema>;

const FormConfiguracoesStripe: React.FC = () => {
  const { role, usuario, carregando: carregandoSessao } = useSessao();
  const [loadingData, setLoadingData] = useState(true);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [contasContabeis, setContasContabeis] = useState<PlanoContas[]>([]);
  const [historicos, setHistoricos] = useState<Historico[]>([]); // NOVO ESTADO
  const [loadingContas, setLoadingContas] = useState(true);
  
  const isAdmin = role === 'Admin';
  const adminId = usuario?.id;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      stripe_publishable_key: '',
      stripe_secret_key: '',
      conta_sintetica_id: null,
      conta_receber_id: null,
      historico_padrao_id: null, // Valor inicial
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
  
  // NOVO: Função para buscar históricos
  const fetchHistoricos = useCallback(async () => {
    if (!adminId) return;
    const { data, error } = await supabase
        .from('historicos')
        .select('id, descricao')
        .eq('proprietario_id', adminId)
        .order('descricao');
        
    if (error) {
        console.error('Erro ao carregar históricos:', error);
        setHistoricos([]);
    } else {
        setHistoricos(data as Historico[]);
    }
  }, [adminId]);

  const fetchConfig = useCallback(async () => {
    if (!isAdmin || !adminId) {
      setLoadingData(false);
      return;
    }
    
    setLoadingData(true);
    
    // Busca a configuração vinculada ao ID do Admin logado (proprietario_id = adminId)
    const { data, error } = await supabase
      .from('configuracoes_stripe')
      .select('id, stripe_publishable_key, stripe_secret_key, conta_sintetica_id, conta_receber_id, historico_padrao_id') // Inclui o novo campo
      .eq('proprietario_id', adminId)
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      showError('Erro ao carregar configurações do Stripe: ' + error.message);
    } else if (data) {
      setExistingId(data.id);
      
      form.reset({
        stripe_publishable_key: data.stripe_publishable_key || '',
        stripe_secret_key: data.stripe_secret_key || '',
        conta_sintetica_id: data.conta_sintetica_id || undefined, 
        conta_receber_id: data.conta_receber_id || undefined,
        historico_padrao_id: data.historico_padrao_id || undefined, // Carrega o novo campo
      });
    } else {
      setExistingId(null);
      form.reset({
        stripe_publishable_key: '',
        stripe_secret_key: '',
        conta_sintetica_id: undefined,
        conta_receber_id: undefined,
        historico_padrao_id: undefined, // Reseta o novo campo
      });
    }
    setLoadingData(false);
  }, [isAdmin, adminId, form]);

  useEffect(() => {
    if (!carregandoSessao && isAdmin) {
      fetchContasContabeis();
      fetchHistoricos(); // Busca históricos
      fetchConfig();
    }
  }, [carregandoSessao, isAdmin, fetchConfig, fetchContasContabeis, fetchHistoricos]);

  const onSubmit = async (values: FormValues) => {
    if (!isAdmin) {
      showError('Apenas administradores podem salvar esta configuração.');
      return;
    }
    
    if (!adminId) {
        showError('ID do administrador não encontrado.');
        return;
    }
    
    if (!values.conta_sintetica_id) {
        showError('Selecione a Conta Contábil de Destino (Stripe/Banco).');
        return;
    }
    
    if (!values.conta_receber_id) {
        showError('Selecione a Conta Contábil Parcelas a Receber.');
        return;
    }
    
    if (!values.historico_padrao_id) {
        showError('Selecione o Histórico Padrão para transações Stripe.');
        return;
    }
    
    const dataToSave = {
      stripe_publishable_key: values.stripe_publishable_key,
      stripe_secret_key: values.stripe_secret_key,
      conta_sintetica_id: values.conta_sintetica_id,
      conta_receber_id: values.conta_receber_id,
      historico_padrao_id: values.historico_padrao_id, // Salva o novo campo
      proprietario_id: adminId,
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
              <FormLabel>Conta Contábil de Destino (Stripe/Banco)</FormLabel>
              <Select 
                onValueChange={field.onChange} 
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
        
        <FormField
          control={form.control}
          name="conta_receber_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Conta Contábil Parcelas a Receber (Stripe)</FormLabel>
              <Select 
                onValueChange={field.onChange} 
                value={field.value || undefined}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a conta analítica de parcelas" />
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
        
        {/* NOVO CAMPO: Histórico Padrão */}
        <FormField
          control={form.control}
          name="historico_padrao_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Histórico Padrão para Lançamentos Stripe</FormLabel>
              <Select 
                onValueChange={field.onChange} 
                value={field.value || undefined}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o histórico padrão" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                    {historicos.length === 0 ? (
                        <SelectItem value="disabled" disabled>Nenhum histórico cadastrado.</SelectItem>
                    ) : (
                        historicos.map(h => (
                            <SelectItem key={h.id} value={h.id}>
                                {h.descricao}
                            </SelectItem>
                        ))
                    )}
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