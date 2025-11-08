import React, { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Link, MessageSquare, Mail } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useSessao } from '@/hooks/use-sessao';
import { Separator } from '../ui/separator';

const formSchema = z.object({
  url_base_assinatura: z.string().url('URL base inválida. Deve incluir http:// ou https://.'),
  template_whatsapp: z.string().min(1, 'O template do WhatsApp é obrigatório.'),
  template_email: z.string().min(1, 'O template do Email é obrigatório.'),
});

type FormValues = z.infer<typeof formSchema>;

const FormConfiguracoesContrato: React.FC = () => {
  const { role, usuario, carregando: carregandoSessao } = useSessao();
  const [loadingData, setLoadingData] = useState(true);
  const [existingId, setExistingId] = useState<string | null>(null);
  
  const isAdmin = role === 'Admin';
  const ownerId = usuario?.id;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      url_base_assinatura: 'https://seu-dominio.com',
      template_whatsapp: 'Olá! Seu contrato está pronto para assinatura. Clique no link abaixo para visualizar e assinar:\n\n{{LINK_ASSINATURA}}',
      template_email: 'Prezado(a) cliente,\n\nSeu contrato está pronto para assinatura. Clique no link abaixo para visualizar e assinar:\n\n{{LINK_ASSINATURA}}\n\nAtenciosamente,\nEquipe Financeira',
    },
  });

  const fetchConfig = useCallback(async () => {
    if (!ownerId) {
      setLoadingData(false);
      return;
    }
    
    setLoadingData(true);
    
    const { data, error } = await supabase
      .from('configuracao_contratos')
      .select('*')
      .eq('proprietario_id', ownerId)
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
      });
    }
    setLoadingData(false);
  }, [ownerId, form]);

  useEffect(() => {
    if (!carregandoSessao && isAdmin) {
      fetchConfig();
    }
  }, [carregandoSessao, isAdmin, fetchConfig]);

  const onSubmit = async (values: FormValues) => {
    if (!isAdmin || !ownerId) {
      showError('Apenas administradores podem salvar esta configuração.');
      return;
    }
    
    const dataToSave = {
      proprietario_id: ownerId,
      url_base_assinatura: values.url_base_assinatura,
      template_whatsapp: values.template_whatsapp,
      template_email: values.template_email,
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

  if (!isAdmin) {
    return <p className="text-red-500">Acesso negado. Apenas administradores podem gerenciar esta configuração.</p>;
  }

  if (loadingData) {
    return <div className="flex justify-center items-center h-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        
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