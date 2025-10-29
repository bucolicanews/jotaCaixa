import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { AnyProfile, UserRole } from '@/types/usuario';
import UserAvatar from './UserAvatar';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

const formSchema = z.object({
  nome: z.string().min(1, 'O nome é obrigatório.'),
  // avatar_file: z.any().optional(), // Futuramente para upload de arquivo
});

type FormValues = z.infer<typeof formSchema>;

interface FormPerfilProps {
  perfil: AnyProfile;
  role: UserRole;
  onSaveComplete: () => void;
}

const FormPerfil: React.FC<FormPerfilProps> = ({ perfil, role, onSaveComplete }) => {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome: perfil?.nome || '',
    },
  });

  const onSubmit = async (values: FormValues) => {
    if (!perfil || !role) return;

    try {
      let tableName: string;
      if (role === 'Admin') tableName = 'tbl_admins';
      else if (role === 'Cliente') tableName = 'tbl_clientes';
      else if (role === 'Usuario') tableName = 'tbl_usuarios';
      else throw new Error('Role inválida.');

      // 1. Atualizar o nome na tabela de perfil
      const { error: profileError } = await supabase
        .from(tableName)
        .update({ nome: values.nome })
        .eq('id', perfil.id);

      if (profileError) throw profileError;

      // 2. Atualizar o nome no auth.users (opcional, mas bom para consistência)
      const { error: authError } = await supabase.auth.updateUser({
        data: { nome: values.nome }
      });

      if (authError) console.warn('Falha ao atualizar nome no Auth:', authError.message);

      showSuccess('Perfil atualizado com sucesso!');
      onSaveComplete();
    } catch (error: any) {
      showError(`Falha ao salvar perfil: ${error.message}`);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Dados Pessoais</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="flex flex-col items-center space-y-4">
              <UserAvatar profile={perfil} className="h-20 w-20" />
              <Button variant="outline" size="sm" disabled>
                <User className="w-4 h-4 mr-2" />
                Alterar Foto (Em Breve)
              </Button>
            </div>

            <FormField
              control={form.control}
              name="nome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome Completo</FormLabel>
                  <FormControl>
                    <Input placeholder="Seu nome" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormItem>
              <FormLabel>Email</FormLabel>
              <Input value={perfil?.email || ''} disabled className="bg-muted/50" />
            </FormItem>

            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar Alterações
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};

export default FormPerfil;