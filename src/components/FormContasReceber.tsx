import React, { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, Loader2, PlusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { ContaReceber } from '@/types/contas-receber';
import { Cliente } from '@/types/cliente';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from './ui/separator';
import { useSessao } from '@/hooks/use-sessao';
import { UsuarioProfile } from '@/types/usuario';
import { Historico } from '@/types/historico'; // Importando Historico

const formSchema = z.object({
  cliente_id: z.string({ required_error: 'Selecione um cliente.' }).uuid('Cliente inválido.'),
  descricao: z.string().min(1, 'A descrição é obrigatória.'),
  
  tipo_lancamento: z.enum(['unico', 'repetir', 'parcelar'], { required_error: 'Selecione o tipo de lançamento.' }),
  valor: z.coerce.number().positive('O valor deve ser maior que zero.'),
  
  data_vencimento: z.date().optional(),
  numero_parcelas: z.coerce.number().int().min(1).optional(),
  data_primeiro_vencimento: z.date().optional(),
  intervalo_dias: z.coerce.number().int().min(1).optional(),
  
  historico_id: z.string().uuid('Selecione um histórico válido.').nullable(), // NOVO CAMPO
  novo_historico: z.string().optional(), // NOVO CAMPO

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

interface FormContasReceberProps {
  contaInicial?: ContaReceber | null;
  onSaveComplete: () => void;
}

interface ClienteCombinado {
  id: string;
  nome: string;
  tipo: 'CR' | 'Sistema';
}

const FormContasReceber: React.FC<FormContasReceberProps> = ({ contaInicial, onSaveComplete }) => {
  const { perfil, role } = useSessao();
  const [clientes, setClientes] = useState<ClienteCombinado[]>([]);
  const [loadingClientes, setLoadingClientes] = useState(true);
  const [mapeamentoContabil, setMapeamentoContabil] = useState<Record<string, string | null>>({});
  const [historicos, setHistoricos] = useState<Historico[]>([]); // NOVO ESTADO
  const [isCreatingHistorico, setIsCreatingHistorico] = useState(false); // NOVO ESTADO
  const isEditing = !!contaInicial;

  const getOwnerId = () => {
    if (role === 'Admin' || role === 'Cliente') return (perfil as any)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id;
    return null;
  };
  
  const ownerId = getOwnerId();
  const isAdmin = role === 'Admin';

  const fetchMapeamentoContabil = useCallback(async () => {
    if (!isAdmin || !ownerId) return;
    
    const { data, error } = await supabase
        .from('configuracao_contas_receber')
        .select('tipo_registro, conta_contabil_id')
        .eq('proprietario_id', ownerId);
        
    if (error) {
        console.error('Erro ao buscar mapeamento contábil:', error);
        setMapeamentoContabil({});
    } else {
        const map = (data as { tipo_registro: string, conta_contabil_id: string | null }[]).reduce((acc, item) => {
            acc[item.tipo_registro] = item.conta_contabil_id;
            return acc;
        }, {} as Record<string, string | null>);
        setMapeamentoContabil(map);
    }
  }, [isAdmin, ownerId]);
  
  const fetchHistoricos = useCallback(async () => {
    if (!ownerId) return;
    const { data, error } = await supabase
        .from('historicos')
        .select('id, descricao')
        .eq('proprietario_id', ownerId)
        .order('descricao');
        
    if (error) {
        console.error('Erro ao carregar históricos:', error);
        setHistoricos([]);
    } else {
        setHistoricos(data as Historico[]);
    }
  }, [ownerId]);

  useEffect(() => {
    const fetchClientes = async () => {
      if (!ownerId) {
        setLoadingClientes(false);
        return;
      }
      setLoadingClientes(true);
      
      let combinedClients: ClienteCombinado[] = [];
      
      if (role === 'Admin') {
          // ADMIN: Busca APENAS Empresas do Sistema (tbl_clientes)
          const { data: dataSistema, error: errorSistema } = await supabase
              .from('tbl_clientes')
              .select('id, nome')
              .eq('aprovado', true)
              .order('nome');
              
          if (errorSistema) {
              showError('Erro ao carregar empresas do sistema.');
          } else {
              combinedClients = (dataSistema as any[]).map(c => ({ id: c.id, nome: c.nome, tipo: 'Sistema' as const }));
          }
      } else {
          // Cliente/Usuário: Busca APENAS Clientes de Contas a Receber (clientes)
          let queryCR = supabase.from('clientes').select('id, nome').order('nome');
          
          // Se não for Admin, filtra pelo ownerId
          queryCR = queryCR.eq('proprietario_id', ownerId); // AJUSTE AQUI
          
          const { data: dataCR, error: errorCR } = await queryCR;
          
          if (errorCR) {
              showError('Erro ao carregar clientes CR.');
          } else {
              combinedClients.push(...(dataCR as Cliente[]).map(c => ({ id: c.id, nome: c.nome, tipo: 'CR' as const })));
          }
      }
      
      // 3. Ordenar e definir estado
      combinedClients.sort((a, b) => a.nome.localeCompare(b.nome));
      setClientes(combinedClients);
      setLoadingClientes(false);
    };
    
    fetchClientes();
    fetchHistoricos(); // Busca históricos
    if (isAdmin) {
        fetchMapeamentoContabil();
    }
  }, [perfil, role, ownerId, isAdmin, fetchMapeamentoContabil, fetchHistoricos]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      cliente_id: contaInicial?.cliente_id || undefined,
      descricao: contaInicial?.descricao || '',
      tipo_lancamento: 'unico',
      valor: contaInicial?.valor_total || undefined,
      data_vencimento: contaInicial?.data_vencimento ? new Date(contaInicial.data_vencimento + 'T00:00:00') : undefined,
      numero_parcelas: 1,
      intervalo_dias: 30,
      historico_id: null, // Inicializa com null
      novo_historico: '',
    },
  });

  const tipoLancamento = form.watch('tipo_lancamento');
  const novoHistoricoValue = form.watch('novo_historico');
  
  const handleCreateHistorico = async () => {
    if (!novoHistoricoValue || !ownerId) return;
    
    setIsCreatingHistorico(true);
    try {
        const { data, error } = await supabase
            .from('historicos')
            .insert({ proprietario_id: ownerId, descricao: novoHistoricoValue })
            .select('id, descricao')
            .single();
            
        if (error) throw error;
        
        showSuccess('Histórico criado e selecionado!');
        fetchHistoricos(); // Recarrega a lista
        form.setValue('historico_id', data.id); // Seleciona o novo histórico
        form.setValue('novo_historico', ''); // Limpa o campo de criação
        setIsCreatingHistorico(false);
        
    } catch (error: any) {
        showError('Falha ao criar histórico: ' + error.message);
        setIsCreatingHistorico(false);
    }
  };

  const onSubmit = async (values: FormValues) => {
    const ownerId = getOwnerId();
    if (!ownerId) { showError('ID da empresa/admin não pôde ser determinado.'); return; }
    
    // Contas Contábeis Mapeadas (apenas Admin)
    const contaAReceber = isAdmin ? mapeamentoContabil['a_receber'] : null;
    const contaParcela = isAdmin ? mapeamentoContabil['parcela'] : null;
    
    try {
      // 0. GARANTIR QUE O CLIENTE EXISTA NA TABELA 'clientes' (para FK)
      const clienteSelecionado = clientes.find(c => c.id === values.cliente_id);
      if (!clienteSelecionado) throw new Error('Cliente selecionado não encontrado.');
      
      const clienteData = {
          id: values.cliente_id,
          proprietario_id: ownerId, // AJUSTE AQUI
          nome: clienteSelecionado.nome,
          documento: 'N/A', // Placeholder
          email: 'N/A', // Placeholder
      };
      
      // Upsert na tabela 'clientes'
      const { error: upsertError } = await supabase
          .from('clientes')
          .upsert(clienteData, { onConflict: 'id' });
          
      if (upsertError) throw new Error('Falha ao garantir a existência do cliente na tabela CR: ' + upsertError.message);
      
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
      
      let contaReceberId: string;
      let tabelaContasReceber = isAdmin ? 'admin_contas_receber' : 'contas_receber';
      let tabelaParcelasReceber = isAdmin ? 'admin_parcelas_receber' : 'parcelas_contas_receber';
      
      const baseData = isAdmin ? { admin_id: ownerId, cliente_id: values.cliente_id, id_conta_contabil: contaAReceber, historico_id: values.historico_id } : { empresa_id: ownerId, cliente_id: values.cliente_id };
      
      const contaReceberPayload = {
          ...baseData,
          descricao: values.descricao,
          valor_total: valorTotal,
          data_emissao: format(new Date(), 'yyyy-MM-dd'),
          data_vencimento: parcelasParaInserir[0].data_vencimento,
          tipo_receita: 'única',
          status: 'aberta',
          origem: 'manual',
      };

      if (isEditing) {
        const { data, error } = await supabase.from(tabelaContasReceber).update(contaReceberPayload).eq('id', contaInicial.id).select('id').single();
        if (error) throw error;
        contaReceberId = data.id;
        
        const { error: deleteError } = await supabase.from(tabelaParcelasReceber).delete().eq('conta_receber_id', contaReceberId);
        if (deleteError) throw deleteError;
      } else {
        const { data, error } = await supabase.from(tabelaContasReceber).insert(contaReceberPayload).select('id').single();
        if (error) throw error;
        contaReceberId = data.id;
      }

      const parcelasComId = parcelasParaInserir.map(p => ({ 
          ...p, 
          conta_receber_id: contaReceberId, 
          ...(isAdmin ? { admin_id: ownerId, id_conta_contabil: contaParcela } : { empresa_id: ownerId })
      }));
      
      const { error: parcelError } = await supabase.from(tabelaParcelasReceber).insert(parcelasComId);
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
        <FormField control={form.control} name="cliente_id" render={({ field }) => (
          <FormItem><FormLabel>1. Cliente</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value} disabled={loadingClientes || isEditing}><FormControl><SelectTrigger><SelectValue placeholder={loadingClientes ? "Carregando..." : "Selecione um cliente"} /></SelectTrigger></FormControl><SelectContent>
            {clientes.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.nome} {c.tipo === 'Sistema' && <span className="text-xs text-muted-foreground">(Empresa do Sistema)</span>}
              </SelectItem>
            ))}
          </SelectContent></Select><FormMessage /></FormItem>
        )} />
        <Separator />
        <FormField control={form.control} name="descricao" render={({ field }) => (
          <FormItem><FormLabel>2. Descrição do Lançamento</FormLabel><FormControl><Input placeholder="Ex: Venda de produto X" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <Separator />
        
        {/* NOVO CAMPO: Histórico */}
        <div className="space-y-2">
            <FormLabel>3. Histórico (Opcional)</FormLabel>
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
                                        <SelectItem key={h.id} value={h.id}>{h.descricao}</SelectItem>
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
                            <FormControl><Input placeholder="Novo Histórico" {...field} disabled={form.formState.isSubmitting} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                    <Button type="button" onClick={handleCreateHistorico} disabled={form.formState.isSubmitting || !novoHistoricoValue}>
                        {form.formState.isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Criar'}
                    </Button>
                </div>
            )}
        </div>
        <Separator />
        
        <div className="space-y-4">
          <FormLabel>4. Detalhes do Pagamento</FormLabel>
          <FormField control={form.control} name="tipo_lancamento" render={({ field }) => (
            <FormItem><FormControl><RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex space-x-4 pt-2"><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="unico" /></FormControl><FormLabel className="font-normal">Único</FormLabel></FormItem><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="repetir" /></FormControl><FormLabel className="font-normal">Repetir Valor</FormLabel></FormItem><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="parcelar" /></FormControl><FormLabel className="font-normal">Parcelar Valor</FormLabel></FormItem></RadioGroup></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="valor" render={({ field }) => (
            <FormItem><FormLabel>{tipoLancamento === 'parcelar' ? 'Valor Total a Parcelar' : 'Valor da Parcela'}</FormLabel><FormControl><Input type="number" step="0.01" placeholder="0,00" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          {tipoLancamento === 'unico' && <FormField control={form.control} name="data_vencimento" render={({ field }) => (
            <FormItem className="flex flex-col"><FormLabel>Data de Vencimento</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "PPP", { locale: ptBR }) : <span>Escolha uma data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem>
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
                <FormItem className="flex flex-col"><FormLabel>1º Vencimento</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "PPP", { locale: ptBR }) : <span>Escolha uma data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem>
              )} />
            </div>
          )}
        </div>
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? 'Salvar Alterações' : 'Salvar Lançamento'}
        </Button>
      </form>
    </Form>
  );
};

export default FormContasReceber;