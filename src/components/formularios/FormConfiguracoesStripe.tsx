import React, { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useSessao } from '@/hooks/use-sessao';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { PlanoContas } from '@/types/plano-contas';
import { Historico } from '@/types/historico';
import { useStripeConfigAdmin } from '@/integrations/stripe/use-stripe-config-admin';

const formSchema = z.object({
  stripe_publishable_key: z.string().min(1, 'A chave publicável é obrigatória.'),
  stripe_secret_key: z.string().min(1, 'A chave secreta é obrigatória.'),
  // TORNANDO OBRIGATÓRIO: Deve ser um UUID válido (não nulo)
  conta_sintetica_id: z.string().uuid('Selecione a Conta Contábil de Destino (Stripe/Banco).'),
  historico_padrao_id: z.string().uuid('Selecione um histórico padrão válido.'),
});

type FormValues = z.infer<typeof formSchema>;

const FormConfiguracoesStripe: React.FC = () => {
  const { role, usuario, carregando: carregandoSessao } = useSessao();
  const [contasContabeis, setContasContabeis] = useState<PlanoContas[]>([]);
  const [historicos, setHistoricos] = useState<Historico[]>([]);
  const [loadingContas, setLoadingContas] = useState(true);
  const [hasLinkedSaldoConta, setHasLinkedSaldoConta] = useState(true); // NOVO ESTADO
  
  const isAdmin = role === 'Admin';
  const adminId = usuario?.id;
  
  // Usando o novo hook para buscar a configuração completa (Admin-only)
  const { config: configInicial, loading: loadingData, error: configError, refetch: refetchConfig } = useStripeConfigAdmin(adminId || null);
  const [existingId, setExistingId] = useState<string | null>(null);


  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      stripe_publishable_key: '',
      stripe_secret_key: '',
      // Usando undefined para que o Zod force a seleção se o valor for nulo
      conta_sintetica_id: undefined, 
      historico_padrao_id: undefined,
    },
  });
  
  const contaSinteticaWatch = form.watch('conta_sintetica_id');

  // Efeito para carregar os valores iniciais do hook no formulário
  useEffect(() => {
      if (configInicial) {
          setExistingId(configInicial.id);
          form.reset({
              stripe_publishable_key: configInicial.stripe_publishable_key || '',
              stripe_secret_key: configInicial.stripe_secret_key || '',
              // Se for null, usa undefined para acionar a validação Zod
              conta_sintetica_id: configInicial.conta_sintetica_id || undefined, 
              historico_padrao_id: configInicial.historico_padrao_id || undefined,
          });
      } else if (!loadingData && !configInicial) {
          setExistingId(null);
          form.reset({
              stripe_publishable_key: '',
              stripe_secret_key: '',
              conta_sintetica_id: undefined,
              historico_padrao_id: undefined,
          });
      }
  }, [configInicial, loadingData, form]);


  const fetchContasContabeis = useCallback(async () => {
    if (!adminId) return;
    setLoadingContas(true);
    
    // Busca contas analíticas que são marcadas como Caixa/Banco ou Patrimonial
    const { data, error } = await supabase
        .from('plano_contas')
        .select('id, Conta, Descricao, Analitica, is_conta_caixa_banco, is_conta_patrimonial')
        .eq('proprietario_id', adminId)
        .eq('Analitica', 'Sim')
        .or('is_conta_caixa_banco.eq.true,is_conta_patrimonial.eq.true')
        .order('Conta');
        
    if (error) {
        showError('Erro ao carregar Plano de Contas: ' + error.message);
        setContasContabeis([]);
    } else {
        setContasContabeis(data as PlanoContas[]);
    }
    setLoadingContas(false);
  }, [adminId]);
  
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
  
  // NOVO: Verifica se a conta sintética selecionada está vinculada a uma saldo_conta
  const checkLinkedSaldoConta = useCallback(async (contaContabilId: string) => {
      if (!adminId || !contaContabilId) {
          setHasLinkedSaldoConta(false);
          return;
      }
      
      const { count, error } = await supabase
          .from('saldo_contas')
          .select('id', { count: 'exact', head: true })
          .eq('proprietario_id', adminId)
          .eq('conta_contabil_id', contaContabilId);
          
      if (error) {
          console.error('Erro ao verificar saldo_conta vinculada:', error);
          setHasLinkedSaldoConta(false);
          return;
      }
      
      setHasLinkedSaldoConta((count || 0) > 0);
  }, [adminId]);
  
  useEffect(() => {
      if (contaSinteticaWatch) {
          checkLinkedSaldoConta(contaSinteticaWatch);
      } else {
          setHasLinkedSaldoConta(true); // Não verifica se não há conta selecionada
      }
  }, [contaSinteticaWatch, checkLinkedSaldoConta]);

  useEffect(() => {
    if (!carregandoSessao && isAdmin) {
      fetchContasContabeis();
      fetchHistoricos();
    }
  }, [carregandoSessao, isAdmin, fetchContasContabeis, fetchHistoricos]);

  const onSubmit = async (values: FormValues) => {
    if (!isAdmin) {
      showError('Apenas administradores podem salvar esta configuração.');
      return;
    }
    
    if (!adminId) {
        showError('ID do administrador não encontrado.');
        return;
    }
    
    if (!hasLinkedSaldoConta) {
        showError('A Conta Contábil de Destino (Stripe/Banco) deve estar vinculada a uma Conta/Caixa em Bancos.');
        return;
    }
    
    const dataToSave = {
      stripe_publishable_key: values.stripe_publishable_key,
      stripe_secret_key: values.stripe_secret_key,
      conta_sintetica_id: values.conta_sintetica_id,
      historico_padrao_id: values.historico_padrao_id,
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
      refetchConfig(); // Recarrega a configuração
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
  
  if (configError) {
      return <p className="text-red-500">Erro ao carregar configurações: {configError}</p>;
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
                value={field.value}
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
              {contasContabeis.length === 0 && (
                  <p className="text-sm text-red-500">
                      Nenhuma conta marcada como Caixa/Banco ou Patrimonial. Marque as contas em <a href="/plano-contas" className="underline">Plano de Contas</a>.
                  </p>
              )}
              {!hasLinkedSaldoConta && contaSinteticaWatch && (
                  <div className="flex items-center text-sm text-red-500 mt-2">
                      <AlertTriangle className="w-4 h-4 mr-1" />
                      Esta conta contábil precisa ser vinculada a uma Conta/Caixa em <a href="/bancos" className="underline">Bancos / Caixas</a>.
                  </div>
              )}
            </FormItem>
          )}
        />
        
        {/* REMOVIDO: conta_receber_id */}
        
        {/* NOVO CAMPO: Histórico Padrão */}
        <FormField
          control={form.control}
          name="historico_padrao_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Histórico Padrão para Lançamentos Stripe</FormLabel>
              <Select 
                onValueChange={field.onChange} 
                value={field.value}
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
        
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting || !hasLinkedSaldoConta}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar Credenciais
        </Button>
      </form>
    </Form>
  );
};

export default FormConfiguracoesStripe;