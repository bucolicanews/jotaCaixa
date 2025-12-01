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

// Tipos de registro que precisam de mapeamento contábil para CP
const TIPOS_REGISTRO_CONTABIL = [
  { key: 'a_pagar', label: 'Contas a Pagar (Sintético)', tipo: 'Patrimonial' }, // NOVO TIPO
  { key: 'parcela_pagar', label: 'Parcelas a Pagar (Analítico)', tipo: 'Patrimonial' }, // NOVO TIPO
  { key: 'pagamento', label: 'Pagamentos (Saída)', tipo: 'Resultado' }, // NOVO TIPO
  { key: 'desconto_obtido', label: 'Descontos Obtidos (Receita)', tipo: 'Resultado' }, // NOVO TIPO
  { key: 'estorno_desconto_obtido', label: 'Estorno Desconto Obtido (Despesa)', tipo: 'Resultado' }, // NOVO CAMPO CRÍTICO
];

// Esquema dinâmico para garantir que todos os campos estejam presentes
const formSchema = z.object({
  a_pagar: z.string().uuid('Conta inválida para Contas a Pagar.').nullable(),
  parcela_pagar: z.string().uuid('Conta inválida para Parcelas a Pagar.').nullable(),
  pagamento: z.string().uuid('Conta inválida para Pagamentos.').nullable(),
  desconto_obtido: z.string().uuid('Conta inválida para Descontos Obtidos.').nullable(),
  estorno_desconto_obtido: z.string().uuid('Conta inválida para Estorno de Desconto.').nullable(), // NOVO CAMPO
  historico_padrao_id: z.string().uuid('Histórico inválido.').nullable(),
});

type FormValues = z.infer<typeof formSchema>;

const FormConfiguracoesCP: React.FC = () => {
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
      a_pagar: null,
      parcela_pagar: null,
      pagamento: null,
      desconto_obtido: null,
      estorno_desconto_obtido: null, // NOVO DEFAULT
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
      .from('configuracao_contas_pagar')
      .select('tipo_registro, conta_contabil_id')
      .eq('proprietario_id', adminId);
      
    // 2. Buscar Histórico Padrão (da nova tabela)
    const { data: historicoData } = await supabase
        .from('configuracao_historico_padrao')
        .select('historico_id')
        .eq('proprietario_id', adminId)
        .eq('tipo_registro', 'pagamento_padrao')
        .limit(1)
        .single();

    if (contasError) {
      showError('Erro ao carregar configurações de CP: ' + contasError.message);
    } else if (contasData) {
      const mappedData = contasData.reduce((acc: Partial<FormValues>, item: { tipo_registro: string, conta_contabil_id: string | null }) => {
        acc[item.tipo_registro as keyof FormValues] = item.conta_contabil_id;
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
    
    const dataToUpsertContabil = TIPOS_REGISTRO_CONTABIL.map(tipo => ({
        proprietario_id: adminId,
        tipo_registro: tipo.key,
        conta_contabil_id: values[tipo.key as keyof FormValues] || null,
    }));
    
    const historicoPadraoPayload = {
        proprietario_id: adminId,
        tipo_registro: 'pagamento_padrao',
        historico_id: values.historico_padrao_id || null,
    };

    try {
      // 1. Salvar Mapeamento Contábil
      const { error: contabilError } = await supabase
        .from('configuracao_contas_pagar')
        .upsert(dataToUpsertContabil, { onConflict: 'proprietario_id, tipo_registro' });
        
      if (contabilError) throw contabilError;
      
      // 2. Salvar Histórico Padrão na nova tabela
      const { error: historicoError } = await supabase
        .from('configuracao_historico_padrao')
        .upsert(historicoPadraoPayload, { onConflict: 'proprietario_id, tipo_registro' });
        
      if (historicoError) throw historicoError;

      showSuccess('Configurações de Contas a Pagar salvas com sucesso!');
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
  
  const getContasDisponiveis = (tipo: 'Patrimonial' | 'Resultado') => {
      return contasContabeis
          .filter(c => c.Analitica === 'Sim' && (tipo === 'Patrimonial' ? c.is_conta_patrimonial : c.is_conta_resultado))
          .map(c => ({
              id: c.id,
              display: `${c.Conta} - ${c.Descricao}`,
          }));
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <p className="text-sm text-muted-foreground">
            Mapeie cada tipo de transação de Contas a Pagar para a conta contábil correspondente.
        </p>
        
        <Separator />
        
        <div className="space-y-4">
            {TIPOS_REGISTRO_CONTABIL.map(tipo => (
                <FormField
                    key={tipo.key}
                    control={form.control}
                    name={tipo.key as keyof FormValues}
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{tipo.label} ({tipo.tipo})</FormLabel>
                            <Select 
                                onValueChange={field.onChange} 
                                value={field.value || undefined}
                            >
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder={`Selecione a conta ${tipo.tipo}`} />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem value={null as any}>Nenhum</SelectItem>
                                    {getContasDisponiveis(tipo.tipo as 'Patrimonial' | 'Resultado').map(c => (
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
        </div>
        
        <Separator />
        
        {/* Histórico Padrão */}
        <FormField
            control={form.control}
            name="historico_padrao_id"
            render={({ field }) => (
                <FormItem>
                    <FormLabel>Histórico Padrão (Pagamento)</FormLabel>
                    <Select 
                        onValueChange={field.onChange} 
                        value={field.value || undefined}
                    >
                        <FormControl>
                            <SelectTrigger>
                                <SelectValue placeholder="Selecione o Histórico Padrão" />
                            </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            <SelectItem value={null as any}>Nenhum (Não Mapear)</SelectItem>
                            {historicos.map(h => (
                                <SelectItem key={h.id} value={h.id}>
                                    {h.codigo && `[${h.codigo}] `}{h.descricao}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <FormMessage />
                    <p className="text-xs text-muted-foreground">
                        Este histórico será sugerido automaticamente ao registrar um pagamento manual.
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

export default FormConfiguracoesCP;