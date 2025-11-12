import React, { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, Loader2, PlusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { AdminContaPagar } from '@/types/contas-pagar';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '../ui/separator';
import { useSessao } from '@/hooks/use-sessao';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Historico } from '@/types/historico';
import { PlanoContas } from '@/types/plano-contas'; // Importando PlanoContas
import { useContabilConfig } from '@/hooks/use-contabil-config'; // NOVO IMPORT

const formSchema = z.object({
  fornecedor: z.string().min(1, 'O nome do fornecedor é obrigatório.'),
  descricao: z.string().min(1, 'A descrição é obrigatória.'),
  
  tipo_lancamento: z.enum(['unico', 'repetir', 'parcelar'], { required_error: 'Selecione o tipo de lançamento.' }),
  valor: z.coerce.number().positive('O valor deve ser maior que zero.'),
  
  data_vencimento: z.date().optional(),
  numero_parcelas: z.coerce.number().int().min(1).optional(),
  data_primeiro_vencimento: z.date().optional(),
  intervalo_dias: z.coerce.number().int().min(1).optional(),
  
  historico_id: z.string().uuid('Selecione um histórico válido.').nullable(),
  novo_historico: z.string().optional(),
  
  // NOVO CAMPO: Conta Contábil de Despesa/Custo
  conta_contabil_id: z.string().uuid('Selecione uma conta contábil de despesa/custo válida.').nullable(),

}).superRefine((data, ctx) => {
  if (data.tipo_lancamento === 'unico' && !data.data_vencimento) {
    ctx.addIssue({ code: 'custom', message: 'A data de vencimento é obrigatória.', path: ['data_vencimento'] });
  }
  if (data.tipo_lancamento !== 'unico') {
    if (!data.numero_parcelas || data.numero_parcelas < 1) ctx.addIssue({ code: 'custom', message: 'Informe um número de parcelas válido.', path: ['numero_parcelas'] });
    if (!data.data_primeiro_vencimento) ctx.addIssue({ code: 'custom', message: 'A data do primeiro vencimento é obrigatória.', path: ['data_primeiro_vencimento'] });
    if (!data.intervalo_dias || data.intervalo_dias < 1) ctx.addIssue({ code: 'custom', message: 'Informe um intervalo de dias válido.', path: ['intervalo_dias'] });
  }
});

type FormValues = z.infer<typeof formSchema>;

interface FormContasPagarProps {
  contaInicial?: AdminContaPagar | null;
  onSaveComplete: () => void;
}

const FormContasPagar: React.FC<FormContasPagarProps> = ({ contaInicial, onSaveComplete }) => {
  const { usuario, role } = useSessao();
  const { configMap } = useContabilConfig(); // USANDO HOOK DE CONFIGURAÇÃO
  const [mapeamentoContabil, setMapeamentoContabil] = useState<Record<string, string | null>>({});
  const [historicos, setHistoricos] = useState<Historico[]>([]);
  const [contasDespesa, setContasDespesa] = useState<PlanoContas[]>([]);
  const [loadingContasDespesa, setLoadingContasDespesa] = useState(true);
  const [isCreatingHistorico, setIsCreatingHistorico] = useState(false);
  const isEditing = !!contaInicial;

  const isAdmin = role === 'Admin';
  const adminId = usuario?.id;

  const fetchMapeamentoContabil = useCallback(async () => {
    if (!isAdmin || !adminId) return;
    
    const { data, error } = await supabase
        .from('configuracao_contas_pagar')
        .select('tipo_registro, conta_contabil_id')
        .eq('proprietario_id', adminId);
        
    if (error) {
        console.error('Erro ao buscar mapeamento contábil CP:', error);
        setMapeamentoContabil({});
    } else {
        const map = (data as { tipo_registro: string, conta_contabil_id: string | null }[]).reduce((acc, item) => {
            acc[item.tipo_registro] = item.conta_contabil_id;
            return acc;
        }, {} as Record<string, string | null>);
        setMapeamentoContabil(map);
    }
  }, [isAdmin, adminId]);
  
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
  
  const fetchContasDespesa = useCallback(async () => {
    if (!adminId) return;
    setLoadingContasDespesa(true);
    
    const custoCode = configMap.Custo || '4';
    const despesaCode = configMap.Despesa || '5';
    
    // Busca contas de Custo/Despesa (código configurado)
    const { data, error } = await supabase
        .from('plano_contas')
        .select('id, Conta, Descricao')
        .eq('proprietario_id', adminId)
        .eq('Analitica', 'Sim')
        .eq('is_conta_resultado', true)
        .or(`Conta.like.${custoCode}.%,Conta.like.${despesaCode}.%`) // FILTRO DINÂMICO
        .order('Conta');
        
    if (error) {
        showError('Erro ao carregar contas de despesa/custo: ' + error.message);
        setContasDespesa([]);
    } else {
        setContasDespesa(data as PlanoContas[]);
    }
    setLoadingContasDespesa(false);
  }, [adminId, configMap.Custo, configMap.Despesa]);

  useEffect(() => {
    if (isAdmin) {
        fetchMapeamentoContabil();
    }
    if (adminId) {
        fetchHistoricos();
        fetchContasDespesa();
    }
  }, [isAdmin, adminId, fetchMapeamentoContabil, fetchHistoricos, fetchContasDespesa]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fornecedor: contaInicial?.fornecedor || '',
      descricao: contaInicial?.descricao || '',
      tipo_lancamento: 'unico',
      valor: contaInicial?.valor_total || undefined,
      data_vencimento: contaInicial?.data_vencimento ? new Date(contaInicial.data_vencimento + 'T00:00:00') : undefined,
      numero_parcelas: 1,
      intervalo_dias: 30,
      historico_id: contaInicial?.historico_id || null,
      novo_historico: '',
      conta_contabil_id: contaInicial?.id_conta_contabil || null,
    },
  });
  
  const { isSubmitting } = form.formState;
  const tipoLancamento = form.watch('tipo_lancamento');
  const novoHistoricoValue = form.watch('novo_historico');
  
  const handleCreateHistorico = async () => {
    if (!novoHistoricoValue || !adminId) return;
    
    setIsCreatingHistorico(true);
    try {
        const { data, error } = await supabase
            .from('historicos')
            .insert({ proprietario_id: adminId, descricao: novoHistoricoValue })
            .select('id, descricao, codigo')
            .single();
            
        if (error) throw error;
        
        showSuccess('Histórico criado e selecionado!');
        fetchHistoricos();
        form.setValue('historico_id', data.id);
        form.setValue('novo_historico', '');
        setIsCreatingHistorico(false);
        
    } catch (error: any) {
        showError('Falha ao criar histórico: ' + error.message);
        setIsCreatingHistorico(false);
    }
  };

  const onSubmit = async (values: FormValues) => {
    if (!adminId) { showError('ID do administrador não pôde ser determinado.'); return; }
    
    // Contas Contábeis Mapeadas
    const contaParcelaPagar = isAdmin ? mapeamentoContabil['parcela_pagar'] : null;
    
    try {
      // 1. Calcular valores e parcelas
      let valorTotal: number;
      let parcelasParaInserir = [];

      if (values.tipo_lancamento === 'unico') {
        valorTotal = values.valor;
        parcelasParaInserir.push({ numero_parcela: 1, valor_parcela: values.valor, data_vencimento: format(values.data_vencimento!, 'yyyy-MM-dd'), status: 'aberta' });
      } else {
        const { numero_parcelas, data_primeiro_vencimento, intervalo_dias, valor } = values;
        const valorParcela = values.tipo_lancamento === 'parcelar' ? (valor / numero_parcelas!) : valor;
        valorTotal = values.tipo_lancamento === 'parcelar' ? valor : (valor * numero_parcelas!);
        for (let i = 0; i < numero_parcelas!; i++) {
          parcelasParaInserir.push({ numero_parcela: i + 1, valor_parcela: valorParcela, data_vencimento: format(addDays(data_primeiro_vencimento!, i * intervalo_dias!), 'yyyy-MM-dd'), status: 'aberta' });
        }
      }
      
      let contaPagarId: string;
      const tabelaContasPagar = 'admin_contas_pagar';
      const tabelaParcelasPagar = 'admin_parcelas_pagar';
      
      const contaPagarPayload = {
          admin_id: adminId,
          fornecedor: values.fornecedor,
          descricao: values.descricao,
          valor_total: valorTotal,
          data_vencimento: parcelasParaInserir[0].data_vencimento,
          status: 'pendente',
          origem: 'manual',
          id_conta_contabil: values.conta_contabil_id,
          historico_id: values.historico_id,
      };

      if (isEditing && contaInicial) {
        const { data, error } = await supabase.from(tabelaContasPagar).update(contaPagarPayload).eq('id', contaInicial.id).select('id').single();
        if (error) throw error;
        contaPagarId = data.id;
        
        const { error: deleteError } = await supabase.from(tabelaParcelasPagar).delete().eq('conta_pagar_id', contaPagarId);
        if (deleteError) throw deleteError;
      } else {
        const { data, error } = await supabase.from(tabelaContasPagar).insert(contaPagarPayload).select('id').single();
        if (error) throw error;
        contaPagarId = data.id;
      }

      const parcelasComId = parcelasParaInserir.map(p => ({ 
          ...p, 
          conta_pagar_id: contaPagarId, 
          admin_id: adminId,
          id_conta_contabil: contaParcelaPagar,
      }));
      
      const { error: parcelError } = await supabase.from(tabelaParcelasPagar).insert(parcelasComId);
      if (parcelError) throw parcelError;

      showSuccess(`Conta ${isEditing ? 'atualizada' : 'salva'} com sucesso!`);
      onSaveComplete();
    } catch (error: any) {
      showError(`Falha ao salvar: ${error.message}`);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField control={form.control} name="fornecedor" render={({ field }) => (
          <FormItem><FormLabel>1. Fornecedor</FormLabel><FormControl><Input placeholder="Ex: Fornecedor X" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <Separator />
        <FormField control={form.control} name="descricao" render={({ field }) => (
          <FormItem><FormLabel>2. Descrição do Lançamento</FormLabel><FormControl><Input placeholder="Ex: Compra de material de escritório" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <Separator />
        
        {/* NOVO CAMPO: Conta Contábil de Despesa/Custo */}
        <FormField
            control={form.control}
            name="conta_contabil_id"
            render={({ field }) => (
                <FormItem>
                    <FormLabel>3. Conta Contábil de Despesa/Custo (DRE)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || undefined} disabled={loadingContasDespesa}>
                        <FormControl>
                            <SelectTrigger>
                                <SelectValue placeholder={loadingContasDespesa ? "Carregando Contas..." : `Selecione a conta de Despesa/Custo (${configMap.Custo}.x.x ou ${configMap.Despesa}.x.x)`} />
                            </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            <SelectItem value={null as any}>Nenhum (Não Mapear)</SelectItem>
                            {contasDespesa.map(c => (
                                <SelectItem key={c.id} value={c.id}>
                                    {c.Conta} - {c.Descricao}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <FormMessage />
                    {contasDespesa.length === 0 && (
                        <p className="text-sm text-red-500">
                            Nenhuma conta de Despesa/Custo ({configMap.Custo}.x.x ou {configMap.Despesa}.x.x) marcada como "Conta de Resultado" no Plano de Contas.
                        </p>
                    )}
                </FormItem>
            )}
        />
        <Separator />
        
        {/* NOVO CAMPO: Histórico */}
        <div className="space-y-2">
            <FormLabel>4. Histórico (Opcional)</FormLabel>
            <div className="flex space-x-2">
                <FormField
                    control={form.control}
                    name="historico_id"
                    render={({ field }) => (
                        <FormItem className="flex-1">
                            <Select onValueChange={field.onChange} value={field.value || undefined} disabled={isCreatingHistorico}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecione um histórico pré-cadastrado" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem value={null as any}>Nenhum</SelectItem>
                                    {historicos.map(h => (
                                        <SelectItem key={h.id} value={h.id}>
                                            {h.codigo && <span className="font-mono text-xs mr-2">[{h.codigo}]</span>}
                                            {h.descricao}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <Button type="button" variant="outline" size="icon" onClick={() => setIsCreatingHistorico(prev => !prev)} title="Criar Novo Histórico">
                    <PlusCircle className="w-4 h-4" />
                </Button>
            </div>
            {isCreatingHistorico && (
                <div className="flex space-x-2 pt-2">
                    <FormField control={form.control} name="novo_historico" render={({ field }) => (
                        <FormItem className="flex-1">
                            <FormControl><Input placeholder="Novo Histórico" {...field} disabled={isSubmitting} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <Button type="button" onClick={handleCreateHistorico} disabled={isSubmitting || !novoHistoricoValue}>
                        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Criar'}
                    </Button>
                </div>
            )}
        </div>
        <Separator />
        
        <div className="space-y-4">
          <FormLabel>5. Detalhes do Pagamento</FormLabel>
          <FormField control={form.control} name="tipo_lancamento" render={({ field }) => (
            <FormItem><FormControl><RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex space-x-4 pt-2"><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="unico" /></FormControl><FormLabel className="font-normal">Único</FormLabel></FormItem><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="repetir" /></FormControl><FormLabel className="font-normal">Repetir Valor</FormLabel></FormItem><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="parcelar" /></FormControl><FormLabel className="font-normal">Parcelar Valor</FormLabel></FormItem></RadioGroup></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="valor" render={({ field }) => (
            <FormItem><FormLabel>{tipoLancamento === 'parcelar' ? 'Valor Total a Parcelar' : 'Valor da Parcela'}</FormLabel><FormControl><Input type="number" step="0.01" placeholder="0,00" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          {tipoLancamento === 'unico' && <FormField control={form.control} name="data_vencimento" render={({ field }) => (
            <FormItem className="flex flex-col"><FormLabel>Data de Vencimento</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "PPP", { locale: ptBR }) : <span>Escolha uma data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus locale={ptBR} /></PopoverContent></Popover><FormMessage /></FormItem>
          )} />}
          {tipoLancamento !== 'unico' && (
            <div className="grid grid-cols-3 gap-4">
              <FormField control={form.control} name="numero_parcelas" render={({ field }) => (
                <FormItem><FormLabel>Nº de Parcelas</FormLabel><FormControl><Input type="number" placeholder="3" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="intervalo_dias" render={({ field }) => (
                <FormItem><FormLabel>Intervalo (dias)</FormLabel><FormControl><Input type="number" placeholder="30" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="data_primeiro_vencimento" render={({ field }) => (
                <FormItem><FormLabel>1º Vencimento</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("w-full text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "dd/MM/yy") : <span>Data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus locale={ptBR} /></PopoverContent></Popover><FormMessage /></FormItem>
              )} />
            </div>
          )}
        </div>
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? 'Salvar Alterações' : 'Salvar Lançamento'}
        </Button>
      </form>
    </Form>
  );
};

export default FormContasPagar;