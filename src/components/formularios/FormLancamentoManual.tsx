import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useSessao } from '@/hooks/use-sessao';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { PlanoContas } from '@/types/plano-contas';
import { Historico } from '@/types/historico';
import { format } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Calendar } from '../ui/calendar';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ptBR } from 'date-fns/locale';
import { SaldoContaDetalhada } from '@/types/saldo-conta';
import { useContabilConfig } from '@/hooks/use-contabil-config';
import { Checkbox } from '../ui/checkbox';

const formSchema = z.object({
  data_movimentacao: z.date({ required_error: 'A data é obrigatória.' }),
  conta_debito_id: z.string().uuid('Selecione a conta de Débito.'),
  conta_credito_id: z.string().uuid('Selecione a conta de Crédito.'),
  valor: z.coerce.number().positive('O valor deve ser maior que zero.'),
  historico_id: z.string().uuid('Selecione um histórico válido.').nullable(),
  descricao_complementar: z.string().optional().or(z.literal('')),
  
  // NOVO CAMPO: Conta de Saldo (para Débito)
  conta_saldo_debito_id: z.string().uuid('Selecione a conta de saldo de Débito.').optional().nullable(),
});

type FormValues = z.infer<typeof formSchema>;

interface FormLancamentoManualProps {
  onSaveComplete: () => void;
}

const FormLancamentoManual: React.FC<FormLancamentoManualProps> = ({ onSaveComplete }) => {
  const { usuario } = useSessao();
  const { configMap } = useContabilConfig();
  const [contasAnaliticas, setContasAnaliticas] = useState<PlanoContas[]>([]);
  const [contasSaldo, setContasSaldo] = useState<SaldoContaDetalhada[]>([]);
  const [historicos, setHistoricos] = useState<Historico[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const ownerId = usuario?.id;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      data_movimentacao: new Date(),
      conta_debito_id: undefined,
      conta_credito_id: undefined,
      valor: undefined,
      historico_id: null,
      descricao_complementar: '',
      conta_saldo_debito_id: null,
    },
  });
  
  const contaDebitoId = form.watch('conta_debito_id');
  const contaCreditoId = form.watch('conta_credito_id');

  const fetchContasEHistoricos = useCallback(async () => {
    if (!ownerId) return;
    setLoadingData(true);
    
    try {
      // 1. Buscar Contas Analíticas (Plano de Contas)
      const { data: contasData, error: contasError } = await supabase
        .from('plano_contas')
        .select('id, Conta, Descricao, Analitica, is_conta_caixa_banco')
        .eq('proprietario_id', ownerId)
        .eq('Analitica', 'Sim')
        .order('Conta');
        
      if (contasError) throw contasError;
      setContasAnaliticas(contasData as PlanoContas[]);
      
      // 2. Buscar Contas de Saldo (Caixa/Banco/Patrimonial)
      const { data: saldosData, error: saldosError } = await supabase
        .from('saldo_contas')
        .select(`*, plano_contas ( id, Conta, Descricao, is_conta_caixa_banco )`)
        .eq('proprietario_id', ownerId)
        .order('nome');
        
      if (saldosError) throw saldosError;
      setContasSaldo(saldosData as SaldoContaDetalhada[]);
      
      // 3. Buscar Históricos
      const { data: hData, error: hError } = await supabase
        .from('historicos')
        .select('id, descricao, codigo')
        .eq('proprietario_id', ownerId)
        .order('descricao');
        
      if (hError) throw hError;
      setHistoricos(hData as Historico[]);

    } catch (error: any) {
      showError('Falha ao carregar dados: ' + error.message);
    } finally {
      setLoadingData(false);
    }
  }, [ownerId]);

  useEffect(() => {
    if (ownerId) {
      fetchContasEHistoricos();
    }
  }, [ownerId, fetchContasEHistoricos]);
  
  // NOVO: Verifica se a conta de Débito é um Caixa/Banco
  const isDebitoCaixaBanco = useMemo(() => {
      const conta = contasAnaliticas.find(c => c.id === contaDebitoId);
      const prefix = conta?.Conta.split('.')[0];
      return prefix === (configMap.Ativo || '1') && conta?.is_conta_caixa_banco;
  }, [contasAnaliticas, contaDebitoId, configMap.Ativo]);

  const onSubmit = async (values: FormValues) => {
    if (!ownerId) { showError('ID do proprietário não encontrado.'); return; }
    if (values.conta_debito_id === values.conta_credito_id) {
        showError('As contas de Débito e Crédito devem ser diferentes.');
        return;
    }
    
    const contaDebito = contasAnaliticas.find(c => c.id === values.conta_debito_id);
    
    if (!contaDebito) {
        showError('Conta de Débito selecionada não é válida.');
        return;
    }
    
    // Validação: Se for Débito em Caixa/Banco, a conta de saldo deve ser selecionada
    if (isDebitoCaixaBanco && !values.conta_saldo_debito_id) {
        showError('Selecione a Conta de Saldo (Caixa/Banco) para o lançamento de Débito.');
        return;
    }

    setIsSubmitting(true);
    
    const dataMovimentacao = format(values.data_movimentacao, 'yyyy-MM-dd') + 'T12:00:00Z';
    
    try {
        // 1. Chamar a função RPC para inserção atômica
        const { data, error: rpcError } = await supabase.rpc('insert_manual_lancamentos', {
            p_proprietario_id: ownerId,
            p_data_movimentacao: dataMovimentacao,
            p_conta_debito_id: values.conta_debito_id,
            p_conta_credito_id: values.conta_credito_id,
            p_valor: values.valor,
            p_historico_id: values.historico_id,
            p_descricao_complementar: values.descricao_complementar,
            p_conta_saldo_debito_id: isDebitoCaixaBanco ? values.conta_saldo_debito_id : null,
        });
        
        if (rpcError) throw rpcError;
        
        const result = data?.[0];
        
        if (result && !result.success) {
            throw new Error(result.message);
        }
        
        showSuccess(`Lançamento de ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(values.valor)} registrado com sucesso!`);
        
        // Resetar formulário (mantendo a data e o histórico)
        form.reset({
            data_movimentacao: values.data_movimentacao,
            conta_debito_id: undefined,
            conta_credito_id: undefined,
            valor: undefined,
            historico_id: values.historico_id, 
            descricao_complementar: '',
            conta_saldo_debito_id: null,
        });
        
        onSaveComplete();
        
    } catch (error: any) {
        showError('Falha ao registrar lançamento: ' + error.message);
    } finally {
        setIsSubmitting(false);
    }
  };

  if (loadingData) {
    return <div className="flex justify-center items-center h-40"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  
  const isFormValid = form.formState.isValid;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        
        <FormField control={form.control} name="data_movimentacao" render={({ field }) => (
            <FormItem className="flex flex-col">
                <FormLabel>Data do Lançamento</FormLabel>
                <Popover>
                    <PopoverTrigger asChild>
                        <FormControl>
                            <Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                                {field.value ? format(field.value, "PPP", { locale: ptBR }) : <span>Escolha a data</span>}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                        </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus locale={ptBR} />
                    </PopoverContent>
                </Popover>
                <FormMessage />
            </FormItem>
        )} />
        
        <div className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="conta_debito_id" render={({ field }) => (
                <FormItem>
                    <FormLabel>Conta Contábil Débito (D)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || undefined}>
                        <FormControl>
                            <SelectTrigger className="text-red-600">
                                <SelectValue placeholder="Selecione a conta de Débito" />
                            </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            {contasAnaliticas.map(c => (
                                <SelectItem key={c.id} value={c.id}>
                                    {c.Conta} - {c.Descricao}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <FormMessage />
                </FormItem>
            )} />
            
            <FormField control={form.control} name="conta_credito_id" render={({ field }) => (
                <FormItem>
                    <FormLabel>Conta Contábil Crédito (C)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || undefined}>
                        <FormControl>
                            <SelectTrigger className="text-green-600">
                                <SelectValue placeholder="Selecione a conta de Crédito" />
                            </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            {contasAnaliticas.map(c => (
                                <SelectItem key={c.id} value={c.id}>
                                    {c.Conta} - {c.Descricao}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <FormMessage />
                </FormItem>
            )} />
        </div>
        
        {/* NOVO CAMPO: Seleção de Conta de Saldo (Apenas se Débito for Caixa/Banco) */}
        {isDebitoCaixaBanco && (
            <FormField control={form.control} name="conta_saldo_debito_id" render={({ field }) => (
                <FormItem>
                    <FormLabel>Conta de Saldo (Caixa/Banco) - Onde o dinheiro entrou</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || undefined}>
                        <FormControl>
                            <SelectTrigger className="border-blue-500">
                                <SelectValue placeholder="Selecione a conta de saldo" />
                            </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            {contasSaldo
                                .filter(c => c.conta_contabil_id === contaDebitoId)
                                .map(c => (
                                    <SelectItem key={c.id} value={c.id}>
                                        {c.nome}
                                    </SelectItem>
                                ))}
                        </SelectContent>
                    </Select>
                    <FormMessage />
                    {contasSaldo.filter(c => c.conta_contabil_id === contaDebitoId).length === 0 && (
                        <p className="text-xs text-red-500">
                            Nenhuma conta de saldo vinculada à conta contábil de Débito.
                        </p>
                    )}
                </FormItem>
            )} />
        )}
        
        <FormField control={form.control} name="valor" render={({ field }) => (
            <FormItem>
                <FormLabel>Valor (R$)</FormLabel>
                <FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} /></FormControl>
                <FormMessage />
            </FormItem>
        )} />
        
        <FormField control={form.control} name="historico_id" render={({ field }) => (
            <FormItem>
                <FormLabel>Histórico (Opcional)</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || undefined}>
                    <FormControl>
                        <SelectTrigger>
                            <SelectValue placeholder="Selecione o histórico" />
                        </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                        <SelectItem value={null as any}>Nenhum</SelectItem>
                        {historicos.map(h => (
                            <SelectItem key={h.id} value={h.id}>
                                {h.codigo && `[${h.codigo}] `}{h.descricao}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <FormMessage />
            </FormItem>
        )} />
        
        <FormField control={form.control} name="descricao_complementar" render={({ field }) => (
            <FormItem>
                <FormLabel>Descrição Complementar</FormLabel>
                <FormControl><Input placeholder="Detalhes adicionais do lançamento" {...field} /></FormControl>
                <FormMessage />
            </FormItem>
        )} />
        
        <Button type="submit" className="w-full" disabled={isSubmitting || !isFormValid}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <Save className="mr-2 h-4 w-4" /> Registrar Lançamento
        </Button>
      </form>
    </Form>
  );
};

export default FormLancamentoManual;