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
import { PerfilUsuario } from '@/types/usuario';

const formSchema = z.object({
  nome: z.string().min(1, 'O nome é obrigatório.'),
  email: z.string().email('Email inválido.'),
  tipo_usuario: z.enum(['Cliente', 'Funcionario', 'Admin']), // Adicionado Admin para flexibilidade
  senha: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres.').optional().or(z.literal('')),
});

type FormValues = z.infer<typeof formSchema>;

interface FormUsuarioProps {
  empresaId: string | null; // Pode ser nulo para o Admin
  perfilLogado: PerfilUsuario;
  usuarioInicial?: PerfilUsuario | null;
  onSaveComplete: () => void;
}

const FormUsuario: React.FC<FormUsuarioProps> = ({ empresaId, perfilLogado, usuarioInicial, onSaveComplete }) => {
  const isEditing = !!usuarioInicial;
  const isAdmin = perfilLogado.tipo_usuario === 'Admin';
  const isCliente = perfilLogado.tipo_usuario === 'Cliente';

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome: usuarioInicial?.nome || '',
      email: usuarioInicial?.email || '',
      tipo_usuario: usuarioInicial?.tipo_usuario || (isCliente ? 'Funcionario' : 'Cliente'),
      senha: '',
    },
  });

  const onSubmit = async (values: FormValues) => {
    if (!isEditing && !values.senha) {
      showError('A senha é obrigatória para novos cadastros.');
      return;
    }

    try {
      if (!isEditing) {
        // Lógica de Criação
        const tipoNovoUsuario = isCliente ? 'Funcionario' : values.tipo_usuario;
        
        const { error: authError } = await supabase.auth.signUp({
          email: values.email,
          password: values.senha!,
          options: {
            data: {
              nome: values.nome,
              tipo_usuario: tipoNovoUsuario,
              empresa_id: empresaId, // Vincula o novo funcionário à empresa do Cliente
            }
          }
        });

        if (authError) throw new Error(authError.message);
        showSuccess(`Usuário ${values.nome} cadastrado! Um email de confirmação foi enviado.`);

      } else {
        // Lógica de Atualização
        const { error: updateError } = await supabase
          .from('usuarios')
          .update({
            nome: values.nome,
            tipo_usuario: values.tipo_usuario,
          })
          .eq('id', usuarioInicial.id);

        if (updateError) throw new Error(updateError.message);
        showSuccess(`Usuário ${values.nome} atualizado com sucesso.`);
      }
      
      onSaveComplete();

    } catch (error) {
      console.error('Erro ao salvar usuário:', error);
      showError('Falha ao salvar usuário: ' + (error as Error).message);
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
              <FormLabel>Nome</FormLabel>
              <FormControl><Input placeholder="Nome completo" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl><Input placeholder="email@empresa.com" {...field} disabled={isEditing} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="tipo_usuario"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tipo de Usuário</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value} disabled={!isAdmin}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {isAdmin && <SelectItem value="Admin">Admin</SelectItem>}
                  {isAdmin && <SelectItem value="Cliente">Cliente (Empresa)</SelectItem>}
                  <SelectItem value="Funcionario">Funcionário</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        {!isEditing && (
          <FormField
            control={form.control}
            name="senha"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Senha (mínimo 6 caracteres)</FormLabel>
                <FormControl><Input type="password" placeholder="••••••••" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? 'Atualizar Usuário' : 'Cadastrar Usuário'}
        </Button>
      </form>
    </Form>
  );
};

export default FormUsuario;