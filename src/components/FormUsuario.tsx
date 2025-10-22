import React, { useState, useEffect } from 'react';
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
import { PerfilUsuario, Perfil } from '@/types/usuario';

const formSchema = z.object({
  nome: z.string().min(1, 'O nome é obrigatório.'),
  email: z.string().email('Email inválido.'),
  perfil_id: z.string().uuid('Perfil inválido.'),
  senha: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres.').optional().or(z.literal('')),
});

type FormValues = z.infer<typeof formSchema>;

interface FormUsuarioProps {
  perfilLogado: PerfilUsuario;
  clienteId?: string | null; // ID do cliente para o qual o usuário será criado
  usuarioInicial?: PerfilUsuario | null;
  onSaveComplete: () => void;
}

const FormUsuario: React.FC<FormUsuarioProps> = ({ perfilLogado, clienteId, usuarioInicial, onSaveComplete }) => {
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const isEditing = !!usuarioInicial;
  const isAdmin = perfilLogado.tbl_perfil?.nome === 'Admin';

  useEffect(() => {
    const fetchPerfis = async () => {
      const { data, error } = await supabase.from('tbl_perfil').select('*');
      if (error) {
        showError('Falha ao carregar perfis.');
      } else {
        const perfisDisponiveis = isAdmin ? data.filter(p => p.nome !== 'Usuario') : data.filter(p => p.nome === 'Usuario');
        setPerfis(perfisDisponiveis);
      }
    };
    fetchPerfis();
  }, [isAdmin]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome: usuarioInicial?.nome || '',
      email: usuarioInicial?.email || '',
      perfil_id: usuarioInicial?.perfil_id || '',
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
        const perfilSelecionado = perfis.find(p => p.id === values.perfil_id);
        
        const { error: authError } = await supabase.auth.signUp({
          email: values.email,
          password: values.senha!,
          options: {
            data: {
              nome: values.nome,
              perfil_nome: perfilSelecionado?.nome,
              cliente_id: clienteId,
            }
          }
        });

        if (authError) throw new Error(authError.message);
        showSuccess(`Usuário ${values.nome} cadastrado! Um email de confirmação foi enviado.`);

      } else {
        const { error: updateError } = await supabase
          .from('usuarios')
          .update({
            nome: values.nome,
            perfil_id: values.perfil_id,
          })
          .eq('id', usuarioInicial!.id);

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
          name="perfil_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Perfil</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value} disabled={!isAdmin && isEditing}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o perfil" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {perfis.map(perfil => (
                    <SelectItem key={perfil.id} value={perfil.id}>{perfil.nome}</SelectItem>
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
                <FormControl><Input type="password" placeholder="••••••••" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? 'Atualizar' : 'Cadastrar'}
        </Button>
      </form>
    </Form>
  );
};

export default FormUsuario;