import React, { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useSessao } from '@/hooks/use-sessao';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { PlanoContas } from '@/types/plano-contas';
import { Separator } from '../ui/separator';

// Tipos de registro que precisam de mapeamento contábil
const TIPOS_REGISTRO_CONTABIL = [
  { key: 'a_receber', label: 'Clientes a Receber (Sintético)', tipo: 'Patrimonial', analitica: 'Não' }, // Sintética
  { key: 'parcela', label: 'Parcelas a Receber (Analítico)', tipo: 'Patrimonial', analitica: 'Sim' }, // Analítica
  { key: 'desconto_concedido', label: 'Descontos Concedidos (Despesa)', tipo: 'Resultado', analitica: 'Sim' }, // Despesa (DRE)
  { key: 'estorno_desconto_concedido', label: 'Estorno Desconto Concedido (Receita)', tipo: 'Resultado', analitica: 'Sim' }, // NOVO CAMPO
];

// Esquema dinâmico: a_receber e parcela agora são opcionais (nullable)
const formSchema = z.object({
  a_receber: z.string().nullable(),
  parcela: z.string().nullable(),
  desconto_concedido: z.string().nullable(),
  estorno_desconto_concedido: z.string().nullable(),
});

type FormValues = z.infer<typeof formSchema>;

interface FormConfiguracoesCRProps {
  // ... (props)
}

const FormConfiguracoesCR: React.FC = () => {
  const { role, usuario, perfil, carregando: carregandoSessao } = useSessao();
  const [loadingData, setLoadingData] = useState(true);
  const [contasContabeis, setContasContabeis] = useState<PlanoContas[]>([]);
  const [loadingContas, setLoadingContas] = useState(true);
  
  const isAdmin = role === 'Admin';
  const isCliente = role === 'Cliente';
  const canAccess = isAdmin || isCliente;
  const proprietarioId = isAdmin ? usuario?.id : (perfil as any)?.id;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      a_receber: null,
      parcela: null,
      desconto_concedido: null,
      estorno_desconto_concedido: null,
    },
  });
  
  const fetchContasContabeis = useCallback(async () => {
    if (!proprietarioId) return;
    setLoadingContas(true);
    
    const { data, error } = await supabase
        .from('plano_contas')
        .select('id, Conta, Descricao, Analitica, is_conta_patrimonial, is_conta_resultado, is_a_receber')
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

  const fetchConfig = useCallback(async () => {
    if (!canAccess || !proprietarioId) {
      setLoadingData(false);
      return;
    }
    
    setLoadingData(true);
    
    const { data: contasData, error: contasError } = await supabase
      .from('configuracao_contas_receber')
      .select('tipo_registro, conta_contabil_id')
      .eq('proprietario_id', proprietarioId);

    if (contasError) {
      showError('Erro ao carregar configurações de CR: ' + contasError.message);
    } else if (contasData) {
      const mappedData = contasData.reduce((acc: Partial<FormValues>, item: { tipo_registro: string, conta_contabil_id: string | null }) => {
        
        // Mapeia os campos existentes
        if (['a_receber', 'parcela', 'desconto_concedido', 'estorno_desconto_concedido'].includes(item.tipo_registro)) {
            acc[item.tipo_registro as keyof FormValues] = item.conta_contabil_id;
        }
        
        // Mapeamento de compatibilidade: 'desconto' antigo -> 'desconto_concedido'
        if (item.tipo_registro === 'desconto' && !acc['desconto_concedido']) {
            acc['desconto_concedido'] = item.conta_contabil_id;
        }
        
        return acc;
      }, {} as Partial<FormValues>);
      
      form.reset(mappedData);
    }
    setLoadingData(false);
  }, [canAccess, proprietarioId, form]);

  useEffect(() => {
    if (!carregandoSessao && canAccess) {
      fetchContasContabeis();
      fetchConfig();
    }
  }, [carregandoSessao, canAccess, fetchConfig, fetchContasContabeis]);

  const onSubmit = async (values: FormValues) => {
    if (!canAccess || !proprietarioId) {
      showError('Você não tem permissão para salvar esta configuração.');
      return;
    }
    
    const dataToUpsertContabil = TIPOS_REGISTRO_CONTABIL.map(tipo => ({
        proprietario_id: proprietarioId,
        tipo_registro: tipo.key,
        conta_contabil_id: values[tipo.key as keyof FormValues] || null, 
    }));
    
    const fieldsToRemove = ['recebimento', 'recebimento_resultado', 'desconto'];
    fieldsToRemove.forEach(key => {
        dataToUpsertContabil.push({
            proprietario_id: proprietarioId,
            tipo_registro: key,
            conta_contabil_id: null,
        });
    });

    try {
      // 1. Salvar Mapeamento Contábil
      const { error: contabilError } = await supabase
        .from('configuracao_contas_receber')
        .upsert(dataToUpsertContabil, { onConflict: 'proprietario_id, tipo_registro' });
        
      if (contabilError) throw contabilError;

      showSuccess('Configurações de Contas a Receber salvas com sucesso!');
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
  
  const getContasDisponiveis = (tipo: 'Patrimonial' | 'Resultado', requiredAnalitica: 'Sim' | 'Não') => {
      return contasContabeis
          .filter(c => {
              const analiticaMatch = c.Analitica === requiredAnalitica;
              
              // Lógica de filtro ajustada:
              if (tipo === 'Patrimonial') {
                  // Sintética: Apenas contas sintéticas que NÃO são de resultado
                  if (requiredAnalitica === 'Não') {
                      return c.Analitica === 'Não' && c.is_conta_resultado === false;
                  }
                  // Analítica: Contas marcadas como Patrimonial OU A Receber
                  return analiticaMatch && (c.is_conta_patrimonial || c.is_a_receber);
              } else if (tipo === 'Resultado') {
                  // Para Resultado, queremos contas marcadas como Resultado
                  return analiticaMatch && c.is_conta_resultado;
              }
              return false;
          })
          .map(c => ({
              id: c.id,
              display: `${c.Conta} - ${c.Descricao}`,
          }));
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <p className="text-sm text-muted-foreground">
            Mapeie cada tipo de transação de Contas a Receber para a conta contábil correspondente.
        </p>
        
        <Separator />
        
        <div className="space-y-4">
            {TIPOS_REGISTRO_CONTABIL.map(tipo => {
                const requiredAnalitica = tipo.analitica;
                const contasDisponiveis = getContasDisponiveis(tipo.tipo as 'Patrimonial' | 'Resultado', requiredAnalitica as 'Sim' | 'Não');
                
                return (
                    <FormField
                        key={tipo.key}
                        control={form.control}
                        name={tipo.key as keyof FormValues}
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{tipo.label} ({tipo.tipo} - {requiredAnalitica})</FormLabel>
                                <Select 
                                    onValueChange={(v) => field.onChange(v === "null" ? null : v)} 
                                    value={field.value || "null"}
                                >
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder={`Selecione a conta ${tipo.tipo}`} />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="null">Nenhum</SelectItem>
                                        {contasDisponiveis.map(c => (
                                            <SelectItem key={c.id} value={c.id}>
                                                {c.display}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                                {contasDisponiveis.length === 0 && !loadingContas && (
                                    <p className="text-xs text-red-500">
                                        Nenhuma conta {requiredAnalitica} marcada como {tipo.tipo} no Plano de Contas.
                                    </p>
                                )}
                            </FormItem>
                        )}
                    />
                );
            })}
        </div>
        
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar Mapeamento Contábil
        </Button>
      </form>
    </Form>
  );
};

export default FormConfiguracoesCR;