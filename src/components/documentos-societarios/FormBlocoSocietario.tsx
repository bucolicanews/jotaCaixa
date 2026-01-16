import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save, Tag, Copy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { BlocoSocietario } from '@/types/documentos-societarios';
import { sanitizeConteudo } from '@/utils/formatters';
import { TAGS_PADRAO } from '@/config/contrato-tags-padrao';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';

const formSchema = z.object({
  titulo: z.string().min(1, 'O título é obrigatório.'),
  conteudo: z.string().min(10, 'O conteúdo do bloco é muito curto.'),
  tipo_bloco: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface FormBlocoSocietarioProps {
  blocoInicial?: BlocoSocietario | null;
  onSaveComplete: () => void;
  ownerId: string | null;
}

const FormBlocoSocietario: React.FC<FormBlocoSocietarioProps> = ({ blocoInicial, onSaveComplete, ownerId }) => {
  const isEditing = !!blocoInicial;
  const [tagsCustomizadas, setTagsCustomizadas] = useState<any[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      titulo: blocoInicial?.titulo || '',
      conteudo: blocoInicial?.conteudo ? sanitizeConteudo(blocoInicial.conteudo) : '',
      tipo_bloco: blocoInicial?.tipo_bloco || 'Geral',
    },
  });

  const fetchTags = useCallback(async () => {
    if (!ownerId) return;
    setLoadingTags(true);
    const { data, error } = await supabase
        .from('contrato_tags')
        .select('*')
        .eq('empresa_id', ownerId)
        .order('nome_tag', { ascending: true });

    if (!error && data) {
        setTagsCustomizadas(data);
    }
    setLoadingTags(false);
  }, [ownerId]);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  const allTags = useMemo(() => {
      const tagsNaoFinanceiras = TAGS_PADRAO.filter(t => !t.origem_dado?.startsWith('contas_receber'));
      const combined = [...tagsNaoFinanceiras, ...tagsCustomizadas];
      return Array.from(new Set(combined.map(t => t.nome_tag)))
          .map(tagKey => combined.find(t => t.nome_tag === tagKey))
          .filter((t): t is any => !!t)
          .sort((a, b) => a.nome_tag.localeCompare(b.nome_tag));
  }, [tagsCustomizadas]);

  const handleInsertTag = (tag: string) => {
      const currentContent = form.getValues('conteudo') || '';
      const textarea = document.getElementById('conteudo-bloco-textarea') as HTMLTextAreaElement;
      
      if (textarea) {
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          const newValue = currentContent.substring(0, start) + tag + currentContent.substring(end);
          
          form.setValue('conteudo', newValue, { shouldDirty: true });
          
          setTimeout(() => {
              textarea.focus();
              textarea.selectionStart = textarea.selectionEnd = start + tag.length;
          }, 0);
      } else {
          form.setValue('conteudo', currentContent + tag, { shouldDirty: true });
      }
  };

  const handleCopyAllTags = () => {
      if (allTags.length === 0) return;
      const tagsString = allTags.map(t => t.nome_tag).join(', ');
      navigator.clipboard.writeText(tagsString);
      showSuccess('Todas as tags copiadas para a área de transferência!');
  };

  const onSubmit = async (values: FormValues) => {
    if (!ownerId) {
        showError('ID do proprietário não encontrado.');
        return;
    }
    
    const dataToSave = {
      proprietario_id: ownerId,
      titulo: values.titulo,
      conteudo: sanitizeConteudo(values.conteudo),
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-4">
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
                        <Textarea 
                            id="conteudo-bloco-textarea"
                            rows={12} 
                            placeholder="Insira o conteúdo aqui..." 
                            {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
            </div>

            <div className="md:col-span-1 border rounded-md p-4 bg-secondary/20 h-full flex flex-col">
                <h4 className="font-semibold flex items-center mb-2">
                    <Tag className="w-4 h-4 mr-2" /> Tags Disponíveis
                </h4>
                <p className="text-xs text-muted-foreground mb-4">Clique na tag para inserir no cursor.</p>
                
                <Button 
                    type="button" 
                    variant="secondary" 
                    size="sm" 
                    onClick={handleCopyAllTags}
                    className="w-full mb-4"
                    disabled={allTags.length === 0}
                >
                    <Copy className="w-4 h-4 mr-2" /> Copiar Todas as Tags
                </Button>
                
                <ScrollArea className="flex-1 pr-2 max-h-[450px]">
                    <div className="space-y-2">
                        {loadingTags ? (
                            <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
                        ) : (
                            allTags.map((tag) => (
                                <div 
                                    key={tag.nome_tag}
                                    onClick={() => handleInsertTag(tag.nome_tag)}
                                    className="p-2 border rounded bg-background hover:bg-accent cursor-pointer transition-colors text-left"
                                >
                                    <code className="text-xs font-bold text-primary">{tag.nome_tag}</code>
                                    <p className="text-[10px] text-muted-foreground mt-1 leading-tight">{tag.descricao}</p>
                                </div>
                            ))
                        )}
                    </div>
                </ScrollArea>
            </div>
        </div>

        <Separator />
        
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