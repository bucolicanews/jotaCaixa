import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
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
import { sanitizeConteudo } from '@/utils/formatters';
import RichTextEditor from '@/components/RichTextEditor';

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
}

const FormContratoModelo: React.FC<FormContratoModeloProps> = ({ modeloInicial, onSaveComplete }) => {
  const isEditing = !!modeloInicial;
  const { role, perfil, usuario } = useSessao();
  const [tagsCustomizadas, setTagsCustomizadas] = useState<ContratoTag[]>([]);
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
      // tipo_conteudo removido da tabela contrato_modelos
      tipo_documento: values.tipo_documento || null,
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
      tagsCustomizadas.forEach(tag => {
          const regex = new RegExp(tag.nome_tag, 'g');
          previewContent = previewContent.replace(regex, `[${tag.descricao}]`);
      });
      
      setConteudoPreview(previewContent);
      setPreviewTitle(form.getValues('titulo'));
      setPreviewOpen(true);
  };
  
  const allTags = useMemo(() => {
      return tagsCustomizadas.sort((a, b) => a.nome_tag.localeCompare(b.nome_tag));
  }, [tagsCustomizadas]);
  
  // --- NOVO HANDLER: Copiar todas as tags ---
  const handleCopyAllTags = () => {
      const tagsString = allTags.map(t => t.nome_tag).join(', ');
      navigator.clipboard.writeText(tagsString);
      showSuccess('Todas as tags copiadas para a área de transferência!');
  };
  // --- FIM NOVO HANDLER ---
  
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
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            
            {/* NOVO: BOTÃO DE SALVAR NO TOPO */}
            <div className="flex justify-end pb-4 border-b">
                <Button type="submit" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Salvar Modelo
                </Button>
            </div>
            
          {/* NOVO LAYOUT DE DUAS COLUNAS */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 flex-1 overflow-hidden">
            
            {/* COLUNA 1: CONTEÚDO DO TEMPLATE (3/4 da largura) */}
            <div className="lg:col-span-3 space-y-4 flex flex-col h-full">
                <Card className="h-full flex flex-col">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-xl">Conteúdo do Template</CardTitle>
                        <Button type="button" variant="outline" size="sm" onClick={handlePreview} disabled={!form.watch('conteudo_template')}>
                            <Eye className="mr-2 h-4 w-4" /> Pré-visualizar
                        </Button>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-hidden">
                        <FormField
                            control={form.control}
                            name="conteudo_template"
                            render={({ field }) => (
                                <FormItem className="h-full flex flex-col">
                                    <FormControl className="flex-1" onDrop={handleDrop} onDragOver={handleDragOver}>
                                        {/* Usando RichTextEditor para ambos os modos */}
                                        <RichTextEditor
                                            value={field.value}
                                            onChange={field.onChange}
                                            placeholder="Insira o conteúdo formatado aqui..."
                                            isSimpleTextMode={tipoConteudo === 'texto'}
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
            
            {/* COLUNA 2: DADOS E TAGS (1/4 da largura) */}
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
                        <FormField
                            control={form.control}
                            name="tipo_documento"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Tipo de Documento (Ex: Ata)</FormLabel>
                                    <FormControl><Input placeholder="Ex: Ata de Reunião" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </CardContent>
                </Card>
                
                <Card className="flex-1 min-h-[200px] max-h-[calc(100vh-200px)] overflow-y-auto">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg flex items-center"><Tag className="w-4 h-4 mr-2" /> Tags e Blocos</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <h4 className="font-semibold flex items-center mb-2">Tags Disponíveis</h4>
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
                        
                        <div className="space-y-2 border rounded-md p-2 max-h-40 overflow-y-auto mb-4" onDragOver={handleDragOver} onDrop={handleDrop}>
                            {allTags.map((tag: ContratoTag) => (
                                <div 
                                    key={tag.nome_tag} 
                                    className="p-2 border rounded-md cursor-pointer hover:bg-accent/50 transition-colors"
                                    draggable 
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
                        
                        <h4 className="font-semibold flex items-center"><PlusCircle className="w-4 h-4 mr-2" /> Blocos de Conteúdo</h4>
                        <p className="text-sm text-muted-foreground mb-3">Clique para inserir o bloco.</p>
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
      
      <ContratoPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        conteudoHtml={conteudoPreview}
        titulo={form.getValues('titulo')}
      />
    </>
  );
};

export default FormContratoModelo;