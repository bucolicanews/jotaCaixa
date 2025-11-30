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
import { Historico } from '@/types/historico';

// Tipos de registro que precisam de mapeamento contábil
const TIPOS_REGISTRO_CONTABIL = [
  { key: 'a_receber', label: 'Contas a Receber (Sintético)', tipo: 'Patrimonial', analitica: 'Não' }, // Sintética
  { key: 'parcela', label: 'Parcelas a Receber (Analítico)', tipo: 'Patrimonial', analitica: 'Sim' }, // Analítica
  { key: 'desconto_concedido', label: 'Descontos Concedidos (Despesa)', tipo: 'Resultado', analitica: 'Sim' }, // Despesa (DRE)
  { key: 'estorno_desconto_concedido', label: 'Estorno Desconto Concedido (Receita)', tipo: 'Resultado', analitica: 'Sim' }, // NOVO CAMPO
];

// Esquema dinâmico: a_receber e parcela agora são opcionais (nullable)
const formSchema = z.object({
  a_receber: z.string().uuid('Conta inválida para Contas a Receber.').nullable(),
  parcela: z.string().uuid('Conta inválida para Parcelas a Receber.').nullable(),
  desconto_concedido: z.string().nullable(),
  estorno_desconto_concedido: z.string().nullable(), // NOVO CAMPO
  historico_padrao_id: z.string().nullable(),
});

type FormValues = z.infer<typeof formSchema>;

const FormConfiguracoesCR: React.FC = () => {
  const { role, usuario, carregando: carregandoSessao } = useSessao();
  const [loadingData, setLoadingData] = useState(true);
  const [contasContabeis, setContasContabeis] = useState<PlanoContas[]>([]);
  const [historicos, setHistoricos] = useState<Historico[]>([]);
  const [loadingContas, setLoadingContas] = useState(true);
  
  const isAdmin = role === 'Admin';
  const adminId = usuario?.id;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      a_receber: null,
      parcela: null,
      desconto_concedido: null,
      estorno_desconto_concedido: null, // NOVO DEFAULT
      historico_padrao_id: null,
    },
  });
  
  const fetchContasContabeis = useCallback(async () => {
    if (!adminId) return;
    setLoadingContas(true);
    
    // Busca TODAS as contas (Analíticas e Sintéticas) do Admin
    const { data, error } = await supabase
        .from('plano_contas')
        .select('id, Conta, Descricao, Analitica, is_conta_patrimonial, is_conta_resultado') // Incluindo booleanos
        .eq('proprietario_id', adminId)
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
        .select('id, descricao, codigo')
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
    
    // 1. Buscar Mapeamento Contábil
    const { data: contasData, error: contasError } = await supabase
      .from('configuracao_contas_receber')
      .select('tipo_registro, conta_contabil_id')
      .eq('proprietario_id', adminId);
      
    // 2. Buscar Histórico Padrão (da nova tabela)
    const { data: historicoData } = await supabase
        .from('configuracao_historico_padrao')
        .select('historico_id')
        .eq('proprietario_id', adminId)
        .eq('tipo_registro', 'recebimento_padrao')
        .limit(1)
        .single();

    if (contasError) {
      showError('Erro ao carregar configurações de CR: ' + contasError.message);
    } else if (contasData) {
      const mappedData = contasData.reduce((acc, item) => {
        // Mapeia apenas os campos que existem no novo esquema
        if (['a_receber', 'parcela', 'desconto_concedido', 'estorno_desconto_concedido'].includes(item.tipo_registro)) {
            acc[item.tipo_registro as keyof FormValues] = item.conta_contabil_id;
        }
        // Mapeamento de compatibilidade: 'desconto' antigo -> 'desconto_concedido'
        if (item.tipo_registro === 'desconto') {
            acc['desconto_concedido'] = item.conta_contabil_id;
        }
        return acc;
      }, {} as Partial<FormValues>);
      
      // Adiciona o ID do histórico padrão
      mappedData.historico_padrao_id = historicoData?.historico_id || null;
      
      form.reset(mappedData);
    }
    setLoadingData(false);
  }, [isAdmin, adminId, form]);

  useEffect(() => {
    if (!carregandoSessao && isAdmin) {
      fetchContasContabeis();
      fetchHistoricos();
      fetchConfig();
    }
  }, [carregandoSessao, isAdmin, fetchConfig, fetchContasContabeis, fetchHistoricos]);

  const onSubmit = async (values: FormValues) => {
    if (!isAdmin || !adminId) {
      showError('Apenas administradores podem salvar esta configuração.');
      return;
    }
    
    // Filtra apenas os campos que existem no TIPOS_REGISTRO_CONTABIL
    const dataToUpsertContabil = TIPOS_REGISTRO_CONTABIL.map(tipo => ({
        proprietario_id: adminId,
        tipo_registro: tipo.key,
        // Usa o valor diretamente (null ou string UUID)
        conta_contabil_id: values[tipo.key as keyof FormValues] || null, 
    }));
    
    // Adiciona os campos removidos (recebimento, recebimento_resultado, desconto) com valor NULL
    const fieldsToRemove = ['recebimento', 'recebimento_resultado', 'desconto'];
    fieldsToRemove.forEach(key => {
        dataToUpsertContabil.push({
            proprietario_id: adminId,
            tipo_registro: key,
            conta_contabil_id: null,
        });
    });
    
    const historicoPadraoPayload = {
        proprietario_id: adminId,
        tipo_registro: 'recebimento_padrao',
        historico_id: values.historico_padrao_id || null,
    };

    try {
      // 1. Salvar Mapeamento Contábil
      const { error: contabilError } = await supabase
        .from('configuracao_contas_receber')
        .upsert(dataToUpsertContabil, { onConflict: 'proprietario_id, tipo_registro' });
        
      if (contabilError) throw contabilError;
      
      // 2. Salvar Histórico Padrão na nova tabela
      const { error: historicoError } = await supabase
        .from('configuracao_historico_padrao')
        .upsert(historicoPadraoPayload, { onConflict: 'proprietario_id, tipo_registro' });
        
      if (historicoError) throw historicoError;

      showSuccess('Configurações de Contas a Receber salvas com sucesso!');
      fetchConfig();
    } catch (error: any) {
      showError(`Falha ao salvar configurações: ${error.message}`);
    }
  };

  if (!isAdmin) {
    return <p className="text-red-500">Acesso negado. Apenas administradores podem gerenciar esta configuração.</p>;
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
                  // Para Patrimonial, queremos contas marcadas como Patrimonial E/OU Contas a Receber
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
                                    onValueChange={field.onChange} 
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
        
        <Separator />
        
        {/* Histórico Padrão */}
        <FormField
            control={form.control}
            name="historico_padrao_id"
            render={({ field }) => (
                <FormItem>
                    <FormLabel>Histórico Padrão (Recebimento)</FormLabel>
                    <Select 
                        onValueChange={field.onChange} 
                        value={field.value || "null"}
                    >
                        <FormControl>
                            <SelectTrigger>
                                <SelectValue placeholder="Selecione o Histórico Padrão" />
                            </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            <SelectItem value="null">Nenhum (Não Mapear)</SelectItem>
                            {historicos.map(h => (
                                <SelectItem key={h.id} value={h.id}>
                                    {h.codigo && `[${h.codigo}] `}{h.descricao}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <FormMessage />
                    <p className="text-xs text-muted-foreground">
                        Este histórico será sugerido automaticamente ao registrar um recebimento manual.
                    </p>
                </FormItem>
            )}
        />
        
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar Mapeamento Contábil
        </Button>
      </form>
    </Form>
  );
};

export default FormConfiguracoesCR;