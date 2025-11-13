import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { BlocoSocietario } from '@/types/documentos-societarios';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';

const formSchema = z.object({
  titulo: z.string().min(1, 'O título é obrigatório.'),
  conteudo: z.string().min(10, 'O conteúdo do bloco é muito curto.'),
  tipo_bloco: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface FormBlocoSocietarioProps {
  blocoInicial?: BlocoSocietario | null;
  onSaveComplete: () => void;
}

const FormBlocoSocietario: React.FC<FormBlocoSocietarioProps> = ({ blocoInicial, onSaveComplete }) => {
  const isEditing = !!blocoInicial;
  const { role, perfil, usuario } = useSessao();
  
  const getOwnerId = () => {
    if (role === 'Admin') return usuario?.id || null;
    if (role === 'Cliente') return (perfil as ClienteProfile)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id; // FIX: proprietario_id -> cliente_id
    return null;
  };
  
  const ownerId = getOwnerId();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      titulo: blocoInicial?.titulo || '',
      conteudo: blocoInicial?.conteudo || '',
      tipo_bloco: blocoInicial?.tipo_bloco || 'Geral',
    },
  });

  const onSubmit = async (values: FormValues) => {
    if (!ownerId) {
        showError('ID do proprietário não encontrado. Não é possível salvar.');
        return;
    }
    
    const dataToSave = {
      proprietario_id: ownerId,
      titulo: values.titulo,
      conteudo: values.conteudo,
      tipo_bloco: values.tipo_bloco || null,
    };

    let error = null;

    if (isEditing) {
      const result = await supabase
        .from('blocos_societarios')
        .update(dataToSave)
        .eq('id', blocoInicial.id);
      error = result.error;
    } else {
      const result = await supabase
        .from('blocos_societarios')
        .insert(dataToSave);
      error = result.error;
    }

    if (error) {
      showError(`Falha ao salvar bloco: ${error.message}`);
    } else {
      showSuccess(`Bloco salvo com sucesso!`);
      onSaveComplete();
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="titulo"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Título do Bloco</FormLabel>
              <FormControl><Input placeholder="Ex: Cláusula de Vigência" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="tipo_bloco"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tipo de Bloco (Opcional)</FormLabel>
              <FormControl><Input placeholder="Ex: Geral, Financeiro" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="conteudo"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Conteúdo (Pode conter tags)</FormLabel>
              <FormControl>
                <Textarea rows={10} placeholder="Insira o conteúdo aqui..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <Save className="mr-2 h-4 w-4" />
          Salvar Bloco
        </Button>
      </form>
    </Form>
  );
};

export default FormBlocoSocietario;