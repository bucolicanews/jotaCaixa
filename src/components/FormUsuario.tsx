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
import { AnyProfile, ClienteProfile, UserRole } from '@/types/usuario';

const formSchema = z.object({
  nome: z.string().min(1, 'O nome é obrigatório.'),
  email: z.string().email('Email inválido.'),
  senha: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres.').optional().or(z.literal('')),
  limite_usuarios: z.coerce.number().int().min(1, 'O limite deve ser pelo menos 1.').optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface FormUsuarioProps {
  criadorRole: UserRole;
  clienteId?: string;
  usuarioInicial?: AnyProfile | null;
  onSaveComplete: () => void;
}

const FormUsuario: React.FC<FormUsuarioProps> = ({ criadorRole, clienteId, usuarioInicial, onSaveComplete }) => {
  const isEditing = !!usuarioInicial;
  const isClient = isEditing && 'limite_usuarios' in usuarioInicial;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome: usuarioInicial?.nome || '',
      email: usuarioInicial?.email || '',
      senha: '',
      limite_usuarios: isClient ? (usuarioInicial as ClienteProfile).limite_usuarios : 5,
    },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      if (isEditing && usuarioInicial) {
        const isClientBeingEdited = 'limite_usuarios' in usuarioInicial;
        const tableName = isClientBeingEdited ? 'tbl_clientes' : 'tbl_usuarios';
        
        const dataToUpdate: { nome: string; limite_usuarios?: number } = {
          nome: values.nome,
        };

        if (isClientBeingEdited) {
          dataToUpdate.limite_usuarios = values.limite_usuarios;
        }

        const { error } = await supabase
          .from(tableName)
          .update(dataToUpdate)
          .eq('id', usuarioInicial.id);
        if (error) throw error;
        showSuccess('Conta atualizada com sucesso!');

      } else {
        if (!values.senha) {
          form.setError('senha', { message: 'A senha é obrigatória para novos usuários.' });
          return;
        }
        const roleToCreate = criadorRole === 'Admin' ? 'Cliente' : 'Usuario';
        const { error } = await supabase.auth.signUp({
          email: values.email,
          password: values.senha!,
          options: {
            data: {
              nome: values.nome,
              role: roleToCreate,
              cliente_id: clienteId,
            },
          },
        });
        if (error) throw error;
        showSuccess(`Conta criada! Um email de confirmação foi enviado para ${values.email}.`);
      }
      onSaveComplete();
    } catch (error: any) {
      showError(`Falha ao salvar: ${error.message}`);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField control={form.control} name="nome" render={({ field }) => (
          <FormItem>
            <FormLabel>Nome</FormLabel>
            <FormControl><Input placeholder="Nome completo" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="email" render={({ field }) => (
          <FormItem>
            <FormLabel>Email</FormLabel>
            <FormControl><Input type="email" placeholder="email@exemplo.com" {...field} disabled={isEditing} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        {!isEditing && (
          <FormField control={form.control} name="senha" render={({ field }) => (
            <FormItem>
              <FormLabel>Senha Provisória</FormLabel>
              <FormControl><Input type="password" placeholder="••••••••" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        )}
        {isClient && (
          <FormField control={form.control} name="limite_usuarios" render={({ field }) => (
            <FormItem>
              <FormLabel>Limite de Usuários da Equipe</FormLabel>
              <FormControl><Input type="number" placeholder="5" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        )}
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? 'Salvar Alterações' : 'Criar Conta'}
        </Button>
      </form>
    </Form>
  );
};

export default FormUsuario;