import React, { useState, useEffect, useCallback } from 'react';
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

const formSchema = z.object({
  data_movimentacao: z.date({ required_error: 'A data é obrigatória.' }),
  conta_debito_id: z.string().uuid('Selecione a conta de Débito.'),
  conta_credito_id: z.string().uuid('Selecione a conta de Crédito.'),
  valor: z.coerce.number().positive('O valor deve ser maior que zero.'),
  historico_id: z.string().uuid('Selecione um histórico válido.').nullable(),
  descricao_complementar: z.string().optional().or(z.literal('')),
});

type FormValues = z.infer<typeof formSchema>;

interface FormLancamentoManualProps {
  onSaveComplete: () => void;
}

const FormLancamentoManual: React.FC<FormLancamentoManualProps> = ({ onSaveComplete }) => {
  const { usuario } = useSessao();
  const [contasAnaliticas, setContasAnaliticas] = useState<PlanoContas[]>([]);
  const [historicos, setHistoricos] = useState<Historico[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  
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
    },
  });
  
  const contaDebitoId = form.watch('conta_debito_id');
  const contaCreditoId = form.watch('conta_credito_id');

  const fetchContasEHistoricos = useCallback(async () => {
    if (!ownerId) return;
    setLoadingData(true);
    
    try {
      // 1. Buscar Contas Analíticas (Permite Lançamentos)
      const { data: contasData, error: contasError } = await supabase
        .from('plano_contas')
        .select('id, Conta, Descricao, Analitica')
        .eq('proprietario_id', ownerId)
        .eq('Analitica', 'Sim')
        .order('Conta');
        
      if (contasError) throw contasError;
      setContasAnaliticas(contasData as PlanoContas[]);
      
      // 2. Buscar Históricos
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

  const onSubmit = async (values: FormValues) => {
    if (!ownerId) { showError('ID do proprietário não encontrado.'); return; }
    if (values.conta_debito_id === values.conta_credito_id) {
        showError('As contas de Débito e Crédito devem ser diferentes.');
        return;
    }
    
    const contaDebito = contasAnaliticas.find(c => c.id === values.conta_debito_id);
    const contaCredito = contasAnaliticas.find(c => c.id === values.conta_credito_id);
    
    if (!contaDebito || !contaCredito) {
        showError('Contas selecionadas não são válidas.');
        return;
    }

    const isSubmitting = form.formState.isSubmitting;
    if (isSubmitting) return;
    
    form.setValue('data_movimentacao', values.data_movimentacao); // Garante que a data seja salva
    
    const dataMovimentacao = format(values.data_movimentacao, 'yyyy-MM-dd') + 'T12:00:00Z';
    const valor = values.valor;
    const historicoId = values.historico_id;
    const descricaoComplementar = values.descricao_complementar;
    
    // 1. Lançamento de Débito (Entrada)
    const lancamentoDebito = {
        proprietario_id: ownerId,
        data_movimentacao: dataMovimentacao,
        descricao: `D: ${contaDebito.Descricao} - ${descricaoComplementar}`,
        valor: valor,
        tipo: 'Entrada' as const, // Débito é sempre 'Entrada'
        conta_bancaria_id: null,
        conta_contabil_id: values.conta_debito_id,
        origem: 'lancamento_manual',
        historico_id: historicoId,
    };
    
    // 2. Lançamento de Crédito (Saída)
    const lancamentoCredito = {
        proprietario_id: ownerId,
        data_movimentacao: dataMovimentacao,
        descricao: `C: ${contaCredito.Descricao} - ${descricaoComplementar}`,
        valor: valor,
        tipo: 'Saida' as const, // Crédito é sempre 'Saida'
        conta_bancaria_id: null,
        conta_contabil_id: values.conta_credito_id,
        origem: 'lancamento_manual',
        historico_id: historicoId,
    };
    
    // 3. Inserir ambos os lançamentos
    try {
        const [resDebito, resCredito] = await Promise.all([
            supabase.from('lancamentos').insert(lancamentoDebito),
            supabase.from('lancamentos').insert(lancamentoCredito),
        ]);
        
        if (resDebito.error) throw resDebito.error;
        if (resCredito.error) throw resCredito.error;
        
        showSuccess(`Lançamento de ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)} registrado com sucesso!`);
        
        // Resetar formulário
        form.reset({
            data_movimentacao: new Date(),
            conta_debito_id: undefined,
            conta_credito_id: undefined,
            valor: undefined,
            historico_id: values.historico_id, // Mantém o histórico selecionado
            descricao_complementar: '',
        });
        
        onSaveComplete();
        
    } catch (error: any) {
        showError('Falha ao registrar lançamento: ' + error.message);
    }
  };

  if (loadingData) {
    return <div className="flex justify-center items-center h-40"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  
  const getContaDisplay = (id: string | undefined) => {
      const conta = contasAnaliticas.find(c => c.id === id);
      return conta ? `${conta.Conta} - ${conta.Descricao}` : 'Selecione a conta';
  };

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
                    <FormLabel>Conta Débito (D)</FormLabel>
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
                    <FormLabel>Conta Crédito (C)</FormLabel>
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

        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting || !contaDebitoId || !contaCreditoId || !form.watch('valor')}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <Save className="mr-2 h-4 w-4" /> Registrar Lançamento
        </Button>
      </form>
    </Form>
  );
};

export default FormLancamentoManual;