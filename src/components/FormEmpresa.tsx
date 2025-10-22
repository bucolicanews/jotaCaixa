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

const formSchema = z.object({
  nome_fantasia: z.string().min(1, 'O Nome Fantasia é obrigatório.'),
  razao_social: z.string().min(1, 'A Razão Social é obrigatória.'),
  cnpj: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface FormEmpresaProps {
  onSaveComplete: () => void;
}

const FormEmpresa: React.FC<FormEmpresaProps> = ({ onSaveComplete }) => {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { nome_fantasia: '', razao_social: '', cnpj: '' },
  });

  const onSubmit = async (values: FormValues) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      showError('Sessão de usuário não encontrada. Por favor, faça login novamente.');
      return;
    }

    const dataToSave = {
      usuario_id: user.id,
      nome_fantasia: values.nome_fantasia,
      razao_social: values.razao_social,
      cnpj: values.cnpj || null,
    };

    const { data, error } = await supabase.from('empresas').insert(dataToSave).select('id').single();

    if (error) {
      showError(`Falha ao cadastrar empresa: ${error.message}`);
    } else if (data?.id) {
      showSuccess(`Empresa "${values.nome_fantasia}" cadastrada com sucesso!`);
      onSaveComplete();
    } else {
      showError('Falha desconhecida ao cadastrar empresa.');
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="nome_fantasia"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome Fantasia</FormLabel>
              <FormControl><Input placeholder="Ex: Minha Contabilidade" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="razao_social"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Razão Social</FormLabel>
              <FormControl><Input placeholder="Ex: Empresa XYZ Ltda" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="cnpj"
          render={({ field }) => (
            <FormItem>
              <FormLabel>CNPJ (Opcional)</FormLabel>
              <FormControl><Input placeholder="00.000.000/0001-00" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Cadastrar Empresa e Continuar
        </Button>
      </form>
    </Form>
  );
};

export default FormEmpresa;