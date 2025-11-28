import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, Eye, Tag, PlusCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { DocumentoSocietarioModelo, BlocoSocietario } from '@/types/documentos-societarios';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { Separator } from '@/components/ui/separator';
import DocumentoPreviewDialog from '../documentos-societarios/DocumentoPreviewDialog';
import { TAGS_PADRAO } from '@/config/contrato-tags-padrao';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { sanitizeConteudo } from '@/utils/formatters';
import RichTextEditor from '@/components/RichTextEditor'; // NOVO IMPORT

// Extensão local para DocumentoSocietarioModelo
interface ExtendedDocumentoSocietarioModelo extends DocumentoSocietarioModelo {
    tipo_conteudo?: 'html' | 'texto';
}

const formSchema = z.object({
  titulo: z.string().min(1, 'O título é obrigatório.'),
  conteudo_template: z.string().min(10, 'O conteúdo do template é muito curto.'),
  tipo_documento: z.string().optional(),
  // Removido tipo_conteudo do schema
});

type FormValues = z.infer<typeof formSchema>;

interface FormDocumentoSocietarioModeloProps {
  modeloInicial?: ExtendedDocumentoSocietarioModelo | null;
  onSaveComplete: () => void;
}

const FormDocumentoSocietarioModelo: React.FC<FormDocumentoSocietarioModeloProps> = ({ modeloInicial, onSaveComplete }) => {
  const isEditing = !!modeloInicial;
  const { role, perfil, usuario } = useSessao();
  const [tagsCustomizadas, setTagsCustomizadas] = useState<any[]>([]);
  const [blocos, setBlocos] = useState<BlocoSocietario[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [conteudoPreview, setConteudoPreview] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');
  
  const getOwnerId = () => {
    if (role === 'Admin') return usuario?.id || null;
    if (role === 'Cliente') return (perfil as ClienteProfile)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id;
    return null;
  };
  
  const ownerId = getOwnerId();

  const fetchTagsAndBlocos = useCallback(async () => {
    if (!ownerId) return;
    
    // 1. Buscar Tags Customizadas
    const { data: tagsData } = await supabase
        .from('contrato_tags')
        .select('*')
        .eq('empresa_id', ownerId)
        .order('nome_tag', { ascending: true });
        
    if (tagsData) {
        // Filtra tags financeiras (não são usadas em documentos societários)
        const tagsNaoFinanceiras = TAGS_PADRAO.filter(t => !t.origem_dado?.startsWith('contas_receber'));
        
        // Combina tags padrão e customizadas
        const customTagsMap = tagsData.reduce((acc, tag) => {
            acc[tag.nome_tag] = tag;
            return acc;
        }, {} as Record<string, any>);
        
        const allTags = [...tagsNaoFinanceiras, ...tagsData]
            .filter((t, index, self) => index === self.findIndex((t2) => t2.nome_tag === t.nome_tag))
            .sort((a, b) => a.nome_tag.localeCompare(b.nome_tag));
            
        setTagsCustomizadas(allTags);
    }
    
    // 2. Buscar Blocos de Conteúdo
    const { data: blocosData, error: blocosError } = await supabase
        .from('blocos_societarios')
        .select('*')
        .or(`proprietario_id.eq.${ownerId},proprietario_id.is.null`)
        .order('titulo');
        
    if (blocosError) {
        console.error('Erro ao carregar blocos:', blocosError);
    } else {
        setBlocos(blocosData as BlocoSocietario[]);
    }
  }, [ownerId]);
  
  useEffect(() => {
      fetchTagsAndBlocos();
  }, [fetchTagsAndBlocos]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      titulo: modeloInicial?.titulo || '',
      conteudo_template: modeloInicial?.conteudo_template || '', 
      tipo_documento: modeloInicial?.tipo_documento || '',
    },
  });
  
  // O tipo de conteúdo é sempre 'html' (Editor de Texto)
  const tipoConteudo: 'html' = 'html'; 

  const onSubmit = async (values: FormValues) => {
    if (!ownerId) {
        showError('ID do proprietário não encontrado. Não é possível salvar.');
        return;
    }
    
    const dataToSave = {
      proprietario_id: ownerId,
      titulo: values.titulo,
      // Sempre sanitiza, pois o editor é HTML
      conteudo_template: sanitizeConteudo(values.conteudo_template),
      tipo_conteudo: 'html', // Força o tipo para 'html'
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
      const template = form.getValues('conteudo_template');
      
      // Substituição básica para a prévia (apenas tags padrão)
      let previewContent = template;
      tagsCustomizadas.forEach(tag => {
          const regex = new RegExp(tag.nome_tag, 'g');
          previewContent = previewContent.replace(regex, `[${tag.descricao}]`);
      });
      
      setConteudoPreview(previewContent);
      setPreviewTitle(form.getValues('titulo'));
      setPreviewOpen(true);
  };
  
  // --- FUNÇÕES DE INSERÇÃO DE TEXTO (Tags e Blocos) ---
  
  const handleInsertText = useCallback((insertText: string) => {
      const current = form.getValues("conteudo_template") || "";

      // Posição do cursor do textarea
      const textarea = document.querySelector(".ql-editor") as HTMLDivElement;
      if (!textarea) return;

      // Simula a inserção de HTML no cursor
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          range.deleteContents();
          const el = document.createElement('span');
          el.innerHTML = insertText;
          range.insertNode(el);
          range.collapse(false);
          showSuccess(`Tag inserida no editor.`);
      } else {
          // Fallback para anexar no final
          form.setValue("conteudo_template", current + insertText, { shouldDirty: true, shouldValidate: true });
      }
  }, [form]);
  
  const handleInsertBloco = (bloco: BlocoSocietario) => {
      handleInsertText(`\n\n${bloco.conteudo}\n\n`);
      showSuccess(`Bloco '${bloco.titulo}' inserido no conteúdo.`);
  };
  
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, tag: string) => {
      e.dataTransfer.setData("text/plain", tag);
  };
  
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault(); // Permite que o drop ocorra
  };
  
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const text = e.dataTransfer.getData("text/plain");

      if (text) {
          handleInsertText(text);
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
            
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 flex-1 overflow-hidden">
            
            <div className="lg:col-span-3 space-y-4 flex flex-col h-full">
                <Card className="h-full flex flex-col">
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
                                    <FormControl className="flex-1">
                                        <RichTextEditor
                                            value={field.value}
                                            onChange={field.onChange}
                                            placeholder="Insira o conteúdo formatado aqui..."
                                            className="flex-1"
                                            // isSimpleTextMode removido
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
                <Card>
                    <CardHeader><CardTitle className="text-xl">Configuração</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <FormField
                            control={form.control}
                            name="titulo"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Título do Modelo</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Ex: Ata de Reunião" {...field} />
                                    </FormControl>
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
                        {/* CAMPO TIPO DE CONTEÚDO REMOVIDO */}
                        <div className="space-y-2">
                            <Label>Tipo de Conteúdo</Label>
                            <Input readOnly value="Editor de Texto (HTML)" className="font-semibold" />
                        </div>
                    </CardContent>
                </Card>
                
                <Card 
                    className="flex-1 min-h-[200px] max-h-[calc(100vh-200px)] overflow-y-auto"
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                >
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg flex items-center"><Tag className="w-4 h-4 mr-2" /> Tags e Blocos</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground mb-3">Arraste as tags/blocos para o editor.</p>
                        
                        <h4 className="font-semibold flex items-center mb-2">Tags</h4>
                        <div className="space-y-2 border rounded-md p-2 max-h-40 overflow-y-auto mb-4">
                            {tagsCustomizadas.map((tag: any) => (
                                <div 
                                    key={tag.nome_tag} 
                                    className="p-2 border rounded-md cursor-pointer hover:bg-accent/50 transition-colors"
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, tag.nome_tag)}
                                    onClick={() => handleInsertText(tag.nome_tag)}
                                >
                                    <p className="font-mono text-xs font-semibold text-primary">{tag.nome_tag}</p>
                                    <p className="text-xs text-muted-foreground">{tag.descricao}</p>
                                </div>
                            ))}
                        </div>
                        
                        <Separator className="my-4" />
                        
                        <h4 className="font-semibold flex items-center"><PlusCircle className="w-4 h-4 mr-2" /> Blocos</h4>
                        <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto p-2 border rounded-md">
                            {blocos.length === 0 ? (
                                <p className="text-muted-foreground text-sm">Nenhum bloco disponível.</p>
                            ) : (
                                blocos.map(bloco => (
                                    <Button 
                                        key={bloco.id} 
                                        variant="outline" 
                                        size="sm" 
                                        onClick={() => handleInsertBloco(bloco)}
                                        className="justify-start truncate"
                                        draggable
                                        onDragStart={(e) => e.dataTransfer.setData("text/plain", `\n\n${bloco.conteudo}\n\n`)}
                                    >
                                        {bloco.titulo}
                                    </Button>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
          </div>
        </form>
      </Form>
      
      <DocumentoPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        conteudoHtml={conteudoPreview}
        titulo={form.getValues('titulo')}
        isHtml={true} // Sempre HTML
      />
    </>
  );
};

export default FormDocumentoSocietarioModelo;