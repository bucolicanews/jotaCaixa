import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Copy, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { ContratoModelo } from '@/types/contratos';
import { TAGS_PADRAO } from '@/config/contrato-tags-padrao'; // Importando tags padrão
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import ModeloPreviewDialog from './ModeloPreviewDialog'; // Importando o novo modal

const formSchema = z.object({
  titulo: z.string().min(1, 'O título é obrigatório.'),
  conteudo_template: z.string().min(50, 'O conteúdo do template deve ser detalhado (mínimo 50 caracteres).'),
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

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      titulo: modeloInicial?.titulo || '',
      conteudo_template: modeloInicial?.conteudo_template || '',
    },
  });
  
  const templateContent = form.watch('conteudo_template');
  const tituloModelo = form.watch('titulo');

  const onSubmit = async (values: FormValues) => {
    const dataToSave = {
      titulo: values.titulo,
      conteudo_template: values.conteudo_template,
      empresa_id: empresaId, // Será null para Admin, ou o ID do Cliente
    };

    let error = null;

    if (isEditing) {
      // Atualizar
      const result = await supabase
        .from('contrato_modelos')
        .update(dataToSave)
        .eq('id', modeloInicial.id);
      error = result.error;
    } else {
      // Inserir
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
              <div className="lg:col-span-2">
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
                      <CardTitle className="text-sm">Tags Padrão (Cópia Rápida)</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 space-y-2">
                      {TAGS_PADRAO.map(tag => (
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
                      ))}
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
      />
    </>
  );
};

export default FormContratoModelo;