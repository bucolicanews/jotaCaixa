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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { PlanoContas } from '@/types/plano-contas';
import { Historico } from '@/types/historico';
import { useSessao } from '@/hooks/use-sessao';
import { format } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Calendar } from '../ui/calendar';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ptBR } from 'date-fns/locale';

// Interface para o lançamento (baseado na tabela lancamentos)
interface LancamentoGeral {
    id: string;
    data_movimentacao: string;
    descricao: string;
    valor: number;
    tipo: 'Entrada' | 'Saida';
    conta_bancaria_id: string | null;
    conta_contabil_id: string | null;
    historico_id: string | null;
    documento: string | null;
    origem: string;
}
export type { LancamentoGeral };

const formSchema = z.object({
  data_movimentacao: z.date({ required_error: 'A data é obrigatória.' }),
  descricao: z.string().min(1, 'A descrição é obrigatória.'),
  valor: z.coerce.number().positive('O valor deve ser maior que zero.'),
  tipo: z.enum(['Entrada', 'Saida']),
  conta_contabil_id: z.string().uuid('Selecione uma conta contábil válida.').nullable(),
  historico_id: z.string().uuid('Selecione um histórico válido.').nullable(),
  documento: z.string().optional().nullable(),
});

type FormValues = z.infer<typeof formSchema>;

interface FormLancamentoGeralProps {
  lancamentoInicial: LancamentoGeral;
  onSaveComplete: () => void;
}

const FormLancamentoGeral: React.FC<FormLancamentoGeralProps> = ({ lancamentoInicial, onSaveComplete }) => {
  const { usuario } = useSessao();
  const [historicos, setHistoricos] = useState<Historico[]>([]);
  const [contasContabeis, setContasContabeis] = useState<PlanoContas[]>([]);
  const [loadingDeps, setLoadingDeps] = useState(true);
  
  const ownerId = usuario?.id;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      data_movimentacao: new Date(lancamentoInicial.data_movimentacao),
      descricao: lancamentoInicial.descricao,
      valor: Math.abs(lancamentoInicial.valor),
      tipo: lancamentoInicial.tipo,
      conta_contabil_id: lancamentoInicial.conta_contabil_id || null,
      historico_id: lancamentoInicial.historico_id || null,
      documento: lancamentoInicial.documento || null,
    },
  });

  const fetchDependencies = useCallback(async () => {
    if (!ownerId) return;
    setLoadingDeps(true);
    
    const [historicosRes, contasRes] = await Promise.all([
        supabase.from('historicos').select('id, descricao, codigo').eq('proprietario_id', ownerId).order('descricao'),
        // Busca todas as contas analíticas (Patrimonial e Resultado)
        supabase.from('plano_contas').select('id, Conta, Descricao').eq('proprietario_id', ownerId).eq('Analitica', 'Sim').or('is_conta_patrimonial.eq.true,is_conta_resultado.eq.true').order('Conta'),
    ]);
    
    if (historicosRes.error) console.error('Erro ao carregar históricos:', historicosRes.error);
    else setHistoricos(historicosRes.data as Historico[]);
    
    if (contasRes.error) console.error('Erro ao carregar contas contábeis:', contasRes.error);
    else setContasContabeis(contasRes.data as PlanoContas[]);
    
    setLoadingDeps(false);
  }, [ownerId]);

  useEffect(() => {
      fetchDependencies();
  }, [fetchDependencies]);

  const onSubmit = async (values: FormValues) => {
    if (!ownerId) return;

    setIsSubmitting(true);
    
    // O valor na tabela `lancamentos` é sempre positivo, e o `tipo` define se é Débito/Crédito.
    const valorAbsoluto = Math.abs(values.valor); 
    
    const dataToUpdate = {
        id: lancamentoInicial.id,
        // CORREÇÃO: Garante que a data seja salva no formato ISO com hora (para evitar problemas de fuso)
        data_movimentacao: format(values.data_movimentacao, 'yyyy-MM-dd') + 'T12:00:00Z', 
        descricao: values.descricao,
        valor: valorAbsoluto,
        tipo: values.tipo,
        conta_contabil_id: values.conta_contabil_id || null,
        historico_id: values.historico_id || null,
        documento: values.documento || null,
        atualizado_em: new Date().toISOString(),
    };

    try {
      const { error } = await supabase
        .from('lancamentos')
        .update(dataToUpdate)
        .eq('id', lancamentoInicial.id);

      if (error) throw error;

      showSuccess('Lançamento atualizado com sucesso!');
      onSaveComplete();
    } catch (error: any) {
      showError(`Falha ao salvar lançamento: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const { isSubmitting } = form.formState;

  if (loadingDeps) {
    return <div className="flex justify-center items-center h-40"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        
        <div className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="data_movimentacao" render={({ field }) => (
                <FormItem className="flex flex-col">
                    <FormLabel>Data da Movimentação</FormLabel>
                    <Popover>
                        <PopoverTrigger asChild>
                            <FormControl>
                                <Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                                    {field.value ? format(field.value, "dd/MM/yyyy") : <span>Data</span>}
                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                            </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus locale={ptBR} /></PopoverContent>
                    </Popover>
                    <FormMessage />
                </FormItem>
            )} />
            
            <FormField control={form.control} name="tipo" render={({ field }) => (
                <FormItem><FormLabel>Tipo</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                            <SelectItem value="Entrada">Entrada</SelectItem>
                            <SelectItem value="Saida">Saída</SelectItem>
                        </SelectContent>
                    </Select>
                    <FormMessage />
                </FormItem>
            )} />
        </div>
        
        <FormField control={form.control} name="descricao" render={({ field }) => (
            <FormItem><FormLabel>Descrição</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        
        <div className="grid grid-cols-2 gap-4">
            <FormField control={form.control} name="valor" render={({ field }) => (
                <FormItem><FormLabel>Valor (Absoluto)</FormLabel><FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="documento" render={({ field }) => (
                <FormItem><FormLabel>Documento (Opcional)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
        </div>
        
        <FormField control={form.control} name="conta_contabil_id" render={({ field }) => (
            <FormItem>
                <FormLabel>Conta Contábil (Partida Dobrada)</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || undefined}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione a conta contábil" /></SelectTrigger></FormControl>
                    <SelectContent>
                        <SelectItem value={null as any}>Nenhum</SelectItem>
                        {contasContabeis.map(c => (
                            <SelectItem key={c.id} value={c.id}>
                                {c.Conta} - {c.Descricao}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <FormMessage />
            </FormItem>
        )} />
        
        <FormField control={form.control} name="historico_id" render={({ field }) => (
            <FormItem>
                <FormLabel>Histórico (Opcional)</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || undefined}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione o histórico" /></SelectTrigger></FormControl>
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

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <Save className="mr-2 h-4 w-4" /> Salvar Alterações
        </Button>
      </form>
    </Form>
  );
};

export default FormLancamentoGeral;