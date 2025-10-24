import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { Cliente } from '@/types/cliente';
import { useSessao } from '@/hooks/use-sessao';
import { UsuarioProfile } from '@/types/usuario';

const formSchema = z.object({
  nome: z.string().min(1, 'O nome é obrigatório.'),
  documento: z.string().optional(),
  email: z.string().email('Email inválido.').optional().or(z.literal('')),
  telefone: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface FormClienteProps {
  clienteInicial?: Cliente | null;
  onSaveComplete: () => void;
}

const FormCliente: React.FC<FormClienteProps> = ({ clienteInicial, onSaveComplete }) => {
  const { perfil, role } = useSessao();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome: clienteInicial?.nome || '',
      documento: clienteInicial?.documento || '',
      email: clienteInicial?.email || '',
      telefone: clienteInicial?.telefone || '',
    },
  });

  const getOwnerId = () => {
    if (role === 'Admin' || role === 'Cliente') return (perfil as any)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id;
    return null;
  };

  const onSubmit = async (values: FormValues) => {
    const ownerId = getOwnerId();
    if (!ownerId) {
      showError('Não foi possível identificar o proprietário (empresa/admin). Não é possível salvar.');
      return;
    }

    const dataToSave = {
      nome: values.nome,
      documento: values.documento,
      email: values.email,
      telefone: values.telefone,
      empresa_id: ownerId,
    };

    let error = null;

    if (clienteInicial) {
      const result = await supabase.from('clientes').update(dataToSave).eq('id', clienteInicial.id);
      error = result.error;
    } else {
      const result = await supabase.from('clientes').insert(dataToSave);
      error = result.error;
    }

    if (error) {
      showError(`Falha ao salvar cliente: ${error.message}`);
    } else {
      showSuccess(`Cliente salvo com sucesso!`);
      onSaveComplete();
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField control={form.control} name="nome" render={({ field }) => (
          <FormItem><FormLabel>Nome do Cliente</FormLabel><FormControl><Input placeholder="Nome do cliente" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="documento" render={({ field }) => (
          <FormItem><FormLabel>Documento (CPF/CNPJ)</FormLabel><FormControl><Input placeholder="00.000.000/0000-00" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="email" render={({ field }) => (
          <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="contato@cliente.com" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="telefone" render={({ field }) => (
          <FormItem><FormLabel>Telefone</FormLabel><FormControl><Input placeholder="(00) 90000-0000" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar Cliente
        </Button>
      </form>
    </Form>
  );
};

export default FormCliente;