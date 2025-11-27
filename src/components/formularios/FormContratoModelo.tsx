import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Tag, Save, Eye, Copy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { ContratoModelo, ContratoTag } from '@/types/contratos';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { Separator } from '@/components/ui/separator';
import ContratoPreviewDialog from '../contratos/ContratoPreviewDialog';
import { TAGS_PADRAO } from '@/config/contrato-tags-padrao';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { sanitizeConteudo, stripHtmlTags } from '@/utils/formatters';
import RichTextEditor from '@/components/ui/RichTextEditor'; // Importando o editor

// Extensão local para ContratoModelo
interface ExtendedContratoModelo extends ContratoModelo {
    tipo_conteudo?: 'html' | 'texto';
}

const formSchema = z.object({
  titulo: z.string().min(1, 'O título é obrigatório.'),
  conteudo_template: z.string().min(10, 'O conteúdo do template é muito curto.'),
  tipo_conteudo: z.enum(['html', 'texto']),
});

type FormValues = z.infer<typeof formSchema>;

interface FormContratoModeloProps {
  modeloInicial?: ExtendedContratoModelo | null;
  onSaveComplete: () => void;
}

const FormContratoModelo: React.FC<FormContratoModeloProps> = ({ modeloInicial, onSaveComplete }) => {
  const isEditing = !!modeloInicial;
  const { role, perfil, usuario } = useSessao();
  const [tagsCustomizadas, setTagsCustomizadas] = useState<ContratoTag[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [conteudoPreview, setConteudoPreview] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const getOwnerId = () => {
    if (role === 'Admin') return usuario?.id || null;
    if (role === 'Cliente') return (perfil as ClienteProfile)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id;
    return null;
  };
  
  const ownerId = getOwnerId();

  const fetchTags = useCallback(async () => {
    if (!ownerId) return;
    
    const { data, error } = await supabase
        .from('contrato_tags')
        .select('*')
        .eq('empresa_id', ownerId)
        .order('nome_tag', { ascending: true });
        
    if (error) {
        console.error('Erro ao carregar tags customizadas:', error);
        setTagsCustomizadas([]);
    } else {
        setTagsCustomizadas(data as ContratoTag[]);
    }
  }, [ownerId]);
  
  useEffect(() => {
      fetchTags();
  }, [fetchTags]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      titulo: modeloInicial?.titulo || '',
      // Se for HTML, aplicamos sanitize, senão, usamos o valor puro
      conteudo_template: modeloInicial?.conteudo_template ? sanitizeConteudo(modeloInicial.conteudo_template) : '', 
      tipo_conteudo: modeloInicial?.tipo_conteudo || 'html',
    },
  });
  
  const tipoConteudoWatch = form.watch('tipo_conteudo');

  const onSubmit = async (values: FormValues) => {
    if (!ownerId) {
        showError('ID do proprietário não encontrado. Não é possível salvar.');
        return;
    }
    
    let finalContent = values.conteudo_template;
    
    // CRÍTICO: Se o tipo for 'texto', removemos todas as tags HTML antes de salvar
    if (values.tipo_conteudo === 'texto') {
        finalContent = stripHtmlTags(finalContent);
    }
    
    const dataToSave = {
      titulo: values.titulo,
      conteudo_template: finalContent, 
      tipo_conteudo: values.tipo_conteudo,
      empresa_id: ownerId,
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
  
  const handlePreview = () => {
      const template = form.getValues('conteudo_template');
      
      // Substituição básica para a prévia (apenas tags padrão)
      let previewContent = template;
      [...TAGS_PADRAO, ...tagsCustomizadas].forEach(tag => {
          const regex = new RegExp(tag.nome_tag, 'g');
          previewContent = previewContent.replace(regex, `[${tag.descricao}]`);
      });
      
      // Se for texto simples, precisamos renderizar o texto puro na prévia
      if (tipoConteudoWatch === 'texto') {
          previewContent = stripHtmlTags(previewContent);
      }
      
      setConteudoPreview(previewContent);
      setPreviewTitle(form.getValues('titulo'));
      setPreviewOpen(true);
  };
  
  const allTags = useMemo(() => {
      return [...TAGS_PADRAO, ...tagsCustomizadas].sort((a, b) => a.nome_tag.localeCompare(b.nome_tag));
  }, [tagsCustomizadas]);
  
  const handleCopyAllTags = () => {
      const tagsString = allTags.map(t => t.nome_tag).join(', ');
      navigator.clipboard.writeText(tagsString);
      showSuccess('Todas as tags copiadas para a área de transferência!');
  };
  
  // --- FUNÇÕES DE DRAG AND DROP (Apenas para Textarea Simples) ---
  
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, tag: string) => {
      e.dataTransfer.setData("text/plain", tag);
  };
  
  const handleDragOver = (e: React.DragEvent<HTMLTextAreaElement>) => {
      e.preventDefault();
  };
  
  const handleDrop = (e: React.DragEvent<HTMLTextAreaElement>) => {
      e.preventDefault();
      const tag = e.dataTransfer.getData("text/plain");
      
      if (!tag) return;
      
      const textarea = textareaRef.current;
      if (!textarea) return;
      
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const currentValue = form.getValues('conteudo_template');
      
      const newValue = currentValue.substring(0, start) + tag + currentValue.substring(end);
      
      form.setValue('conteudo_template', newValue, { shouldDirty: true });
      
      setTimeout(() => {
          textarea.focus();
          textarea.selectionStart = start + tag.length;
          textarea.selectionEnd = start + tag.length;
      }, 0);
  };
  
  // --- FIM FUNÇÕES DE DRAG AND DROP ---

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-4">
              <FormField
                control={form.control}
                name="titulo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Título do Modelo</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Contrato de Prestação de Serviços" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="tipo_conteudo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Conteúdo</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o formato" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="html">HTML (Edição de Código)</SelectItem>
                        <SelectItem value="texto">Texto Simples (Editor WYSIWYG)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="conteudo_template"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex justify-between items-center">
                        Conteúdo do Template
                        <Button type="button" variant="outline" size="sm" onClick={handlePreview} disabled={!field.value}>
                            <Eye className="mr-2 h-4 w-4" /> Pré-visualizar
                        </Button>
                    </FormLabel>
                    <FormControl>
                        {/* CORREÇÃO AQUI: Renderização condicional */}
                        {tipoConteudoWatch === 'texto' ? (
                            <RichTextEditor
                                value={field.value}
                                onChange={field.onChange}
                                placeholder="Digite ou cole o texto aqui. A formatação será preservada."
                                className="min-h-[300px]"
                            />
                        ) : (
                            <Textarea 
                                ref={textareaRef}
                                placeholder="Cole o código HTML completo aqui (incluindo tags <html> e <style>)" 
                                {...field} 
                                rows={20}
                                className={cn(
                                    "font-mono text-sm", 
                                    tipoConteudoWatch === 'html' ? 'bg-yellow-50/50 dark:bg-yellow-900/10' : ''
                                )}
                                onDragOver={handleDragOver}
                                onDrop={handleDrop}
                            />
                        )}
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            {/* Coluna de Tags */}
            <Card className="md:col-span-1 max-h-[600px] overflow-y-auto">
                <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center"><Tag className="w-4 h-4 mr-2" /> Tags Disponíveis</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground mb-3">Clique para copiar ou arraste para o campo de conteúdo.</p>
                    
                    <Button 
                        variant="secondary" 
                        size="sm" 
                        onClick={handleCopyAllTags}
                        className="w-full mb-4"
                        disabled={allTags.length === 0}
                    >
                        <Copy className="w-4 h-4 mr-2" /> Copiar Todas as Tags ({allTags.length})
                    </Button>
                    
                    <div className="space-y-2">
                        {allTags.map((tag: ContratoTag) => (
                            <div 
                                key={tag.nome_tag} 
                                className="p-2 border rounded-md cursor-pointer hover:bg-accent/50 transition-colors"
                                draggable={tipoConteudoWatch === 'texto'} // Apenas arrastável se for texto simples
                                onDragStart={(e) => handleDragStart(e, tag.nome_tag)}
                                onClick={() => {
                                    navigator.clipboard.writeText(tag.nome_tag);
                                    showSuccess(`Tag ${tag.nome_tag} copiada!`);
                                }}
                            >
                                <p className="font-mono text-xs font-semibold text-primary">{tag.nome_tag}</p>
                                <p className="text-xs text-muted-foreground">{tag.descricao}</p>
                            </div>
                        ))}
                    </div>
                    <Separator className="my-4" />
                    <p className="text-xs text-muted-foreground">
                        Gerencie tags customizadas em <a href="/contratos/tags" className="underline">Cadastrar Tags</a>.
                    </p>
                </CardContent>
            </Card>
          </div>

          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Save className="mr-2 h-4 w-4" />
            Salvar Modelo
          </Button>
        </form>
      </Form>
      
      <ContratoPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        conteudoHtml={conteudoPreview}
        titulo={form.getValues('titulo')}
        isHtml={form.getValues('tipo_conteudo') === 'html'}
      />
    </>
  );
};

export default FormContratoModelo;