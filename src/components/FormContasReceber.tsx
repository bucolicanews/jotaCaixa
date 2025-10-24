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
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { ContaReceber } from '@/types/contas-receber';
import { Cliente } from '@/types/cliente';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

const formSchema = z.object({
  tipo_cliente: z.enum(['cadastrado', 'avulso'], { required_error: 'Selecione o tipo de cliente.' }),
  cliente_id: z.string().uuid('Cliente inválido.').optional(),
  nome_cliente_avulso: z.string().optional(),
  descricao: z.string().min(1, 'A descrição é obrigatória.'),
  valor_total: z.coerce.number().positive('O valor deve ser maior que zero.'),
  data_vencimento: z.date({ required_error: 'A data de vencimento é obrigatória.' }),
}).superRefine((data, ctx) => {
  if (data.tipo_cliente === 'cadastrado' && !data.cliente_id) {
    ctx.addIssue({ code: 'custom', message: 'Selecione um cliente.', path: ['cliente_id'] });
  }
  if (data.tipo_cliente === 'avulso' && (!data.nome_cliente_avulso || data.nome_cliente_avulso.trim() === '')) {
    ctx.addIssue({ code: 'custom', message: 'O nome do cliente avulso é obrigatório.', path: ['nome_cliente_avulso'] });
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
    return null; // Admin não tem uma empresa padrão, será pego do cliente selecionado
  };

  useEffect(() => {
    const fetchClientes = async () => {
      setLoadingClientes(true);
      const { data, error } = await supabase.from('clientes').select('*').order('nome');
      if (error) {
        showError('Erro ao carregar clientes.');
      } else {
        setClientes(data as Cliente[]);
      }
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
      valor_total: contaInicial?.valor_total || undefined,
      data_vencimento: contaInicial?.data_vencimento ? new Date(contaInicial.data_vencimento + 'T00:00:00') : undefined,
    },
  });

  const tipoCliente = form.watch('tipo_cliente');

  const onSubmit = async (values: FormValues) => {
    let empresaId: string | null | undefined = null;
    let dataToSave: Partial<ContaReceber> = {};

    if (values.tipo_cliente === 'cadastrado') {
      const selectedClient = clientes.find(c => c.id === values.cliente_id);
      if (!selectedClient) {
        showError('Cliente selecionado não encontrado.');
        return;
      }
      empresaId = selectedClient.empresa_id;
      dataToSave = { cliente_id: values.cliente_id, nome_cliente_avulso: null };
    } else {
      empresaId = getEmpresaId();
      dataToSave = { cliente_id: null, nome_cliente_avulso: values.nome_cliente_avulso };
    }

    if (!empresaId) {
      showError('ID da empresa não pôde ser determinado. Não é possível salvar.');
      return;
    }

    Object.assign(dataToSave, {
      empresa_id: empresaId,
      descricao: values.descricao,
      valor_total: values.valor_total,
      data_vencimento: format(values.data_vencimento, 'yyyy-MM-dd'),
      tipo_receita: 'única',
      status: 'aberta',
    });

    try {
      let contaReceberId: string;
      if (contaInicial) {
        const { data, error } = await supabase.from('contas_receber').update(dataToSave).eq('id', contaInicial.id).select('id').single();
        if (error) throw error;
        contaReceberId = data.id;
        await supabase.from('parcelas_contas_receber').delete().eq('conta_receber_id', contaInicial.id);
      } else {
        const { data, error } = await supabase.from('contas_receber').insert(dataToSave).select('id').single();
        if (error) throw error;
        contaReceberId = data.id;
      }

      const { error: parcelError } = await supabase.from('parcelas_contas_receber').insert({
        conta_receber_id: contaReceberId,
        empresa_id: empresaId,
        numero_parcela: 1,
        valor_parcela: values.valor_total,
        data_vencimento: format(values.data_vencimento, 'yyyy-MM-dd'),
        status: 'aberta',
      });
      if (parcelError) throw parcelError;

      showSuccess('Conta salva com sucesso!');
      onSaveComplete();
    } catch (error: any) {
      showError(`Falha ao salvar conta: ${error.message}`);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="tipo_cliente"
          render={({ field }) => (
            <FormItem className="space-y-3">
              <FormLabel>Tipo de Cliente</FormLabel>
              <FormControl>
                <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex space-x-4">
                  <FormItem className="flex items-center space-x-2 space-y-0">
                    <FormControl><RadioGroupItem value="cadastrado" /></FormControl>
                    <FormLabel className="font-normal">Cliente Cadastrado</FormLabel>
                  </FormItem>
                  <FormItem className="flex items-center space-x-2 space-y-0">
                    <FormControl><RadioGroupItem value="avulso" /></FormControl>
                    <FormLabel className="font-normal">Cliente Avulso</FormLabel>
                  </FormItem>
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {tipoCliente === 'cadastrado' && (
          <FormField
            control={form.control}
            name="cliente_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cliente</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value} disabled={loadingClientes}>
                  <FormControl><SelectTrigger><SelectValue placeholder={loadingClientes ? "Carregando..." : "Selecione um cliente"} /></SelectTrigger></FormControl>
                  <SelectContent>{clientes.map((c) => (<SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>))}</SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {tipoCliente === 'avulso' && (
          <FormField
            control={form.control}
            name="nome_cliente_avulso"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome do Cliente Avulso</FormLabel>
                <FormControl><Input placeholder="Digite o nome do cliente" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField control={form.control} name="descricao" render={({ field }) => (
          <FormItem><FormLabel>Descrição</FormLabel><FormControl><Input placeholder="Ex: Venda de produto X" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="valor_total" render={({ field }) => (
          <FormItem><FormLabel>Valor Total</FormLabel><FormControl><Input type="number" step="0.01" placeholder="0,00" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="data_vencimento" render={({ field }) => (
          <FormItem className="flex flex-col"><FormLabel>Data de Vencimento</FormLabel>
            <Popover><PopoverTrigger asChild><FormControl>
              <Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                {field.value ? format(field.value, "PPP", { locale: ptBR }) : <span>Escolha uma data</span>}
                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
              </Button>
            </FormControl></PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={(date) => date < new Date("1900-01-01")} initialFocus />
            </PopoverContent></Popover>
            <FormMessage />
          </FormItem>
        )} />
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar Conta
        </Button>
      </form>
    </Form>
  );
};

export default FormContasReceber;