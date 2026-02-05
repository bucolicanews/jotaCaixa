import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, Eye, Tag, Copy, PlusCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { ContratoModelo, ContratoTag, BlocoSocietario } from '@/types/contratos';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile, UsuarioProfile, AdminUsuarioProfile } from '@/types/usuario';
import { Separator } from '@/components/ui/separator';
import ContratoPreviewDialog from '../contratos/ContratoPreviewDialog';
import { TAGS_PADRAO } from '@/config/contrato-tags-padrao';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { sanitizeConteudo } from '@/utils/formatters';
import RichTextEditor, { RichTextEditorRef } from '@/components/RichTextEditor';
import { ScrollArea } from '@/components/ui/scroll-area';

// Extensão local para ContratoModelo
interface ExtendedContratoModelo extends ContratoModelo {
    tipo_conteudo?: 'html' | 'texto'; // Reintroduzindo o campo
}

const formSchema = z.object({
  titulo: z.string().min(1, 'O título é obrigatório.'),
  conteudo_template: z.string().min(10, 'O conteúdo do template é muito curto.'),
  tipo_documento: z.string().optional(),
  tipo_conteudo: z.enum(['html', 'texto']), // Reintroduzindo no esquema
});

type FormValues = z.infer<typeof formSchema>;

interface FormContratoModeloProps {
  modeloInicial?: ExtendedContratoModelo | null;
  onSaveComplete: () => void;
  ownerId: string | null; // Adicionando ownerId como prop obrigatória
}

const FormContratoModelo: React.FC<FormContratoModeloProps> = ({ modeloInicial, onSaveComplete, ownerId }) => {
  const isEditing = !!modeloInicial;
  const { role, perfil, usuario } = useSessao();
  const [tagsCustomizadas, setTagsCustomizadas] = useState<ContratoTag[]>([]);
  const [blocos, setBlocos] = useState<BlocoSocietario[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [conteudoPreview, setConteudoPreview] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');
  const quillRef = useRef<RichTextEditorRef>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [loadingTags, setLoadingTags] = useState(false);
  
  // Garantimos que o ID do proprietário seja usado corretamente em todos os fetches
  const targetOwnerId = ownerId;

  const fetchBlocos = useCallback(async () => {
    if (!targetOwnerId) return;
    
    const { data: blocosData, error: blocosError } = await supabase
      .from('blocos_societarios')
      .select('*')
      .or(`proprietario_id.eq.${targetOwnerId},proprietario_id.is.null`)
      .order('titulo');

    if (blocosError) {
      console.error('Erro ao carregar blocos:', blocosError);
      showError('Falha ao carregar blocos.');
    } else {
      setBlocos(blocosData as BlocoSocietario[]);
    }
  }, [targetOwnerId]);

  const fetchTags = useCallback(async () => {
    if (!targetOwnerId) return;
    setLoadingTags(true);

    const { data: tagsData, error: tagsError } = await supabase
      .from('contrato_tags')
      .select('*')
      .eq('empresa_id', targetOwnerId)
      .order('nome_tag', { ascending: true });

    if (tagsError) {
      console.error('Erro ao carregar tags:', tagsError);
    } else if (tagsData) {
      setTagsCustomizadas(tagsData as any[]);
    }
    setLoadingTags(false);
  }, [targetOwnerId]);

  useEffect(() => {
    if (targetOwnerId) {
        fetchBlocos();
        fetchTags();
    }
  }, [targetOwnerId, fetchBlocos, fetchTags]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      titulo: modeloInicial?.titulo || '',
      conteudo_template: modeloInicial?.conteudo_template || '', 
      tipo_documento: modeloInicial?.tipo_documento || '',
      tipo_conteudo: modeloInicial?.tipo_conteudo || 'html', // Default to HTML
    },
  });
  
  const onSubmit = async (values: FormValues) => {
    if (!targetOwnerId) {
        showError('ID do proprietário não encontrado. Não é possível salvar.');
        return;
    }
    
    const dataToSave = {
      proprietario_id: targetOwnerId,
      titulo: values.titulo,
      conteudo_template: sanitizeConteudo(values.conteudo_template),
      tipo_conteudo: values.tipo_conteudo, 
      tipo_documento: values.tipo_documento || null,
    };

    let error = null;

    if (isEditing) {
      const result = await supabase
        .from('modelos_societarios')
        .update(dataToSave)
        .eq('id', modeloInicial.id);
      error = result.error;
    } else {
      const result = await supabase
        .from('modelos_societarios')
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
      if (!modeloInicial) return;
      const template = form.getValues('conteudo_template');
      
      // Substituição básica para a prévia (apenas tags padrão)
      let previewContent = template;
      allTags.forEach(tag => {
          const regex = new RegExp(tag.nome_tag, 'g');
          previewContent = previewContent.replace(regex, `[${tag.descricao}]`);
      });
      
      setConteudoPreview(previewContent);
      setPreviewTitle(form.getValues('titulo'));
      setPreviewOpen(true);
  };
  
  const allTags = useMemo(() => {
      const tagMap = new Map<string, any>();
      tagsCustomizadas.forEach(tag => tagMap.set(tag.nome_tag, tag));
      TAGS_PADRAO.filter(t => !t.origem_dado?.startsWith('contas_receber')).forEach(tag => {
          if (!tagMap.has(tag.nome_tag)) {
              tagMap.set(tag.nome_tag, tag);
          }
      });
      return Array.from(tagMap.values()).sort((a, b) => a.nome_tag.localeCompare(b.nome_tag));
  }, [tagsCustomizadas]);
  
  const handleCopyAllTags = () => {
      if (allTags.length === 0) return;
      const tagsString = allTags.map(t => t.nome_tag).join(', ');
      navigator.clipboard.writeText(tagsString);
      showSuccess('Todas as tags copiadas para a área de transferência!');
  };
  
  // --- FUNÇÕES DE INSERÇÃO DE TEXTO (Tags e Blocos) ---
  
  const handleInsertText = useCallback((textToInsert: string, isHtml = false) => {
    const editor = quillRef.current?.getEditor()?.getEditor();
    if (editor) {
      const range = editor.getSelection(true);
      if (isHtml) {
        editor.clipboard.dangerouslyPasteHTML(range.index, textToInsert);
      } else {
        editor.insertText(range.index, textToInsert, 'user');
      }
      editor.setSelection(range.index + textToInsert.length, 0, 'silent');
    } else {
      const current = form.getValues("conteudo_template") || "";
      const textarea = document.getElementById("conteudo-template-textarea") as HTMLTextAreaElement;
      
      if (textarea) {
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          const newValue = current.substring(0, start) + textToInsert + current.substring(end);
          
          form.setValue('conteudo_template', newValue, { shouldDirty: true, shouldValidate: true });
          
          setTimeout(() => {
              textarea.focus();
              textarea.selectionStart = textarea.selectionEnd = start + textToInsert.length;
          }, 0);
      } else {
          form.setValue("conteudo_template", current + textToInsert, { shouldDirty: true, shouldValidate: true });
      }
    }
  }, [form]);

  const handleInsertBloco = (bloco: BlocoSocietario) => {
    const contentToInsert = `<br><p>${bloco.conteudo.replace(/\n/g, '<br>')}</p><br>`;
    handleInsertText(contentToInsert, true);
    showSuccess(`Bloco '${bloco.titulo}' inserido no conteúdo.`);
  };
  
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, content: string, isHtml: boolean) => {
    e.dataTransfer.setData('text/plain', content);
    e.dataTransfer.setData('application/json', JSON.stringify({ isHtml }));
  };
  
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDraggingOver(true);
  };
  
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDraggingOver(false);
      const text = e.dataTransfer.getData("text/plain");
      const meta = e.dataTransfer.getData('application/json');
      const isHtml = meta ? JSON.parse(meta).isHtml : false;

      if (text) {
          handleInsertText(text, isHtml);
      }
  };
  
  // --- FIM FUNÇÕES DE INSERÇÃO DE TEXTO ---

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 h-full flex flex-col">
          <div className="flex justify-end pb-4 border-b">
              <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Save className="mr-2 h-4 w-4" />
                  Salvar Modelo
              </Button>
          </div>
            
          <div className="grid grid-cols-1 lg:grid-cols-[3fr_1fr] gap-4 flex-1 overflow-hidden">
            <div className="lg:col-span-1 space-y-4 flex flex-col h-full">
                <Card className={cn("h-full flex flex-col transition-all", isDraggingOver && "ring-2 ring-primary-foreground")}>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-xl">Conteúdo do Template</CardTitle>
                        <Button type="button" variant="outline" size="sm" onClick={handlePreview} disabled={!form.watch('conteudo_template')}>
                            <Eye className="mr-2 h-4 w-4" /> Pré-visualizar
                        </Button>
                    </CardHeader>
                    <CardContent className="p-6 pt-0 flex-1 overflow-hidden">
                        <FormField
                            control={form.control}
                            name="conteudo_template"
                            render={({ field }) => (
                                <FormItem className="h-full flex flex-col">
                                    <FormControl 
                                      className="flex-1" 
                                      onDrop={handleDrop} 
                                      onDragOver={handleDragOver}
                                      onDragLeave={handleDragLeave}
                                    >
                                        <RichTextEditor
                                            ref={quillRef}
                                            value={field.value}
                                            onChange={field.onChange}
                                            placeholder="Insira o conteúdo formatado aqui ou arraste um bloco..."
                                            isSimpleTextMode={form.watch('tipo_conteudo') === 'texto'}
                                            className="flex-1 min-h-[400px] max-h-[calc(100vh-300px)]" 
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </CardContent>
                </Card>
            </div>
            
            <div className="lg:col-span-1 space-y-4 flex flex-col">
                <Card className="flex-1 min-h-[200px] max-h-[calc(100vh-200px)] overflow-y-auto">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg flex items-center"><Tag className="w-4 h-4 mr-2" /> Tags e Blocos</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <h4 className="font-semibold flex items-center mb-2">Tags Disponíveis</h4>
                        <p className="text-sm text-muted-foreground mb-3">Clique para copiar ou arraste para o campo de conteúdo.</p>
                        
                        <Button 
                            type="button" 
                            variant="secondary" 
                            size="sm" 
                            onClick={handleCopyAllTags}
                            className="w-full mb-4"
                            disabled={allTags.length === 0}
                        >
                            <Copy className="w-4 h-4 mr-2" /> Copiar Todas as Tags ({allTags.length})
                        </Button>
                        
                        <ScrollArea className="h-40 border rounded-md p-2 mb-4">
                            <div className="space-y-2">
                                {loadingTags ? (
                                    <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
                                ) : (
                                    allTags.map((tag) => (
                                        <div 
                                            key={tag.nome_tag} 
                                            className="p-2 border rounded-md cursor-pointer hover:bg-accent/50 transition-colors"
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, tag.nome_tag, false)} 
                                            onClick={() => {
                                                navigator.clipboard.writeText(tag.nome_tag);
                                                showSuccess(`Tag ${tag.nome_tag} copiada!`);
                                            }}
                                        >
                                            <p className="font-mono text-xs font-semibold text-primary">{tag.nome_tag}</p>
                                            <p className="text-xs text-muted-foreground">{tag.descricao}</p>
                                        </div>
                                    ))
                                )}
                            </div>
                        </ScrollArea>
                        
                        <Separator className="my-4" />
                        
                        <h4 className="font-semibold flex items-center"><PlusCircle className="w-4 h-4 mr-2" /> Blocos de Conteúdo</h4>
                        <p className="text-sm text-muted-foreground mb-3">Clique para inserir o bloco.</p>
                        <ScrollArea className="h-40 p-2 border rounded-md">
                            <div className="grid grid-cols-1 gap-2">
                                {blocos.length === 0 ? (
                                    <p className="text-muted-foreground text-sm">Nenhum bloco disponível.</p>
                                ) : (
                                    blocos.map(bloco => (
                                        <Button 
                                            key={bloco.id} 
                                            variant="outline" 
                                            size="sm" 
                                            onClick={() => handleInsertBloco(bloco)}
                                            className="justify-start truncate cursor-grab"
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, `<br><p>${bloco.conteudo.replace(/\n/g, '<br>')}</p><br>`, true)}
                                        >
                                            {bloco.titulo}
                                        </Button>
                                    ))
                                )}
                            </div>
                        </ScrollArea>
                    </CardContent>
                </Card>
            </div>
          </div>
          
          <Card>
              <CardHeader><CardTitle className="text-xl">Configuração do Documento</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                  <FormField
                      control={form.control}
                      name="titulo"
                      render={({ field }) => (
                          <FormItem>
                              <FormLabel>Título do Modelo</FormLabel>
                              <FormControl><Input placeholder="Ex: Ata de Reunião" {...field} /></FormControl>
                              <FormMessage />
                          </FormItem>
                      )}
                  />
                  <FormField
                      control={form.control}
                      name="tipo_documento"
                      render={({ field }) => (
                          <FormItem>
                              <FormLabel>Tipo de Documento (Ex: Ata, Contrato Social)</FormLabel>
                              <FormControl><Input placeholder="Ex: Ata de Reunião" {...field} /></FormControl>
                              <FormMessage />
                          </FormItem>
                      )}
                  />
                  <FormField
                      control={form.control}
                      name="tipo_conteudo"
                      render={({ field }) => (
                          <FormItem>
                              <FormLabel>Formato do Conteúdo</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                      <SelectTrigger><SelectValue placeholder="Selecione o formato" /></SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                      <SelectItem value="html">HTML (Editor Visual)</SelectItem>
                                      <SelectItem value="texto">Texto Simples</SelectItem>
                                  </SelectContent>
                              </Select>
                              <FormMessage />
                          </FormItem>
                      )}
                  />
              </CardContent>
          </Card>

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
        isHtml={form.watch('tipo_conteudo') === 'html'}
      />
    </>
  );
};

export default FormDocumentoSocietarioModelo;