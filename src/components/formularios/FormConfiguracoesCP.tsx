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
  const { role, usuario, carregando: carregandoSessao } = useSessao();

  const [loadingData, setLoadingData] = useState(true);
  const [loadingContas, setLoadingContas] = useState(true);
  const [contasContabeis, setContasContabeis] = useState<PlanoContas[]>([]);

  const canAccess = role === 'Admin' || role === 'Cliente';
  const proprietarioId = usuario?.id;

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

    // 🔹 Não aplica mais padrões automáticos, apenas carrega o que existe.

    form.reset(valores);
    setLoadingData(false);
  }, [canAccess, proprietarioId, form]);

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

    const payload = TIPOS_REGISTRO_CONTABIL.map(tipo => ({
      proprietario_id: proprietarioId,
      tipo_registro: tipo.key,
      conta_contabil_id: values[tipo.key as keyof FormValues] || null,
    }));

    const { error } = await supabase
      .from('configuracao_contas_pagar')
      .upsert(payload, { onConflict: 'proprietario_id, tipo_registro' });

    if (error) {
      showError(error.message);
    } else {
      showSuccess('Configurações salvas com sucesso!');
      fetchConfig();
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