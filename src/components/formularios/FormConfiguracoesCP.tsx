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
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useSessao } from '@/hooks/use-sessao';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { PlanoContas } from '@/types/plano-contas';
import { Separator } from '../ui/separator';

/* ---------------- TIPOS ---------------- */

const TIPOS_REGISTRO_CONTABIL = [
  { key: 'a_pagar', label: 'Contas a Pagar (Sintético)', tipo: 'Patrimonial', analitica: 'Não' },
  { key: 'parcela_pagar', label: 'Parcelas a Pagar (Analítico)', tipo: 'Patrimonial', analitica: 'Sim' },
  { key: 'pagamento', label: 'Pagamentos (Saída)', tipo: 'Resultado', analitica: 'Sim' },
  { key: 'desconto_obtido', label: 'Descontos Obtidos (Receita)', tipo: 'Resultado', analitica: 'Sim' },
  { key: 'estorno_desconto_obtido', label: 'Estorno Desconto Obtido (Despesa)', tipo: 'Resultado', analitica: 'Sim' },
];

/* ---------------- PADRÕES ---------------- */

const PADROES_CONTAS_CP = {
  a_pagar: { Conta: '2.1.03', Descricao: 'Fornecedores' },
  parcela_pagar: { Conta: '2.1.03.0001', Descricao: 'Fornecedores Nacionais' },
  pagamento: { Conta: '5.1.01.0010', Descricao: 'Despesa com Fornecedores em Geral' },
  desconto_obtido: { Conta: '4.3.01.0001', Descricao: 'Descontos Obtidos ao Pagar' },
  estorno_desconto_obtido: { Conta: '5.2.01.0003', Descricao: 'Estorno Desconto Obtido' },
};

/* ---------------- FORM ---------------- */

const formSchema = z.object({
  a_pagar: z.string().nullable(),
  parcela_pagar: z.string().nullable(),
  pagamento: z.string().nullable(),
  desconto_obtido: z.string().nullable(),
  estorno_desconto_obtido: z.string().nullable(),
});

type FormValues = z.infer<typeof formSchema>;

const FormConfiguracoesCP: React.FC = () => {
  const { role, usuario, perfil, carregando: carregandoSessao, refetch: refetchSessao } = useSessao();

  const [loadingData, setLoadingData] = useState(true);
  const [loadingContas, setLoadingContas] = useState(true);
  const [contasContabeis, setContasContabeis] = useState<PlanoContas[]>([]);

  const canAccess = role === 'Admin' || role === 'Cliente';
  const proprietarioId = role === 'Admin' ? usuario?.id : (perfil as any)?.id;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      a_pagar: null,
      parcela_pagar: null,
      pagamento: null,
      desconto_obtido: null,
      estorno_desconto_obtido: null,
    },
  });

  /* ---------------- PLANO DE CONTAS ---------------- */

  const fetchContasContabeis = useCallback(async () => {
    if (!proprietarioId) return;

    setLoadingContas(true);

    const { data, error } = await supabase
      .from('plano_contas')
      .select('id, Conta, Descricao, Analitica, is_conta_patrimonial, is_conta_resultado, is_a_pagar')
      .eq('proprietario_id', proprietarioId)
      .order('Conta');

    if (error) {
      showError('Erro ao carregar Plano de Contas: ' + error.message);
      setContasContabeis([]);
    } else {
      setContasContabeis(data as PlanoContas[]);
    }

    setLoadingContas(false);
  }, [proprietarioId]);

  /* ---------------- CONFIG + PADRÕES ---------------- */

  const fetchConfig = useCallback(async () => {
    if (!canAccess || !proprietarioId) {
      setLoadingData(false);
      return;
    }

    setLoadingData(true);

    const { data, error } = await supabase
      .from('configuracao_contas_pagar')
      .select('tipo_registro, conta_contabil_id')
      .eq('proprietario_id', proprietarioId);

    if (error) {
      showError('Erro ao carregar configurações de CP: ' + error.message);
      setLoadingData(false);
      return;
    }

    const valores: Partial<FormValues> = {};

    // 🔹 Aplica o que já está salvo
    data?.forEach(item => {
      valores[item.tipo_registro as keyof FormValues] = item.conta_contabil_id;
    });

    // 🔹 Aplica padrão SOMENTE se não existir valor salvo
    TIPOS_REGISTRO_CONTABIL.forEach(tipo => {
      const key = tipo.key as keyof FormValues;

      if (!valores[key]) {
        const padrao = PADROES_CONTAS_CP[key];
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

  const applyDefaults = useCallback(
    (values: FormValues): FormValues => {
      const patched: FormValues = { ...values };

      TIPOS_REGISTRO_CONTABIL.forEach((tipo) => {
        const key = tipo.key as keyof FormValues;
        if (patched[key]) return;

        const padrao = (PADROES_CONTAS_CP as any)[key];
        if (!padrao) return;

        const conta = contasContabeis.find(
          (c) => c.Conta === padrao.Conta && c.Descricao === padrao.Descricao,
        );

        if (conta) {
          patched[key] = conta.id;
        }
      });

      return patched;
    },
    [contasContabeis],
  );

  const onSubmit = async (values: FormValues) => {
    if (!canAccess || !proprietarioId) {
      showError('Sem permissão.');
      return;
    }

    const finalValues = applyDefaults(values);

    const payload = TIPOS_REGISTRO_CONTABIL.map(tipo => ({
      proprietario_id: proprietarioId,
      tipo_registro: tipo.key,
      conta_contabil_id: finalValues[tipo.key as keyof FormValues] || null,
    }));

    const { error } = await supabase
      .from('configuracao_contas_pagar')
      .upsert(payload, { onConflict: 'proprietario_id, tipo_registro' });

    if (error) {
      showError(error.message);
    } else {
      showSuccess('Configurações salvas com sucesso!');
      form.reset(finalValues);
      refetchSessao();
    }
  };

  /* ---------------- FILTRO CONTAS ---------------- */

  const getContasDisponiveis = (tipo: 'Patrimonial' | 'Resultado', analitica: 'Sim' | 'Não') =>
    contasContabeis
      .filter(c => {
        if (analitica && c.Analitica !== analitica) return false;
        if (tipo === 'Patrimonial') return c.is_conta_patrimonial || c.is_a_pagar;
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
        <Separator />

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
          Salvar Mapeamento Contábil
        </Button>
      </form>
    </Form>
  );
};

export default FormConfiguracoesCP;
