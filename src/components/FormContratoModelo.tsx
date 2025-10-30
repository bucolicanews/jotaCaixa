import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save, Tag as TagIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { ContratoModelo, ContratoTag } from '@/types/contratos';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { TAGS_PADRAO, TagPadrao } from '@/config/contrato-tags-padrao';
import { useSessao } from '@/hooks/use-sessao';
import { cn } from '@/lib/utils';

const formSchema = z.object({
  titulo: z.string().min(1, 'O título é obrigatório.'),
  conteudo_template: z.string().min(50, 'O conteúdo do template deve ser detalhado.'),
});

type FormValues = z.infer<typeof formSchema>;

interface FormContratoModeloProps {
  modeloInicial?: ContratoModelo | null;
  onSaveComplete: () => void;
}

const FormContratoModelo: React.FC<FormContratoModeloProps> = ({ modeloInicial, onSaveComplete }) => {
  const { role, perfil } = useSessao();
  const isEditing = !!modeloInicial;
  const [tagsAvulsas, setTagsAvulsas] = useState<ContratoTag[]>([]);
  const [loadingTags, setLoadingTags] = useState(true);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      titulo: modeloInicial?.titulo || '',
      conteudo_template: modeloInicial?.conteudo_template || '',
    },
  });
  
  const getEmpresaId = () => (role === 'Cliente' && perfil && 'id' in perfil) ? perfil.id : null;
  const empresaId = getEmpresaId();

  // Carregar tags avulsas (criadas pelo Admin ou pelo Cliente)
  React.useEffect(() => {
    const fetchTags = async () => {
      setLoadingTags(true);
      let query = supabase.from('contrato_tags').select('*').order('nome_tag');
      
      if (role === 'Cliente' && empresaId) {
        query = query.eq('empresa_id', empresaId);
      } else if (role === 'Admin') {
        // Admin vê todas as tags (RLS garante isso)
      } else {
        setTagsAvulsas([]);
        setLoadingTags(false);
        return;
      }

      const { data, error } = await query;
      
      if (error) {
        showError('Erro ao carregar tags avulsas: ' + error.message);
        setTagsAvulsas([]);
      } else {
        setTagsAvulsas(data as ContratoTag[]);
      }
      setLoadingTags(false);
    };
    fetchTags();
  }, [role, empresaId]);
  
  const handleInsertTag = (tag: string) => {
    const currentContent = form.getValues('conteudo_template');
    form.setValue('conteudo_template', currentContent + tag, { shouldDirty: true });
  };

  const onSubmit = async (values: FormValues) => {
    const dataToSave = {
      titulo: values.titulo,
      conteudo_template: values.conteudo_template,
      empresa_id: role === 'Admin' ? null : empresaId, // Admin salva como global (null), Cliente salva com seu ID
    };

    let error = null;

    if (isEditing) {
      const result = await supabase
        .from('contrato_modelos')
        .update(dataToSave)
        .eq('id', modeloInicial.id);
      error = result.error;
    } else {
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

  const tagsDisponiveis = [...TAGS_PADRAO, ...tagsAvulsas.map(t => ({ ...t, categoria: 'Avulsa' as const }))];

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
        
        <Card>
            <CardHeader className="p-4 pb-2">
                <CardTitle className="text-base flex items-center">
                    <TagIcon className="w-4 h-4 mr-2" /> Tags Dinâmicas
                </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
                <p className="text-sm text-muted-foreground mb-3">Clique nas tags para inseri-las no conteúdo do contrato.</p>
                {loadingTags ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                    <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-2 border rounded-md">
                        {tagsDisponiveis.map((tag, index) => (
                            <Button 
                                key={index} 
                                type="button" 
                                variant="secondary" 
                                size="sm" 
                                onClick={() => handleInsertTag(tag.nome_tag)}
                                className={cn(
                                    "text-xs font-mono",
                                    tag.categoria === 'Financeiro' && 'bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/50 dark:text-green-300',
                                    tag.categoria === 'Contratante' && 'bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900/50 dark:text-blue-300',
                                    tag.categoria === 'Contratado' && 'bg-purple-100 text-purple-800 hover:bg-purple-200 dark:bg-purple-900/50 dark:text-purple-300',
                                )}
                            >
                                {tag.nome_tag}
                            </Button>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>

        <FormField
          control={form.control}
          name="conteudo_template"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Conteúdo do Contrato (Template)</FormLabel>
              <FormControl>
                <Textarea 
                    placeholder="Digite o texto do contrato, usando as tags dinâmicas para os campos variáveis." 
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
          <Save className="w-4 h-4 mr-2" />
          Salvar Modelo
        </Button>
      </form>
    </Form>
  );
};

export default FormContratoModelo;