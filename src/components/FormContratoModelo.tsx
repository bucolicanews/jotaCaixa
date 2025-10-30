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
import { ContratoModelo } from '@/types/contratos';

const formSchema = z.object({
  titulo: z.string().min(1, 'O título é obrigatório.'),
  conteudo_template: z.string().min(50, 'O conteúdo do template deve ser detalhado (mínimo 50 caracteres).'),
});

type FormValues = z.infer<typeof formSchema>;

interface FormContratoModeloProps {
  modeloInicial?: ContratoModelo | null;
  empresaId: string | null; // ID da empresa (null se for Admin)
  onSaveComplete: () => void;
}

const FormContratoModelo: React.FC<FormContratoModeloProps> = ({ modeloInicial, empresaId, onSaveComplete }) => {
  const isEditing = !!modeloInicial;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      titulo: modeloInicial?.titulo || '',
      conteudo_template: modeloInicial?.conteudo_template || '',
    },
  });

  const onSubmit = async (values: FormValues) => {
    const dataToSave = {
      titulo: values.titulo,
      conteudo_template: values.conteudo_template,
      empresa_id: empresaId, // Será null para Admin, ou o ID do Cliente
    };

    let error = null;

    if (isEditing) {
      // Atualizar
      const result = await supabase
        .from('contrato_modelos')
        .update(dataToSave)
        .eq('id', modeloInicial.id);
      error = result.error;
    } else {
      // Inserir
      const result = await supabase
        .from('contrato_modelos')
        .insert(dataToSave);
      error = result.error;
    }

    if (error) {
      showError(`Falha ao salvar modelo: ${error.message}`);
    } else {
      showSuccess(`Modelo salvo com sucesso!`);
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
              <FormLabel>Título do Modelo</FormLabel>
              <FormControl>
                <Input placeholder="Ex: Contrato de Prestação de Serviços Padrão" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="conteudo_template"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Conteúdo do Template (Use tags como {'{{nome_cliente}}'})</FormLabel>
              <FormControl>
                <Textarea 
                    placeholder="[CONTRATO] Pelo presente instrumento, o CONTRATANTE {{nome_cliente}}..." 
                    rows={15} 
                    {...field} 
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? 'Salvar Alterações' : 'Criar Modelo'}
        </Button>
      </form>
    </Form>
  );
};

export default FormContratoModelo;