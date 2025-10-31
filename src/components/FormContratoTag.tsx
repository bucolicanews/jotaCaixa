import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { ContratoTag } from '@/types/contratos';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';

const formSchema = z.object({
  nome_tag: z.string().min(3, 'A tag deve ter pelo menos 3 caracteres.').regex(/^\{\{[a-z0-9_]+\}\}$/, 'A tag deve estar no formato {{nome_tag}} e conter apenas letras minúsculas, números e underscore.'),
  descricao: z.string().min(1, 'A descrição é obrigatória.'),
  origem_dado: z.string().optional().or(z.literal('')),
});

type FormValues = z.infer<typeof formSchema>;

interface FormContratoTagProps {
  tagInicial?: ContratoTag | null;
  onSaveComplete: () => void;
}

const FormContratoTag: React.FC<FormContratoTagProps> = ({ tagInicial, onSaveComplete }) => {
  const isEditing = !!tagInicial;
  const { role, perfil, usuario } = useSessao();
  
  const getOwnerId = () => {
    if (role === 'Admin') return usuario?.id || null;
    if (role === 'Cliente') return (perfil as ClienteProfile)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id;
    return null;
  };
  
  const ownerId = getOwnerId();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome_tag: tagInicial?.nome_tag || '{{nova_tag}}',
      descricao: tagInicial?.descricao || '',
      origem_dado: tagInicial?.origem_dado || '',
    },
  });

  const onSubmit = async (values: FormValues) => {
    if (!ownerId) {
        showError('ID do proprietário não encontrado. Não é possível salvar.');
        return;
    }
    
    const dataToSave = {
      nome_tag: values.nome_tag,
      descricao: values.descricao,
      origem_dado: values.origem_dado || null,
      empresa_id: ownerId, // Usando o ID do Admin/Cliente
    };

    let error = null;

    if (isEditing) {
      // Atualizar
      const result = await supabase
        .from('contrato_tags')
        .update(dataToSave)
        .eq('id', tagInicial.id);
      error = result.error;
    } else {
      // Inserir
      const result = await supabase
        .from('contrato_tags')
        .insert(dataToSave);
      error = result.error;
    }

    if (error) {
      showError(`Falha ao salvar tag: ${error.message}`);
    } else {
      showSuccess(`Tag salva com sucesso!`);
      onSaveComplete();
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="nome_tag"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome da Tag (Formato: {'{{nome_tag}}'})</FormLabel>
              <FormControl>
                <Input placeholder="{{nome_do_cliente}}" {...field} disabled={isEditing} />
              </FormControl>
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
              <FormControl>
                <Textarea placeholder="Ex: Nome completo do cliente ou razão social" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="origem_dado"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Origem do Dado (Opcional)</FormLabel>
              <FormControl>
                <Input placeholder="Ex: clientes.nome_razao_social" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? 'Salvar Alterações' : 'Criar Tag'}
        </Button>
      </form>
    </Form>
  );
};

export default FormContratoTag;