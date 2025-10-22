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
import { TipoUsuario, PerfilUsuario } from '@/types/usuario';

const formSchema = z.object({
  nome: z.string().min(1, 'O nome é obrigatório.'),
  email: z.string().email('Email inválido.'),
  tipo_usuario: z.enum(['Cliente', 'Funcionario'], {
    required_error: 'O tipo de usuário é obrigatório.',
  }),
  senha: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres.').optional().or(z.literal('')),
});

type FormValues = z.infer<typeof formSchema>;

interface FormUsuarioProps {
  empresaId: string;
  perfilLogado: TipoUsuario;
  usuarioInicial?: PerfilUsuario | null;
  onSaveComplete: () => void;
}

const FormUsuario: React.FC<FormUsuarioProps> = ({ perfilLogado, usuarioInicial, onSaveComplete }) => {
  const isEditing = !!usuarioInicial;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome: usuarioInicial?.nome || '',
      email: usuarioInicial?.email || '',
      tipo_usuario: usuarioInicial?.tipo_usuario === 'Admin' ? 'Cliente' : (usuarioInicial?.tipo_usuario as 'Cliente' | 'Funcionario') || 'Funcionario',
      senha: '',
    },
  });

  const onSubmit = async (values: FormValues) => {
    if (!isEditing && !values.senha) {
      showError('A senha é obrigatória para novos cadastros.');
      return;
    }

    form.setValue('tipo_usuario', values.tipo_usuario); // Garante que o tipo seja 'Cliente' ou 'Funcionario'

    try {
      // 1. Cadastro/Atualização de Auth (apenas para novos usuários ou redefinição de senha)
      if (!isEditing) {
        const { error: authError } = await supabase.auth.signUp({
          email: values.email,
          password: values.senha!,
          options: {
            data: {
              // Usamos raw_user_meta_data para passar o nome, que será usado no trigger handle_new_user
              nome: values.nome, 
            }
          }
        });

        if (authError) {
          throw new Error(authError.message);
        }

        // O perfil será criado automaticamente pelo trigger do Supabase (handle_new_user)
        showSuccess(`Usuário ${values.nome} cadastrado! Um email de confirmação foi enviado.`);
        onSaveComplete();
        return;
      } 
      
      // 2. Atualização de Perfil (apenas nome e tipo)
      const { error: updateError } = await supabase
        .from('usuarios')
        .update({
          nome: values.nome,
          tipo_usuario: values.tipo_usuario,
          atualizado_em: new Date().toISOString(),
        })
        .eq('id', usuarioInicial.id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      showSuccess(`Usuário ${values.nome} atualizado com sucesso.`);
      onSaveComplete();

    } catch (error) {
      console.error('Erro ao salvar usuário:', error);
      showError('Falha ao salvar usuário: ' + (error as Error).message);
    }
  };

  // Tipos permitidos para cadastro por Cliente/Admin
  const tiposPermitidos: TipoUsuario[] = ['Cliente', 'Funcionario'];
  if (perfilLogado === 'Admin') {
    // O Admin pode cadastrar Clientes (que gerenciam empresas) e Funcionários
    // Nota: O Admin principal não deve ser cadastrado por este formulário, apenas os usuários da empresa.
  } else if (perfilLogado === 'Cliente') {
    // O Cliente só pode cadastrar Funcionários
    tiposPermitidos.splice(tiposPermitidos.indexOf('Cliente'), 1);
  }


  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="nome"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome</FormLabel>
              <FormControl>
                <Input placeholder="Nome completo" {...field} />
              </FormControl>
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
              <FormControl>
                <Input placeholder="email@empresa.com" {...field} disabled={isEditing} />
              </FormControl>
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
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {tiposPermitidos.map(tipo => (
                    <SelectItem key={tipo} value={tipo}>
                      {tipo}
                    </SelectItem>
                  ))}
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
                <FormControl>
                  <Input type="password" placeholder="••••••••" {...field} />
                </FormControl>
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