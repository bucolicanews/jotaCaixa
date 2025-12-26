import React, { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
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
import { cn } from '@/lib/utils';
import { useContabilConfig } from '@/hooks/use-contabil-config';
import { Input } from '@/components/ui/input';

/* ---------------- TIPOS ---------------- */

const TIPOS_REGISTRO_CONTABIL = [
  { key: 'id_conta_clientes_receber', label: 'Clientes a Receber (Ativo)', tipo: 'Patrimonial', analitica: 'Sim' },
  { key: 'id_conta_receita_contrato', label: 'Receita de Contrato (Resultado)', tipo: 'Resultado', analitica: 'Sim' },
];

/* ---------------- PADRÕES ---------------- */

const PADROES_CONTAS_CONTRATO = {
  id_conta_clientes_receber: { Conta: '1.1.02.0002', Descricao: 'Clientes Contratos a Receber' },
  id_conta_receita_contrato: { Conta: '4.1.01.0001', Descricao: 'Prestação de Serviços Contabeis' },
};

/* ---------------- FORM ---------------- */

const formSchema = z.object({
  url_base_assinatura: z.string().url('URL base inválida.').min(1, 'A URL base é obrigatória.'),
  template_whatsapp: z.string().min(1, 'O template do WhatsApp é obrigatório.'),
  template_email: z.string().min(1, 'O template do Email é obrigatório.'),
  
  // Mapeamentos Contábeis
  id_conta_clientes_receber: z.string().nullable(),
  id_conta_receita_contrato: z.string().nullable(),
});

type FormValues = z.infer<typeof formSchema>;

const FormConfiguracoesContrato: React.FC = () => {
  const { role, usuario, perfil, carregando: carregandoSessao, refetch: refetchSessao } = useSessao();
  const { configMap } = useContabilConfig();

  const [loadingData, setLoadingData] = useState(true);
  const [loadingContas, setLoadingContas] = useState(true);
  const [contasContabeis, setContasContabeis] = useState<PlanoContas[]>([]);

  const canAccess = role === 'Admin' || role === 'Cliente';
  const proprietarioId = role === 'Admin' ? usuario?.id : (perfil as any)?.id;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      url_base_assinatura: 'https://app-desenvolvimento-jota-caixa.ubjifz.easypanel.host',
      template_whatsapp: 'Olá! Seu contrato está pronto para assinatura. Clique no link abaixo para visualizar e assinar:\n\n{{LINK_ASSINATURA}}',
      template_email: 'Prezado(a) cliente,\n\nSeu contrato está pronto para assinatura. Clique no link abaixo para visualizar e assinar:\n\n{{LINK_ASSINATURA}}\n\nAtenciosamente,\nEquipe Financeira',
      id_conta_clientes_receber: null,
      id_conta_receita_contrato: null,
    },
  });

  /* ---------------- PLANO DE CONTAS ---------------- */

  const fetchContasContabeis = useCallback(async () => {
    if (!proprietarioId) return;

    setLoadingContas(true);

    // Busca contas Patrimoniais (Ativo) e Resultado (Receita)
    const ativoCode = configMap.Ativo || '1';
    const receitaCode = configMap.Receita || '4';
    
    const { data, error } = await supabase
      .from('plano_contas')
      .select('id, Conta, Descricao, Analitica, is_conta_patrimonial, is_conta_resultado, is_a_receber')
      .eq('proprietario_id', proprietarioId)
      .eq('Analitica', 'Sim')
      .or(`Conta.like.${ativoCode}.%,Conta.like.${receitaCode}.%`)
      .order('Conta');

    if (error) {
      showError('Erro ao carregar Plano de Contas: ' + error.message);
      setContasContabeis([]);
    } else {
      setContasContabeis(data as PlanoContas[]);
    }

    setLoadingContas(false);
  }, [proprietarioId, configMap.Ativo, configMap.Receita]);

  /* ---------------- CONFIG + PADRÕES ---------------- */

  const fetchConfig = useCallback(async () => {
    if (!canAccess || !proprietarioId) {
      setLoadingData(false);
      return;
    }

    setLoadingData(true);

    const { data, error } = await supabase
      .from('configuracao_contratos')
      .select('*')
      .eq('proprietario_id', proprietarioId)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      showError('Erro ao carregar configurações de Contrato: ' + error.message);
      setLoadingData(false);
      return;
    }

    const valores: Partial<FormValues> = {};

    if (data) {
      valores.url_base_assinatura = data.url_base_assinatura;
      valores.template_whatsapp = data.template_whatsapp;
      valores.template_email = data.template_email;
      valores.id_conta_clientes_receber = data.id_conta_clientes_receber;
      valores.id_conta_receita_contrato = data.id_conta_receita_contrato;
    }

    // 🔹 Aplica padrão SOMENTE se não existir valor salvo
    TIPOS_REGISTRO_CONTABIL.forEach(tipo => {
      const key = tipo.key as keyof FormValues;

      if (!valores[key]) {
        const padrao = PADROES_CONTAS_CONTRATO[key];
        if (!padrao) return;

        const conta = contasContabeis.find(
          c => c.Conta === padrao.Conta && c.Descricao === padrao.Descricao
        );

        if (conta) {
          valores[key] = conta.id;
        }
      }
    });

    form.reset(valores);
    setLoadingData(false);
  }, [canAccess, proprietarioId, contasContabeis, form]);

  /* ---------------- EFFECT ---------------- */

  useEffect(() => {
    if (!carregandoSessao && canAccess) {
      fetchContasContabeis();
    }
  }, [carregandoSessao, canAccess, fetchContasContabeis]);

  useEffect(() => {
    if (contasContabeis.length > 0) {
      fetchConfig();
    }
  }, [contasContabeis, fetchConfig]);

  /* ---------------- SUBMIT ---------------- */

  const onSubmit = async (values: FormValues) => {
    if (!canAccess || !proprietarioId) {
      showError('Sem permissão.');
      return;
    }

    const payload = {
      proprietario_id: proprietarioId,
      url_base_assinatura: values.url_base_assinatura,
      template_whatsapp: values.template_whatsapp,
      template_email: values.template_email,
      id_conta_clientes_receber: values.id_conta_clientes_receber || null,
      id_conta_receita_contrato: values.id_conta_receita_contrato || null,
    };

    const { error } = await supabase
      .from('configuracao_contratos')
      .upsert(payload, { onConflict: 'proprietario_id' });

    if (error) {
      showError(error.message);
    } else {
      showSuccess('Configurações de Contrato salvas com sucesso!');
      refetchSessao();
    }
  };

  /* ---------------- FILTRO CONTAS ---------------- */

  const getContasDisponiveis = (tipo: 'Patrimonial' | 'Resultado', analitica: 'Sim' | 'Não') =>
    contasContabeis
      .filter(c => {
        if (c.Analitica !== analitica) return false;
        if (tipo === 'Patrimonial') return c.is_conta_patrimonial || c.is_a_receber;
        return c.is_conta_resultado;
      })
      .map(c => ({
        id: c.id,
        display: `${c.Conta} - ${c.Descricao}`,
      }));

  /* ---------------- UI ---------------- */

  if (loadingData || loadingContas) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <h3 className="font-semibold">Links e Templates de Envio</h3>
        <FormField
          control={form.control}
          name="url_base_assinatura"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center">
                <Link className="w-4 h-4 mr-2" /> URL Base de Assinatura
              </FormLabel>
              <FormControl>
                <Input placeholder="Ex: https://seusistema.com" {...field} />
              </FormControl>
              <FormMessage />
              <p className="text-xs text-muted-foreground">
                Usado para gerar o link completo: <code>{field.value}/contrato-link/&#123;ID&#125;</code>
              </p>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="template_whatsapp"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center">
                <MessageSquare className="w-4 h-4 mr-2" /> Template WhatsApp
              </FormLabel>
              <FormControl>
                <Textarea rows={3} placeholder="Use {{LINK_ASSINATURA}}" {...field} />
              </FormControl>
              <FormMessage />
              <p className="text-xs text-muted-foreground">
                Exemplo: Olá! Seu contrato está pronto para assinatura. Clique no link abaixo para visualizar e assinar:
                <br />
                <span className="font-mono text-green-600">
                  {"{{LINK_ASSINATURA}}"}
                </span>
              </p>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="template_email"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center">
                <Mail className="w-4 h-4 mr-2" /> Template Email
              </FormLabel>
              <FormControl>
                <Textarea rows={5} placeholder="Use {{LINK_ASSINATURA}}" {...field} />
              </FormControl>
              <FormMessage />
              <p className="text-xs text-muted-foreground">
                Exemplo: Prezado(a) cliente, Seu contrato está pronto para assinatura. Clique no link abaixo para visualizar e assinar:
                <br />
                <span className="font-mono text-blue-600">
                  {"{{LINK_ASSINATURA}}"}
                </span>
              </p>
            </FormItem>
          )}
        />

        <Separator />

        <h3 className="font-semibold flex items-center">
          <BookOpen className="w-4 h-4 mr-2" /> Mapeamento Contábil (Contas a Receber)
        </h3>
        <p className="text-sm text-muted-foreground">
          Estas contas serão usadas para registrar o faturamento (D: Ativo, C: Receita) ao gerar um contrato.
        </p>

        {TIPOS_REGISTRO_CONTABIL.map(tipo => (
          <FormField
            key={tipo.key}
            control={form.control}
            name={tipo.key as keyof FormValues}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{tipo.label}</FormLabel>
                <Select
                  value={field.value || 'null'}
                  onValueChange={v => field.onChange(v === 'null' ? null : v)}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a conta" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="null">Nenhum</SelectItem>
                    {getContasDisponiveis(tipo.tipo as any, tipo.analitica as any).map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.display}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        ))}

        <Button type="submit" className="w-full">
          Salvar Configurações de Contrato
        </Button>
      </form>
    </Form>
  );
};

export default FormConfiguracoesContrato;