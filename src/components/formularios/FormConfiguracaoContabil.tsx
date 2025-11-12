import React, { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { Separator } from '../ui/separator';

const CATEGORIES_TO_MAP = [
  { key: 'Ativo', label: 'Ativo (Ex: 1)', defaultCode: '1' },
  { key: 'Passivo', label: 'Passivo (Ex: 2)', defaultCode: '2' },
  { key: 'Patrimonio Liquido', label: 'Patrimônio Líquido (Ex: 3)', defaultCode: '3' },
  { key: 'Receita', label: 'Receita (Ex: 4)', defaultCode: '4' },
  { key: 'Custo', label: 'Custo (Ex: 5)', defaultCode: '5' },
  { key: 'Despesa', label: 'Despesa (Ex: 6)', defaultCode: '6' },
];

// Cria um esquema dinâmico baseado nas chaves
const formSchema = z.object(
    CATEGORIES_TO_MAP.reduce((acc, cat) => {
        acc[cat.key] = z.string().min(1, `O código para ${cat.label} é obrigatório.`);
        return acc;
    }, {} as Record<string, z.ZodString>)
);

type FormValues = z.infer<typeof formSchema>;

interface FormConfiguracaoContabilProps {
  proprietarioId: string;
}

const FormConfiguracaoContabil: React.FC<FormConfiguracaoContabilProps> = ({ proprietarioId }) => {
  const [loadingData, setLoadingData] = useState(true);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: CATEGORIES_TO_MAP.reduce((acc, cat) => {
        (acc as any)[cat.key] = cat.defaultCode;
        return acc;
    }, {} as Partial<FormValues>),
  });

  const fetchConfig = useCallback(async () => {
    if (!proprietarioId) return;
    setLoadingData(true);
    
    const { data, error } = await supabase
      .from('configuracao_contabil')
      .select('codigo_nivel_1, tipo_natureza')
      .eq('proprietario_id', proprietarioId);

    if (error && error.code !== 'PGRST116') {
      showError('Erro ao carregar configuração contábil: ' + error.message);
    } else if (data) {
      const mappedData = data.reduce((acc, item) => {
        (acc as any)[item.tipo_natureza] = item.codigo_nivel_1;
        return acc;
      }, {} as Partial<FormValues>);
      
      // Mescla os defaults com os dados carregados
      form.reset({
          ...CATEGORIES_TO_MAP.reduce((acc, cat) => {
              (acc as any)[cat.key] = cat.defaultCode;
              return acc;
          }, {} as Partial<FormValues>),
          ...mappedData
      });
    }
    setLoadingData(false);
  }, [proprietarioId, form]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const onSubmit = async (values: FormValues) => {
    setLoadingData(true);
    
    const dataToUpsert = CATEGORIES_TO_MAP.map(cat => ({
        proprietario_id: proprietarioId,
        tipo_natureza: cat.key,
        codigo_nivel_1: values[cat.key as keyof FormValues],
    }));

    try {
      const { error } = await supabase
        .from('configuracao_contabil')
        .upsert(dataToUpsert, { onConflict: 'proprietario_id, tipo_natureza' });

      if (error) throw error;

      showSuccess('Configuração Contábil salva com sucesso!');
      fetchConfig();
    } catch (error: any) {
      showError(`Falha ao salvar configuração: ${error.message}`);
    } finally {
      setLoadingData(false);
    }
  };

  if (loadingData) {
    return <div className="flex justify-center items-center h-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <p className="text-sm text-muted-foreground">
            Mapeie as categorias contábeis padrão do sistema para o código de nível 1 (o primeiro dígito) do seu Plano de Contas.
        </p>
        
        <div className="grid grid-cols-2 gap-4">
            {CATEGORIES_TO_MAP.map(cat => (
                <FormField
                    key={cat.key}
                    control={form.control}
                    name={cat.key as keyof FormValues}
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{cat.label}</FormLabel>
                            <FormControl>
                                <Input 
                                    placeholder={cat.defaultCode} 
                                    {...field} 
                                    className="font-mono"
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            ))}
        </div>
        
        <Separator />
        
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar Mapeamento de Níveis
        </Button>
      </form>
    </Form>
  );
};

export default FormConfiguracaoContabil;