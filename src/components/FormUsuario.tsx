import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { AnyProfile, ClienteProfile, UserRole } from '@/types/usuario';
import { PERMISSOES_DISPONIVEIS, Permissao } from '../config/permissoes';

const formSchema = z.object({
  nome: z.string().min(1, 'O nome é obrigatório.'),
  email: z.string().email('Email inválido.'),
  senha: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres.').optional().or(z.literal('')),
  limite_usuarios: z.coerce.number().int().min(1, 'O limite deve ser pelo menos 1.').optional(),
  permissoes: z.record(z.boolean()).optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface FormUsuarioProps {
  criadorRole: UserRole;
  criadorPerfil: AnyProfile;
  clienteId?: string;
  usuarioInicial?: AnyProfile | null;
  onSaveComplete: () => void;
}

const FormUsuario: React.FC<FormUsuarioProps> = ({ criadorRole, criadorPerfil, clienteId, usuarioInicial, onSaveComplete }) => {
  const isEditing = !!usuarioInicial;
  const isClient = isEditing && usuarioInicial && 'limite_usuarios' in usuarioInicial;
  const isUser = isEditing && usuarioInicial && 'cliente_id' in usuarioInicial;

  const isClientBeingManagedByAdmin = criadorRole === 'Admin' && isClient;
  const isUserBeingManagedByClient = criadorRole === 'Cliente' && (isUser || !isEditing);

  const permissoesDoCriador = (criadorPerfil && 'permissoes' in criadorPerfil)
    ? (criadorPerfil as ClienteProfile).permissoes
    : null;

  const permissoesVisiveis = PERMISSOES_DISPONIVEIS.filter(p => {
    if (criadorRole === 'Admin') return true;
    if (criadorRole === 'Cliente' && permissoesDoCriador) {
      return permissoesDoCriador[p.key] === true;
    }
    return false;
  });

  const defaultPermissoes = PERMISSOES_DISPONIVEIS.reduce((acc: Record<string, boolean>, p: Permissao) => {
    if (isEditing && usuarioInicial && 'permissoes' in usuarioInicial && (usuarioInicial as any).permissoes) {
      acc[p.key] = (usuarioInicial as any).permissoes[p.key] !== false;
    } else {
      acc[p.key] = true;
    }
    return acc;
  }, {} as Record<string, boolean>);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome: usuarioInicial?.nome || '',
      email: usuarioInicial?.email || '',
      senha: '',
      limite_usuarios: isClient ? (usuarioInicial as ClienteProfile).limite_usuarios : 5,
      permissoes: defaultPermissoes,
    },
  });

  const handleSelectAll = (select: boolean) => {
    permissoesVisiveis.forEach(p => {
      form.setValue(`permissoes.${p.key}`, select, { shouldDirty: true });
    });
  };

  const onSubmit = async (values: FormValues) => {
    try {
      if (isEditing && usuarioInicial) {
        const dataToUpdate: any = { nome: values.nome };

        if (isClient) {
          dataToUpdate.limite_usuarios = values.limite_usuarios;
          dataToUpdate.permissoes = values.permissoes;
          const { error } = await supabase.from('tbl_clientes').update(dataToUpdate).eq('id', usuarioInicial.id);
          if (error) throw error;
        } else if (isUser) {
          dataToUpdate.permissoes = values.permissoes;
          const { error } = await supabase.from('tbl_usuarios').update(dataToUpdate).eq('id', usuarioInicial.id);
          if (error) throw error;
        }
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
        
        const { error: userError } = await supabase.from('tbl_usuarios').update({ permissoes: values.permissoes }).eq('email', values.email);
        if (userError) throw new Error('Usuário criado, mas falha ao definir permissões.');

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
          <FormItem><FormLabel>Nome</FormLabel><FormControl><Input placeholder="Nome completo" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="email" render={({ field }) => (
          <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="email@exemplo.com" {...field} disabled={isEditing} /></FormControl><FormMessage /></FormItem>
        )} />
        {!isEditing && (
          <FormField control={form.control} name="senha" render={({ field }) => (
            <FormItem><FormLabel>Senha Provisória</FormLabel><FormControl><Input type="password" placeholder="••••••••" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
        )}
        {isClient && (
          <FormField control={form.control} name="limite_usuarios" render={({ field }) => (
            <FormItem><FormLabel>Limite de Usuários da Equipe</FormLabel><FormControl><Input type="number" placeholder="5" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
        )}
        {(isClientBeingManagedByAdmin || isUserBeingManagedByClient) && (
          <div className="space-y-2">
            <div className="flex justify-between items-center mb-1">
              <FormLabel>Permissões de Acesso</FormLabel>
              <div className="space-x-2">
                <Button type="button" variant="link" size="sm" onClick={() => handleSelectAll(true)} className="p-0 h-auto">Selecionar Todos</Button>
                <Button type="button" variant="link" size="sm" onClick={() => handleSelectAll(false)} className="p-0 h-auto text-destructive">Desmarcar Todos</Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 rounded-lg border p-4">
              {permissoesVisiveis.map((p: Permissao) => (
                <FormField key={p.key} control={form.control} name={`permissoes.${p.key}`} render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                    <FormLabel className="font-normal">{p.label}</FormLabel>
                  </FormItem>
                )} />
              ))}
            </div>
          </div>
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