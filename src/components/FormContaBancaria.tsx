import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';

// Definindo o tipo de conta bancária (baseado no schema do DB)
interface ContaBancaria {
  id: string;
  empresa_id: string;
  nome: string;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  tipo: 'Conta Corrente' | 'Poupança' | 'Caixa';
  saldo_inicial: number;
}

const formSchema = z.object({
  nome: z.string().min(1, 'O nome é obrigatório.'),
  tipo: z.enum(['Conta Corrente', 'Poupança', 'Caixa'], {
    required_error: 'O tipo é obrigatório.',
  }),
  banco: z.string().optional().or(z.literal('')),
  agencia: z.string().optional().or(z.literal('')),
  conta: z.string().optional().or(z.literal('')),
  saldo_inicial: z.coerce.number().optional().default(0),
}).superRefine((data, ctx) => {
    if (data.tipo !== 'Caixa') {
        if (!data.banco) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'O nome do banco é obrigatório para contas bancárias.', path: ['banco'] });
        }
        if (!data.agencia) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A agência é obrigatória para contas bancárias.', path: ['agencia'] });
        }
        if (!data.conta) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'O número da conta é obrigatório para contas bancárias.', path: ['conta'] });
        }
    }
});

type FormValues = z.infer<typeof formSchema>;

interface FormContaBancariaProps {
  contaInicial?: ContaBancaria | null;
  onSaveComplete: () => void;
}

const FormContaBancaria: React.FC<FormContaBancariaProps> = ({ contaInicial, onSaveComplete }) => {
  const { usuario, perfil, role } = useSessao();
  const isEditing = !!contaInicial;

  const getEmpresaId = () => {
    if (role === 'Admin' || role === 'Cliente') return (perfil as ClienteProfile)?.id || usuario?.id || null;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id || null;
    return null;
  };
  
  const empresaId = getEmpresaId();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome: contaInicial?.nome || '',
      tipo: contaInicial?.tipo || 'Conta Corrente',
      banco: contaInicial?.banco || '',
      agencia: contaInicial?.agencia || '',
      conta: contaInicial?.conta || '',
      saldo_inicial: contaInicial?.saldo_inicial || 0,
    },
  });
  
  const tipoConta = form.watch('tipo');

  const onSubmit = async (values: FormValues) => {
    if (!empresaId) {
      showError('ID da empresa não encontrado. Não é possível salvar.');
      return;
    }
    
    const isCaixa = values.tipo === 'Caixa';

    const dataToSave = {
      empresa_id: empresaId,
      nome: values.nome,
      tipo: values.tipo,
      saldo_inicial: values.saldo_inicial,
      // Limpa campos bancários se for Caixa
      banco: isCaixa ? null : values.banco || null,
      agencia: isCaixa ? null : values.agencia || null,
      conta: isCaixa ? null : values.conta || null,
    };

    let error = null;

    if (isEditing) {
      // Atualizar
      const result = await supabase
        .from('contas_bancarias')
        .update(dataToSave)
        .eq('id', contaInicial.id);
      error = result.error;
    } else {
      // Inserir
      const result = await supabase
        .from('contas_bancarias')
        .insert(dataToSave);
      error = result.error;
    }

    if (error) {
      showError(`Falha ao salvar conta: ${error.message}`);
    } else {
      showSuccess(`Conta salva com sucesso!`);
      onSaveComplete();
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="nome"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome da Conta/Caixa</FormLabel>
              <FormControl>
                <Input placeholder="Ex: Caixa Matriz, Banco do Brasil" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="tipo"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tipo</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Conta Corrente">Conta Corrente</SelectItem>
                  <SelectItem value="Poupança">Poupança</SelectItem>
                  <SelectItem value="Caixa">Caixa (Dinheiro em Espécie)</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        
        {tipoConta !== 'Caixa' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border p-4 rounded-md">
            <FormField
              control={form.control}
              name="banco"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Banco</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Banco do Brasil" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="agencia"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Agência</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: 0001" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="conta"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Conta</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: 12345-6" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}
        
        <FormField
          control={form.control}
          name="saldo_inicial"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Saldo Inicial (R$)</FormLabel>
              <FormControl>
                <Input type="number" step="0.01" placeholder="0.00" {...field} />
              </FormControl>
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

export default FormContaBancaria;