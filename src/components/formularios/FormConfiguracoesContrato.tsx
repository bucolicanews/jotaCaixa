import React, { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Link, MessageSquare, Mail, BookOpen } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useSessao } from '@/hooks/use-sessao';
import { Separator } from '../ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { PlanoContas } from '@/types/plano-contas';
import { useContabilConfig } from '@/hooks/use-contabil-config';
import { ClienteProfile } from '@/types/usuario';

/* ---------------- PADRÕES ---------------- */

const PADROES_CONTRATO = {
  url_base: 'https://app-desenvolvimento-jota-caixa.ubjifz.easypanel.host',
  template_whatsapp:
    'Olá! Seu contrato está pronto para assinatura. Clique no link abaixo para visualizar e assinar:\n\n{{LINK_ASSINATURA}}',
  template_email:
    'Prezado(a) cliente,\n\nSeu contrato está pronto para assinatura. Clique no link abaixo para visualizar e assinar:\n\n{{LINK_ASSINATURA}}\n\nAtenciosamente,\nEquipe Financeira',
};

/* ---------------- FORM ---------------- */

const formSchema = z.object({
  url_base_assinatura: z.string().url(),
  template_whatsapp: z.string(),
  template_email: z.string(),
  id_conta_clientes_receber: z.string().uuid().nullable(),
  id_conta_receita_contrato: z.string().uuid().nullable(),
});

type FormValues = z.infer<typeof formSchema>;

const FormConfiguracoesContrato: React.FC = () => {
  const { role, usuario, perfil, carregando: carregandoSessao } = useSessao();
  const { configMap } = useContabilConfig();

  const [loadingData, setLoadingData] = useState(true);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [contasAtivo, setContasAtivo] = useState<PlanoContas[]>([]);
  const [contasReceita, setContasReceita] = useState<PlanoContas[]>([]);
  const [loadingContas, setLoadingContas] = useState(true);

  const canAccess = role === 'Admin' || role === 'Cliente';
  const proprietarioId = role === 'Admin' ? usuario?.id : (perfil as ClienteProfile)?.id;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      url_base_assinatura: '',
      template_whatsapp: '',
      template_email: '',
      id_conta_clientes_receber: null,
      id_conta_receita_contrato: null,
    },
  });

  /* ---------------- CONTAS ---------------- */

  const fetchContas = useCallback(async () => {
    if (!proprietarioId) return;

    setLoadingContas(true);

    const ativoCode = configMap.Ativo || '1';
    const receitaCode = configMap.Receita || '4';

    const { data: ativo } = await supabase
      .from('plano_contas')
      .select('id, Conta, Descricao')
      .eq('proprietario_id', proprietarioId)
      .eq('Analitica', 'Sim')
      .eq('is_conta_patrimonial', true)
      .like('Conta', `${ativoCode}.%`);

    const { data: receita } = await supabase
      .from('plano_contas')
      .select('id, Conta, Descricao')
      .eq('proprietario_id', proprietarioId)
      .eq('Analitica', 'Sim')
      .eq('is_conta_resultado', true)
      .like('Conta', `${receitaCode}.%`);

    setContasAtivo(ativo || []);
    setContasReceita(receita || []);
    setLoadingContas(false);
  }, [proprietarioId, configMap]);

  /* ---------------- CONFIG + PADRÕES ---------------- */

  const fetchConfig = useCallback(async () => {
    if (!proprietarioId) return;

    setLoadingData(true);

    const { data } = await supabase
      .from('configuracao_contratos')
      .select('*')
      .eq('proprietario_id', proprietarioId)
      .maybeSingle(); // Usando maybeSingle para lidar com registros inexistentes

    const valores: Partial<FormValues> = {};

    if (data) {
      setExistingId(data.id);
      Object.assign(valores, data);
    }

    // Aplica padrões se o valor for nulo (garantindo que os campos de texto não sejam nulos)
    valores.url_base_assinatura ||= PADROES_CONTRATO.url_base;
    valores.template_whatsapp ||= PADROES_CONTRATO.template_whatsapp;
    valores.template_email ||= PADROES_CONTRATO.template_email;

    form.reset(valores);
    setLoadingData(false);
  }, [proprietarioId, form]);

  useEffect(() => {
    if (!carregandoSessao && canAccess) fetchContas();
  }, [carregandoSessao, canAccess, fetchContas]);

  useEffect(() => {
    if (contasAtivo.length || contasReceita.length) fetchConfig();
  }, [contasAtivo, contasReceita, fetchConfig]);

  /* ---------------- SUBMIT ---------------- */

  const onSubmit = async (values: FormValues) => {
    if (!proprietarioId) return;

    const payload = { ...values, proprietario_id: proprietarioId };

    const query = existingId
      ? supabase.from('configuracao_contratos').update(payload).eq('id', existingId)
      : supabase.from('configuracao_contratos').insert(payload);

    const { error } = await query;

    if (error) showError(error.message);
    else showSuccess('Configurações de Contrato salvas com sucesso!');
  };

  if (loadingData || loadingContas) {
    return <Loader2 className="animate-spin mx-auto my-6" />;
  }

  /* ---------------- UI ---------------- */

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <h3 className="font-semibold flex items-center">
          <BookOpen className="w-4 h-4 mr-2" /> Mapeamento Contábil (Contratos)
        </h3>

        {/* DÉBITO */}
        <FormField
          control={form.control}
          name="id_conta_clientes_receber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Conta DÉBITO: Clientes a Receber</FormLabel>
              <Select value={field.value || undefined} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a conta de Ativo" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {contasAtivo.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.Conta} - {c.Descricao}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />

        {/* CRÉDITO */}
        <FormField
          control={form.control}
          name="id_conta_receita_contrato"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Conta CRÉDITO: Receita de Contratos</FormLabel>
              <Select value={field.value || undefined} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a conta de Receita" />
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
            </FormItem>
          )}
        />

        <Separator />

        {/* URL */}
        <FormField
          control={form.control}
          name="url_base_assinatura"
          render={({ field }) => (
            <FormItem>
              <FormLabel>URL Base de Assinatura</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
            </FormItem>
          )}
        />

        <Separator />

        {/* TEMPLATES */}
        <FormField
          control={form.control}
          name="template_whatsapp"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Template WhatsApp</FormLabel>
              <Textarea rows={4} {...field} />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="template_email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Template Email</FormLabel>
              <Textarea rows={5} {...field} />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full">
          Salvar Configurações de Contrato
        </Button>
      </form>
    </Form>
  );
};

export default FormConfiguracoesContrato;