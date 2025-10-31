import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { Plano } from '@/types/plano';
import { PERMISSOES_DISPONIVEIS } from '@/config/permissoes';

const formSchema = z.object({
  nome: z.string().min(1, 'O nome é obrigatório.'),
  descricao: z.string().optional(),
  preco_mensal: z.coerce.number().positive('O preço deve ser positivo.'),
  dias_trial: z.coerce.number().int().min(0, 'O trial deve ser 0 ou mais dias.'),
  tipo_cliente: z.enum(['PF', 'PJ'], { required_error: 'O tipo de cliente é obrigatório.' }),
  permissoes: z.record(z.boolean()).optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface FormPlanoProps {
  planoInicial?: Plano | null;
  onSaveComplete: () => void;
}

const FormPlano: React.FC<FormPlanoProps> = ({ planoInicial, onSaveComplete }) => {
  const isEditing = !!planoInicial;

  const defaultPermissoes = PERMISSOES_DISPONIVEIS.reduce((acc: Record<string, boolean>, p) => {
    // Exclui permissões de usuário final (ponto) e visualização própria
    if (p.key === 'ponto_eletronico' || p.key === 'visualizar_proprio_ponto') {
        return acc;
    }
    
    if (planoInicial?.permissoes) {
      acc[p.key] = planoInicial.permissoes[p.key] === true;
    } else {
      // Padrão: todos desativados, exceto os essenciais para o trial (Contas a Pagar/Receber, Bancos, Relatórios, Configurações)
      acc[p.key] = ['contas_pagar', 'contas_receber', 'bancos', 'relatorios', 'configuracoes'].includes(p.key);
    }
    return acc;
  }, {} as Record<string, boolean>);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome: planoInicial?.nome || '',
      descricao: planoInicial?.descricao || '',
      preco_mensal: planoInicial?.preco_mensal || 0,
      dias_trial: planoInicial?.dias_trial || 7,
      tipo_cliente: planoInicial?.tipo_cliente || 'PJ',
      permissoes: defaultPermissoes,
    },
  });

  const onSubmit = async (values: FormValues) => {
    const dataToSave = {
      nome: values.nome,
      descricao: values.descricao || null,
      preco_mensal: values.preco_mensal,
      dias_trial: values.dias_trial,
      tipo_cliente: values.tipo_cliente,
      permissoes: values.permissoes,
    };

    let error = null;

    if (isEditing) {
      const result = await supabase
        .from('planos')
        .update(dataToSave)
        .eq('id', planoInicial.id);
      error = result.error;
    } else {
      const result = await supabase
        .from('planos')
        .insert(dataToSave);
      error = result.error;
    }

    if (error) {
      showError(`Falha ao salvar plano: ${error.message}`);
    } else {
      showSuccess(`Plano salvo com sucesso!`);
      onSaveComplete();
    }
  };

  // Filtra as permissões que são relevantes para o plano (módulos de empresa)
  const permissoesModulos = PERMISSOES_DISPONIVEIS.filter(p => 
    p.key !== 'ponto_eletronico' && p.key !== 'visualizar_proprio_ponto'
  );

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="nome"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome do Plano</FormLabel>
                <FormControl><Input placeholder="Ex: Plano Empresa" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="tipo_cliente"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo de Cliente</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="PF">Pessoa Física</SelectItem>
                    <SelectItem value="PJ">Pessoa Jurídica</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        
        <FormField
          control={form.control}
          name="descricao"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descrição</FormLabel>
              <FormControl><Textarea placeholder="Breve descrição do plano" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="preco_mensal"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Preço Mensal (R$)</FormLabel>
                <FormControl><Input type="number" step="0.01" placeholder="89.00" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="dias_trial"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Dias de Trial Grátis</FormLabel>
                <FormControl><Input type="number" step="1" placeholder="7" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        
        <h3 className="font-semibold mt-6 border-t pt-4">Módulos Liberados (Permissões)</h3>
        <div className="grid grid-cols-2 gap-4 rounded-lg border p-4">
          {permissoesModulos.map((p) => (
            <FormField key={p.key} control={form.control} name={`permissoes.${p.key}`} render={({ field }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <FormLabel className="font-normal">{p.label}</FormLabel>
              </FormItem>
            ))}
          />
        </div>

        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar Plano
        </Button>
      </form>
    </Form>
  );
};

export default FormPlano;