import React, { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Link, MessageSquare, Mail, BookOpen } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useSessao } from '@/hooks/use-sessao';
import { Separator } from '../ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { PlanoContas } from '@/types/plano-contas';
import { useContabilConfig } from '@/hooks/use-contabil-config';
import { ClienteProfile } from '@/types/usuario';

const formSchema = z.object({
  url_base_assinatura: z.string().url('URL base inválida. Deve incluir http:// ou https://.'),
  template_whatsapp: z.string().min(1, 'O template do WhatsApp é obrigatório.'),
  template_email: z.string().min(1, 'O template do Email é obrigatório.'),
  
  // NOVOS CAMPOS CONTÁBEIS
  id_conta_clientes_receber: z.string().uuid('Selecione uma conta de Ativo válida.').nullable(),
  id_conta_receita_contrato: z.string().uuid('Selecione uma conta de Receita válida.').nullable(),
});

type FormValues = z.infer<typeof formSchema>;

const FormConfiguracoesContrato: React.FC = () => {
  const { role, usuario, perfil, carregando: carregandoSessao } = useSessao();
  const { configMap } = useContabilConfig();
  const [loadingData, setLoadingData] = useState(true);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [contasPatrimoniais, setContasPatrimoniais] = useState<PlanoContas[]>([]);
  const [contasReceita, setContasReceita] = useState<PlanoContas[]>([]);
  const [loadingContas, setLoadingContas] = useState(true);
  
  const isAdmin = role === 'Admin';
  const isCliente = role === 'Cliente';
  const canAccess = isAdmin || isCliente;
  const proprietarioId = isAdmin ? usuario?.id : (perfil as ClienteProfile)?.id;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      url_base_assinatura: 'https://seu-dominio.com',
      template_whatsapp: 'Olá! Seu contrato está pronto para assinatura. Clique no link abaixo para visualizar e assinar:\n\n{{LINK_ASSINATURA}}',
      template_email: 'Prezado(a) cliente,\n\nSeu contrato está pronto para assinatura. Clique no link abaixo para visualizar e assinar:\n\n{{LINK_ASSINATURA}}\n\nAtenciosamente,\nEquipe Financeira',
      id_conta_clientes_receber: null,
      id_conta_receita_contrato: null,
    },
  });

  const fetchContas = useCallback(async () => {
    if (!proprietarioId) return;
    setLoadingContas(true);
    
    const ativoCode = configMap.Ativo || '1';
    const receitaCode = configMap.Receita || '4';
    
    // 1. Buscar Contas Patrimoniais (Ativo)
    const { data: patrimonialData } = await supabase
        .from('plano_contas')
        .select('id, Conta, Descricao')
        .eq('proprietario_id', proprietarioId)
        .eq('Analitica', 'Sim')
        .eq('is_conta_patrimonial', true)
        .like('Conta', `${ativoCode}.%`)
        .order('Conta');
        
    setContasPatrimoniais(patrimonialData || []);
    
    // 2. Buscar Contas de Resultado (Receita)
    const { data: receitaData } = await supabase
        .from('plano_contas')
        .select('id, Conta, Descricao')
        .eq('proprietario_id', proprietarioId)
        .eq('Analitica', 'Sim')
        .eq('is_conta_resultado', true)
        .like('Conta', `${receitaCode}.%`)
        .order('Conta');
        
    setContasReceita(receitaData || []);
    setLoadingContas(false);
  }, [proprietarioId, configMap.Ativo, configMap.Receita]);

  const fetchConfig = useCallback(async () => {
    if (!proprietarioId) {
      setLoadingData(false);
      return;
    }
    
    setLoadingData(true);
    
    const { data, error } = await supabase
      .from('configuracao_contratos')
      .select('*')
      .eq('proprietario_id', proprietarioId)
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      showError('Erro ao carregar configurações de contrato: ' + error.message);
    } else if (data) {
      setExistingId(data.id);
      form.reset({
        url_base_assinatura: data.url_base_assinatura,
        template_whatsapp: data.template_whatsapp,
        template_email: data.template_email,
        id_conta_clientes_receber: data.id_conta_clientes_receber || null,
        id_conta_receita_contrato: data.id_conta_receita_contrato || null,
      });
    }
    setLoadingData(false);
  }, [proprietarioId, form]);

  useEffect(() => {
    if (!carregandoSessao && canAccess) {
      fetchContas();
      fetchConfig();
    }
  }, [carregandoSessao, canAccess, fetchConfig, fetchContas]);

  const onSubmit = async (values: FormValues) => {
    if (!canAccess || !proprietarioId) {
      showError('Você não tem permissão para salvar esta configuração.');
      return;
    }
    
    const dataToSave = {
      proprietario_id: proprietarioId,
      url_base_assinatura: values.url_base_assinatura,
      template_whatsapp: values.template_whatsapp,
      template_email: values.template_email,
      id_conta_clientes_receber: values.id_conta_clientes_receber || null,
      id_conta_receita_contrato: values.id_conta_receita_contrato || null,
    };

    try {
      let error = null;
      
      if (existingId) {
        const { error: updateError } = await supabase
          .from('configuracao_contratos')
          .update(dataToSave)
          .eq('id', existingId);
        error = updateError;
      } else {
        const { error: insertError } = await supabase
          .from('configuracao_contratos')
          .insert(dataToSave);
        error = insertError;
      }

      if (error) throw error;

      showSuccess('Configurações de Contrato salvas com sucesso!');
      fetchConfig();
    } catch (error: any) {
      showError(`Falha ao salvar configurações: ${error.message}`);
    }
  };

  if (!canAccess) {
    return <p className="text-red-500">Acesso negado. Você não tem permissão para gerenciar esta configuração.</p>;
  }

  if (loadingData || loadingContas) {
    return <div className="flex justify-center items-center h-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        
        <h3 className="font-semibold flex items-center"><BookOpen className="w-4 h-4 mr-2" /> Mapeamento Contábil (Contratos)</h3>
        <p className="text-sm text-muted-foreground">
            Defina as contas contábeis que serão usadas para reconhecer o direito a receber e a receita gerada por contratos.
        </p>
        
        <FormField
          control={form.control}
          name="id_conta_clientes_receber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Conta DÉBITO: Clientes a Receber (Ativo)</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || undefined}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={`Selecione a conta de Ativo (${configMap.Ativo}.x.x)`} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                    {contasPatrimoniais.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                            {c.Conta} - {c.Descricao}
                        </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <FormMessage />
              {contasPatrimoniais.length === 0 && (
                  <p className="text-xs text-red-500">Nenhuma conta Patrimonial (Ativo) marcada no Plano de Contas.</p>
              )}
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="id_conta_receita_contrato"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Conta CRÉDITO: Receita de Contratos (Resultado)</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || undefined}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={`Selecione a conta de Receita (${configMap.Receita}.x.x)`} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                    {contasReceita.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                            {c.Conta} - {c.Descricao}
                        </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <FormMessage />
              {contasReceita.length === 0 && (
                  <p className="text-xs text-red-500">Nenhuma conta de Receita marcada como Resultado no Plano de Contas.</p>
              )}
            </FormItem>
          )}
        />
        
        <Separator />
        
        <h3 className="font-semibold flex items-center"><Link className="w-4 h-4 mr-2" /> URL Base de Assinatura</h3>
        <FormField
          control={form.control}
          name="url_base_assinatura"
          render={({ field }) => (
            <FormItem>
              <FormLabel>URL Base (Ex: https://app.meudominio.com)</FormLabel>
              <FormControl>
                <Input placeholder="https://seu-dominio.com" {...field} />
              </FormControl>
              <FormMessage />
              <p className="text-xs text-muted-foreground">
                Esta URL será usada para gerar o link de assinatura. Deve ser o domínio público da sua aplicação.
              </p>
            </FormItem>
          )}
        />
        
        <Separator />
        
        <h3 className="font-semibold flex items-center"><MessageSquare className="w-4 h-4 mr-2" /> Template WhatsApp</h3>
        <FormField
          control={form.control}
          name="template_whatsapp"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Mensagem Padrão (Use {'{{LINK_ASSINATURA}}'})</FormLabel>
              <FormControl>
                <Textarea rows={5} {...field} />
              </FormControl>
              <FormMessage />
              <p className="text-xs text-muted-foreground">
                A tag {'{{LINK_ASSINATURA}}'} será substituída pelo link clicável.
              </p>
            </FormItem>
          )}
        />
        
        <Separator />
        
        <h3 className="font-semibold flex items-center"><Mail className="w-4 h-4 mr-2" /> Template Email</h3>
        <FormField
          control={form.control}
          name="template_email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Mensagem Padrão (Use {'{{LINK_ASSINATURA}}'})</FormLabel>
              <FormControl>
                <Textarea rows={5} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar Configurações de Contrato
        </Button>
      </form>
    </Form>
  );
};

export default FormConfiguracoesContrato;