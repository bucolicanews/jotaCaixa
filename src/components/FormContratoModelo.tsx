import React, { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Copy, Eye, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { ContratoModelo, ContratoTag } from '@/types/contratos';
import { TAGS_FINANCEIRAS_OBRIGATORIAS } from '@/config/contrato-tags-padrao';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import ModeloPreviewDialog from './ModeloPreviewDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';

const formSchema = z.object({
  titulo: z.string().min(1, 'O título é obrigatório.'),
  conteudo_template: z.string().min(50, 'O conteúdo do template deve ser detalhado (mínimo 50 caracteres).'),
  tipo_conteudo: z.enum(['html', 'texto'], { required_error: 'Selecione o tipo de conteúdo.' }),
});

type FormValues = z.infer<typeof formSchema>;

interface FormContratoModeloProps {
  modeloInicial?: ContratoModelo | null;
  empresaId: string | null; // ID da empresa (null se for Admin)
  onSaveComplete: () => void;
}

const FormContratoModelo: React.FC<FormContratoModeloProps> = ({ modeloInicial, empresaId, onSaveComplete }) => {
  const isEditing = !!modeloInicial;
  const [previewOpen, setPreviewOpen] = useState(false);
  const [tagsAtivas, setTagsAtivas] = useState<ContratoTag[]>(TAGS_FINANCEIRAS_OBRIGATORIAS);
  const [carregandoTags, setCarregandoTags] = useState(true);
  const { role, perfil, usuario } = useSessao();
  
  const isCliente = role === 'Cliente';
  const isAdmin = role === 'Admin';
  
  // Determina o ID a ser usado na coluna empresa_id
  const getOwnerId = () => {
    if (isAdmin) return usuario?.id || null; // Admin usa seu próprio ID
    if (isCliente) return (perfil as ClienteProfile)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id;
    return null;
  };
  
  const ownerId = getOwnerId(); // ID que será usado para filtrar tags e salvar o modelo

  const buscarTagsAtivas = useCallback(async () => {
    setCarregandoTags(true);
    
    let query = supabase
      .from('contrato_tags')
      .select('*')
      .order('nome_tag', { ascending: true });
      
    if (ownerId) {
        // Cliente/Admin vê suas próprias tags
        query = query.eq('empresa_id', ownerId);
    } else {
        // Se não houver ownerId (ex: Usuário não vinculado), mostra apenas padrão
        setTagsAtivas(TAGS_FINANCEIRAS_OBRIGATORIAS);
        setCarregandoTags(false);
        return;
    }

    const { data, error } = await query;

    if (error) {
      showError('Erro ao carregar tags customizadas: ' + error.message);
      setTagsAtivas(TAGS_FINANCEIRAS_OBRIGATORIAS);
    } else {
      // Combina tags financeiras obrigatórias com as tags customizadas ativas
      const customTags = data as ContratoTag[];
      const combinedTags = [...TAGS_FINANCEIRAS_OBRIGATORIAS, ...customTags];
      setTagsAtivas(combinedTags);
    }
    setCarregandoTags(false);
  }, [ownerId]);
  
  useEffect(() => {
      buscarTagsAtivas();
  }, [buscarTagsAtivas]);


  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      titulo: modeloInicial?.titulo || '',
      conteudo_template: modeloInicial?.conteudo_template || '',
      tipo_conteudo: 'html', 
    },
  });
  
  const templateContent = form.watch('conteudo_template');
  const tituloModelo = form.watch('titulo');
  const tipoConteudo = form.watch('tipo_conteudo');

  const onSubmit = async (values: FormValues) => {
    if (!ownerId) {
        showError('ID do proprietário não encontrado. Não é possível salvar.');
        return;
    }
    
    const dataToSave = {
      titulo: values.titulo,
      conteudo_template: values.conteudo_template,
      empresa_id: ownerId, // Usando o ID do Admin/Cliente
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
  
  const handleCopyTag = (tag: string) => {
      navigator.clipboard.writeText(tag);
      showSuccess(`Tag ${tag} copiada para a área de transferência!`);
  };
  
  const handlePreview = () => {
      if (templateContent.length < 50) {
          showError('O template deve ter pelo menos 50 caracteres para pré-visualização.');
          return;
      }
      setPreviewOpen(true);
  };
  
  const handleCopyAllTags = () => {
      const allTags = tagsAtivas.map(t => t.nome_tag).join(' ');
      navigator.clipboard.writeText(allTags);
      showSuccess('Todas as tags ativas copiadas!');
  };
  
  const handleClearTemplate = () => {
      if (window.confirm('Tem certeza que deseja limpar todo o conteúdo do template?')) {
          form.setValue('conteudo_template', '');
          showSuccess('Template limpo.');
      }
  };

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 space-y-4">
                  <FormField
                      control={form.control}
                      name="tipo_conteudo"
                      render={({ field }) => (
                          <FormItem>
                              <FormLabel>Tipo de Conteúdo</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                      <SelectTrigger>
                                          <SelectValue placeholder="Selecione o tipo" />
                                      </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                      <SelectItem value="html">HTML (Permite formatação avançada)</SelectItem>
                                      <SelectItem value="texto">Texto Simples (Preserva quebras de linha)</SelectItem>
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
                              <FormLabel>Conteúdo do Template (Use tags)</FormLabel>
                              <FormControl>
                                  <Textarea 
                                      placeholder="[CONTRATO] Pelo presente instrumento, o CONTRATANTE {{CLIENTE_NOME}}..." 
                                      rows={15} 
                                      {...field} 
                                  />
                              </FormControl>
                              <FormMessage />
                          </FormItem>
                      )}
                  />
              </div>
              
              {/* Coluna de Tags Padrão */}
              <Card className="lg:col-span-1 max-h-[600px] overflow-y-auto">
                  <CardHeader className="p-3 border-b">
                      <CardTitle className="text-sm">Tags Ativas (Cópia Rápida)</CardTitle>
                      <div className="flex space-x-2 mt-2">
                          <Button type="button" variant="outline" size="sm" onClick={handleCopyAllTags} disabled={tagsAtivas.length === 0}>
                              <Copy className="w-3 h-3 mr-1" /> Copiar Todas
                          </Button>
                          <Button type="button" variant="destructive" size="sm" onClick={handleClearTemplate}>
                              <X className="w-3 h-3 mr-1" /> Limpar Template
                          </Button>
                      </div>
                  </CardHeader>
                  <CardContent className="p-3 space-y-2">
                      {carregandoTags ? (
                          <div className="flex justify-center items-center h-20"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
                      ) : (
                          tagsAtivas.map(tag => (
                              <div key={tag.id} className="flex flex-col space-y-1 border-b pb-2 last:border-b-0">
                                  <div className="flex justify-between items-center">
                                      <span className="font-mono text-xs font-semibold text-primary">{tag.nome_tag}</span>
                                      <Button 
                                          type="button" 
                                          variant="ghost" 
                                          size="icon" 
                                          className="h-6 w-6"
                                          onClick={() => handleCopyTag(tag.nome_tag)}
                                      >
                                          <Copy className="w-3 h-3" />
                                      </Button>
                                  </div>
                                  <p className="text-xs text-muted-foreground">{tag.descricao}</p>
                              </div>
                          ))
                      )}
                  </CardContent>
              </Card>
          </div>
          
          <div className="flex space-x-4">
            <Button 
                type="button" 
                variant="outline" 
                onClick={handlePreview} 
                disabled={form.formState.isSubmitting || templateContent.length < 50}
                className="flex-1"
            >
                <Eye className="mr-2 h-4 w-4" />
                Pré-visualizar Template
            </Button>
            <Button type="submit" className="flex-1" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? 'Salvar Alterações' : 'Criar Modelo'}
            </Button>
          </div>
        </form>
      </Form>
      
      <ModeloPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        conteudoTemplate={templateContent}
        titulo={tituloModelo}
        isHtml={tipoConteudo === 'html'}
      />
    </>
  );
};

export default FormContratoModelo;