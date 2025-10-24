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

const formSchema = z.object({
  cliente_id: z.string({ required_error: 'Selecione um cliente.' }).uuid('Cliente inválido.'),
  descricao: z.string().min(1, 'A descrição é obrigatória.'),
  valor_total: z.coerce.number().positive('O valor deve ser maior que zero.'),
  data_vencimento: z.date({ required_error: 'A data de vencimento é obrigatória.' }),
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
      if (error) {
        showError('Erro ao carregar clientes.');
      } else {
        setClientes(data);
      }
      setLoadingClientes(false);
    };
    fetchClientes();
  }, []);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      cliente_id: contaInicial?.cliente_id || undefined,
      descricao: contaInicial?.descricao || '',
      valor_total: contaInicial?.valor_total || undefined,
      data_vencimento: contaInicial?.data_vencimento ? new Date(contaInicial.data_vencimento + 'T00:00:00') : undefined,
    },
  });

  const onSubmit = async (values: FormValues) => {
    const empresaId = getEmpresaId();
    if (!empresaId) {
      showError('ID da empresa não encontrado.');
      return;
    }

    const dataToSave = {
      empresa_id: empresaId,
      cliente_id: values.cliente_id,
      descricao: values.descricao,
      valor_total: values.valor_total,
      data_vencimento: format(values.data_vencimento, 'yyyy-MM-dd'),
      tipo_receita: 'única',
      status: 'aberta',
    };

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
          name="cliente_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cliente</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value} disabled={loadingClientes}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingClientes ? "Carregando..." : "Selecione um cliente"} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {clientes.map((cliente) => (
                    <SelectItem key={cliente.id} value={cliente.id}>{cliente.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="descricao"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descrição</FormLabel>
              <FormControl><Input placeholder="Ex: Venda de produto X" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="valor_total"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Valor Total</FormLabel>
              <FormControl><Input type="number" step="0.01" placeholder="0,00" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="data_vencimento"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Data de Vencimento</FormLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      variant={"outline"}
                      className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                    >
                      {field.value ? (
                        format(field.value, "PPP", { locale: ptBR })
                      ) : (
                        <span>Escolha uma data</span>
                      )}
                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={field.value}
                    onSelect={field.onChange}
                    disabled={(date) => date < new Date("1900-01-01")}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar Conta
        </Button>
      </form>
    </Form>
  );
};

export default FormContasReceber;