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
  tipo_conteudo: z.enum(['html', 'texto']),
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
  
  // Referência para o Textarea (usado para Drag & Drop)
  const textareaRef = useRef<HTMLTextAreaElement>(null); 

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
      conteudo_template: modeloInicial?.conteudo_template ? sanitizeConteudo(modeloInicial.conteudo_template) : '', // APLICA SANITIZE
      tipo_documento: modeloInicial?.tipo_documento || '',
      tipo_conteudo: modeloInicial?.tipo_conteudo || 'html', // Default to HTML
    },
  });
  
  const tipoConteudo = form.watch('tipo_conteudo');

  const onSubmit = async (values: FormValues) => {
    if (!ownerId) {
        showError('ID do proprietário não encontrado. Não é possível salvar.');
        return;
    }
    
    const dataToSave = {
      proprietario_id: ownerId,
      titulo: values.titulo,
      // CRÍTICO: Sanitiza apenas se for HTML, senão salva o texto puro
      conteudo_template: values.tipo_conteudo === 'html' ? sanitizeConteudo(values.conteudo_template) : values.conteudo_template,
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
      const textarea = document.getElementById("conteudo-template-textarea") as HTMLTextAreaElement;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      const newValue =
          current.substring(0, start) + insertText + current.substring(end);

      // 1. Atualiza o valor no RHF (CRÍTICO)
      form.setValue("conteudo_template", newValue, { shouldDirty: true, shouldValidate: true });

      // 2. Reposiciona o cursor após a inserção
      setTimeout(() => {
          textarea.focus();
          textarea.selectionStart = textarea.selectionEnd = start + insertText.length;
      }, 0);
  }, [form]);
  
  const handleInsertBloco = (bloco: BlocoSocietario) => {
      handleInsertText(`\n\n${bloco.conteudo}\n\n`);
      showSuccess(`Bloco '${bloco.titulo}' inserido no conteúdo.`);
  };
  
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, tag: string) => {
      e.dataTransfer.setData("text/plain", tag);
  };
  
  const handleDragOver = (e: React.DragEvent<HTMLTextAreaElement>) => {
      e.preventDefault(); // Permite que o drop ocorra
  };
  
  const handleDrop = (e: React.DragEvent<HTMLTextAreaElement>) => {
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
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-4">
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
                        <SelectItem value="html">HTML</SelectItem>
                        <SelectItem value="texto">Texto Simples</SelectItem>
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
                        {/* CORREÇÃO: Usando RichTextEditor para ambos os modos */}
                        <RichTextEditor
                            value={field.value}
                            onChange={field.onChange}
                            placeholder="Insira o conteúdo formatado aqui..."
                            className="min-h-[300px]"
                            isSimpleTextMode={tipoConteudo === 'texto'}
                        />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            {/* Coluna de Tags e Blocos (Drag & Drop) */}
            <Card className="lg:col-span-1 max-h-[600px] overflow-y-auto">
                <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center"><Tag className="w-4 h-4 mr-2" /> Tags e Blocos</CardTitle>
                </CardHeader>
                <CardContent>
                    <h4 className="font-semibold flex items-center mb-2">Tags Disponíveis</h4>
                    <p className="text-sm text-muted-foreground mb-3">Arraste as tags para o campo de conteúdo.</p>
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
                    
                    <h4 className="font-semibold flex items-center"><PlusCircle className="w-4 h-4 mr-2" /> Blocos de Conteúdo</h4>
                    <p className="text-sm text-muted-foreground mb-3">Clique ou arraste para inserir o bloco.</p>
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

          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Save className="mr-2 h-4 w-4" />
            Salvar Modelo
          </Button>
        </form>
      </Form>
      
      <DocumentoPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        conteudoHtml={conteudoPreview}
        titulo={form.getValues('titulo')}
        isHtml={tipoConteudo === 'html'}
      />
    </>
  );
};

export default FormDocumentoSocietarioModelo;