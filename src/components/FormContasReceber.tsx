import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { ContaReceber } from '@/types/contas-receber';
import { Cliente } from '@/types/cliente';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from './ui/separator';

const formSchema = z.object({
  tipo_cliente: z.enum(['cadastrado', 'avulso'], { required_error: 'Selecione o tipo de cliente.' }),
  cliente_id: z.string().uuid('Cliente inválido.').optional(),
  nome_cliente_avulso: z.string().optional(),
  descricao: z.string().min(1, 'A descrição é obrigatória.'),
  
  tipo_lancamento: z.enum(['unico', 'repetir', 'parcelar'], { required_error: 'Selecione o tipo de lançamento.' }),
  valor: z.coerce.number().positive('O valor deve ser maior que zero.'),
  
  // Campos para lançamento único
  data_vencimento: z.date().optional(),

  // Campos para parcelamento/repetição
  numero_parcelas: z.coerce.number().int().min(1).optional(),
  data_primeiro_vencimento: z.date().optional(),
  intervalo_dias: z.coerce.number().int().min(1).optional(),

}).superRefine((data, ctx) => {
  if (data.tipo_cliente === 'cadastrado' && !data.cliente_id) {
    ctx.addIssue({ code: 'custom', message: 'Selecione um cliente.', path: ['cliente_id'] });
  }
  if (data.tipo_cliente === 'avulso' && (!data.nome_cliente_avulso || data.nome_cliente_avulso.trim() === '')) {
    ctx.addIssue({ code: 'custom', message: 'O nome do cliente avulso é obrigatório.', path: ['nome_cliente_avulso'] });
  }
  if (data.tipo_lancamento === 'unico' && !data.data_vencimento) {
    ctx.addIssue({ code: 'custom', message: 'A data de vencimento é obrigatória.', path: ['data_vencimento'] });
  }
  if (data.tipo_lancamento !== 'unico') {
    if (!data.numero_parcelas || data.numero_parcelas < 1) {
      ctx.addIssue({ code: 'custom', message: 'Informe um número de parcelas válido.', path: ['numero_parcelas'] });
    }
    if (!data.data_primeiro_vencimento) {
      ctx.addIssue({ code: 'custom', message: 'A data do primeiro vencimento é obrigatória.', path: ['data_primeiro_vencimento'] });
    }
    if (!data.intervalo_dias || data.intervalo_dias < 1) {
      ctx.addIssue({ code: 'custom', message: 'Informe um intervalo de dias válido.', path: ['intervalo_dias'] });
    }
  }
});

type FormValues = z.infer<typeof formSchema>;

interface FormContasReceberProps {
  contaInicial?: ContaReceber | null;
  onSaveComplete: () => void;
}

const FormContasReceber: React.FC<FormContasReceberProps> = ({ contaInicial, onSaveComplete }) => {
  const { perfil, role } = useSessao();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loadingClientes, setLoadingClientes] = useState(true);

  const getEmpresaId = () => {
    if (role === 'Cliente') return (perfil as ClienteProfile)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id;
    return null;
  };

  useEffect(() => {
    const fetchClientes = async () => {
      setLoadingClientes(true);
      const { data, error } = await supabase.from('clientes').select('*').order('nome');
      if (error) showError('Erro ao carregar clientes.');
      else setClientes(data as Cliente[]);
      setLoadingClientes(false);
    };
    fetchClientes();
  }, []);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      tipo_cliente: contaInicial?.cliente_id ? 'cadastrado' : 'avulso',
      cliente_id: contaInicial?.cliente_id || undefined,
      nome_cliente_avulso: contaInicial?.nome_cliente_avulso || '',
      descricao: contaInicial?.descricao || '',
      tipo_lancamento: 'unico',
      valor: contaInicial?.valor_total || undefined,
      data_vencimento: contaInicial?.data_vencimento ? new Date(contaInicial.data_vencimento + 'T00:00:00') : undefined,
      numero_parcelas: 1,
      intervalo_dias: 30,
    },
  });

  const tipoCliente = form.watch('tipo_cliente');
  const tipoLancamento = form.watch('tipo_lancamento');
  const isEditing = !!contaInicial;

  const onSubmit = async (values: FormValues) => {
    let empresaId: string | null | undefined = null;
    let clienteData: Partial<ContaReceber> = {};

    if (values.tipo_cliente === 'cadastrado') {
      const selectedClient = clientes.find(c => c.id === values.cliente_id);
      if (!selectedClient) { showError('Cliente selecionado não encontrado.'); return; }
      empresaId = selectedClient.empresa_id;
      clienteData = { cliente_id: values.cliente_id, nome_cliente_avulso: null };
    } else {
      empresaId = getEmpresaId();
      clienteData = { cliente_id: null, nome_cliente_avulso: values.nome_cliente_avulso };
    }

    if (!empresaId) { showError('ID da empresa não pôde ser determinado.'); return; }

    try {
      let valorTotal: number;
      let parcelasParaInserir = [];

      if (values.tipo_lancamento === 'unico') {
        valorTotal = values.valor;
        parcelasParaInserir.push({
          numero_parcela: 1,
          valor_parcela: values.valor,
          data_vencimento: format(values.data_vencimento!, 'yyyy-MM-dd'),
          status: 'aberta',
        });
      } else { // Repetir ou Parcelar
        const { numero_parcelas, data_primeiro_vencimento, intervalo_dias, valor } = values;
        const valorParcela = values.tipo_lancamento === 'parcelar' ? (valor / numero_parcelas!) : valor;
        valorTotal = values.tipo_lancamento === 'parcelar' ? valor : (valor * numero_parcelas!);

        for (let i = 0; i < numero_parcelas!; i++) {
          parcelasParaInserir.push({
            numero_parcela: i + 1,
            valor_parcela: valorParcela,
            data_vencimento: format(addDays(data_primeiro_vencimento!, i * intervalo_dias!), 'yyyy-MM-dd'),
            status: 'aberta',
          });
        }
      }

      const contaData: Omit<ContaReceber, 'id' | 'created_at' | 'updated_at' | 'clientes'> = {
        ...clienteData,
        empresa_id: empresaId,
        descricao: values.descricao,
        valor_total: valorTotal,
        data_emissao: format(new Date(), 'yyyy-MM-dd'),
        data_vencimento: parcelasParaInserir[0].data_vencimento,
        tipo_receita: 'única',
        status: 'aberta',
        origem: 'manual',
      };

      const { data: contaResult, error: contaError } = await supabase
        .from('contas_receber')
        .insert(contaData)
        .select('id')
        .single();

      if (contaError) throw contaError;

      const parcelasComId = parcelasParaInserir.map(p => ({
        ...p,
        conta_receber_id: contaResult.id,
        empresa_id: empresaId,
      }));

      const { error: parcelError } = await supabase.from('parcelas_contas_receber').insert(parcelasComId);
      if (parcelError) throw parcelError;

      showSuccess('Conta a receber e parcelas geradas com sucesso!');
      onSaveComplete();

    } catch (error: any) {
      showError(`Falha ao salvar: ${error.message}`);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="space-y-4">
          <FormField control={form.control} name="tipo_cliente" render={({ field }) => (
            <FormItem><FormLabel>1. Cliente</FormLabel><FormControl>
              <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex space-x-4 pt-2">
                <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="cadastrado" /></FormControl><FormLabel className="font-normal">Cadastrado</FormLabel></FormItem>
                <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="avulso" /></FormControl><FormLabel className="font-normal">Avulso</FormLabel></FormItem>
              </RadioGroup></FormControl><FormMessage />
            </FormItem>
          )} />
          {tipoCliente === 'cadastrado' && <FormField control={form.control} name="cliente_id" render={({ field }) => (
            <FormItem><Select onValueChange={field.onChange} defaultValue={field.value} disabled={loadingClientes}><FormControl><SelectTrigger><SelectValue placeholder={loadingClientes ? "Carregando..." : "Selecione"} /></SelectTrigger></FormControl><SelectContent>{clientes.map((c) => (<SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>
          )} />}
          {tipoCliente === 'avulso' && <FormField control={form.control} name="nome_cliente_avulso" render={({ field }) => (
            <FormItem><FormControl><Input placeholder="Digite o nome do cliente" {...field} /></FormControl><FormMessage /></FormItem>
          )} />}
        </div>
        <Separator />
        <div className="space-y-4">
          <FormField control={form.control} name="descricao" render={({ field }) => (
            <FormItem><FormLabel>2. Descrição do Lançamento</FormLabel><FormControl><Input placeholder="Ex: Venda de produto X" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
        </div>
        <Separator />
        <div className="space-y-4">
          <FormField control={form.control} name="tipo_lancamento" render={({ field }) => (
            <FormItem><FormLabel>3. Forma de Pagamento</FormLabel><FormControl>
              <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex space-x-4 pt-2" disabled={isEditing}>
                <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="unico" /></FormControl><FormLabel className="font-normal">Único</FormLabel></FormItem>
                <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="repetir" /></FormControl><FormLabel className="font-normal">Repetir Valor</FormLabel></FormItem>
                <FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="parcelar" /></FormControl><FormLabel className="font-normal">Parcelar Valor</FormLabel></FormItem>
              </RadioGroup></FormControl><FormMessage />
            </FormItem>
          )} />
          
          <FormField control={form.control} name="valor" render={({ field }) => (
            <FormItem><FormLabel>{tipoLancamento === 'parcelar' ? 'Valor Total a Parcelar' : 'Valor da Parcela'}</FormLabel><FormControl><Input type="number" step="0.01" placeholder="0,00" {...field} /></FormControl><FormMessage /></FormItem>
          )} />

          {tipoLancamento === 'unico' && <FormField control={form.control} name="data_vencimento" render={({ field }) => (
            <FormItem className="flex flex-col"><FormLabel>Data de Vencimento</FormLabel><Popover><PopoverTrigger asChild><FormControl>
              <Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                {field.value ? format(field.value, "PPP", { locale: ptBR }) : <span>Escolha uma data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
              </Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover><FormMessage />
            </FormItem>
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
                <FormItem className="flex flex-col"><FormLabel>1º Vencimento</FormLabel><Popover><PopoverTrigger asChild><FormControl>
                  <Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                    {field.value ? format(field.value, "dd/MM/yy") : <span>Data</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                  </Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover><FormMessage />
                </FormItem>
              )} />
            </div>
          )}
        </div>
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting || isEditing}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? 'Edição desabilitada' : 'Salvar Lançamento'}
        </Button>
      </form>
    </Form>
  );
};

export default FormContasReceber;