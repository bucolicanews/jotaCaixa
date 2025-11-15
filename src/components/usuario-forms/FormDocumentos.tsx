import React, { useState } from 'react';
import { Control } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Loader2, Upload, CheckCircle2, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { cn } from '@/lib/utils';
import { useSessao } from '@/hooks/use-sessao';

interface FormDocumentosProps {
  control: Control<any>;
  isSubmitting: boolean;
  resourceId: string | undefined;
  isReadOnly: boolean; // FIX: NOVO PROP
}

const FormDocumentos: React.FC<FormDocumentosProps> = ({ control, isSubmitting, resourceId, isReadOnly }) => {
  const { role } = useSessao();
  const [uploading, setUploading] = useState(false);
  const isSaving = isSubmitting || uploading;
  
  const isUserScope = role === 'Usuario';
  const bucketName = isUserScope ? 'documentos-admissao' : 'documentos-empresa';
  const folderName = isUserScope ? 'documentos' : 'empresa';

  const handleFileUpload = async (file: File, fieldName: string) => {
    if (!resourceId) {
        showError('ID do recurso não encontrado para upload.');
        return;
    }
    
    setUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      // O caminho agora usa o nome do campo para garantir unicidade e o ID do recurso
      const filePath = `${resourceId}/${folderName}/${fieldName}-${Date.now()}.${fileExt}`; 
      
      const { error } = await supabase.storage
        .from(bucketName)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (error) throw error;

      const { data: publicUrlData } = supabase.storage.from(bucketName).getPublicUrl(filePath);
      
      // Atualiza o campo do formulário diretamente
      (control as any)._formValues[fieldName] = publicUrlData.publicUrl;
      (control as any)._updateFormValues({ [fieldName]: publicUrlData.publicUrl });
      (control as any)._formState.dirtyFields[fieldName] = true;
      
      showSuccess('Documento anexado com sucesso!');

    } catch (error: any) {
      console.error('Erro de upload:', error);
      showError('Falha ao anexar documento: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const renderDocumentField = (fieldName: string, label: string, required: boolean = false) => {
    const url = (control as any)._formValues[fieldName] as string | undefined;
    const isUploaded = !!url;

    return (
      <FormField
        control={control}
        name={fieldName}
        render={({ field }) => (
          <FormItem className="flex flex-col space-y-2">
            <FormLabel className={cn(required && "font-bold")}>{label} {required && <span className="text-red-500">*</span>}</FormLabel>
            <div className="flex items-center space-x-2">
              <Input 
                type="text" 
                placeholder="URL do documento (preenchido automaticamente após upload)" 
                value={(field.value as string) || ''}
                onChange={field.onChange}
                disabled={isSaving || isUploaded || isReadOnly} // Bloqueado se isReadOnly
                className="flex-1"
              />
              <Button 
                type="button" 
                variant={isUploaded ? "destructive" : "outline"} 
                size="icon" 
                onClick={() => {
                  if (isUploaded) {
                    field.onChange('');
                    showSuccess('Link do documento removido. Salve para confirmar.');
                  } else {
                    document.getElementById(`file-upload-${fieldName}`)?.click();
                  }
                }}
                disabled={isSaving || isReadOnly} // Bloqueado se isReadOnly
              >
                {isUploaded ? <XCircle className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
              </Button>
              <input
                id={`file-upload-${fieldName}`}
                type="file"
                accept="image/*, application/pdf"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    handleFileUpload(e.target.files[0], fieldName);
                  }
                }}
                disabled={isReadOnly} // Bloqueado se isReadOnly
              />
            </div>
            <div className="flex justify-between items-center">
                <FormMessage />
                {isUploaded && (
                    <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-green-600 flex items-center hover:underline">
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Visualizar Anexo
                    </a>
                )}
            </div>
          </FormItem>
        )}
      />
    );
  };
  
  // Se for escopo de Usuário (Funcionário)
  if (isUserScope) {
      return (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">Anexos de documentos do funcionário.</p>
          
          {uploading && (
              <div className="flex items-center justify-center p-4 bg-secondary rounded-md">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  <span className="font-medium">Fazendo upload...</span>
              </div>
          )}
          
          <Accordion type="multiple" className="w-full">
              <AccordionItem value="pessoais">
                  <AccordionTrigger className="font-semibold">Documentos Pessoais</AccordionTrigger>
                  <AccordionContent className="space-y-4 p-2">
                      {renderDocumentField('rg_url', 'Cópia do RG (Frente e Verso)', true)}
                      {renderDocumentField('cpf_url', 'Cópia do CPF', true)}
                      {renderDocumentField('ctps_url', 'Carteira de Trabalho (CTPS)', true)}
                      {renderDocumentField('cartao_pis_url', 'Cartão do PIS', false)}
                      {renderDocumentField('cnh_url', 'CNH (Se for motorista)', false)}
                  </AccordionContent>
              </AccordionItem>
              <AccordionItem value="militares">
                  <AccordionTrigger className="font-semibold">Obrigações Militares e Eleitorais</AccordionTrigger>
                  <AccordionContent className="space-y-4 p-2">
                      {renderDocumentField('titulo_eleitor_url', 'Título de Eleitor', false)}
                      {renderDocumentField('reservista_url', 'Certidão de Reservista (Homens +18)', false)}
                  </AccordionContent>
              </AccordionItem>
              <AccordionItem value="estado_civil">
                  <AccordionTrigger className="font-semibold">Estado Civil e Filiação</AccordionTrigger>
                  <AccordionContent className="space-y-4 p-2">
                      {renderDocumentField('certidao_nascimento_url', 'Certidão de Nascimento (Solteiro)', false)}
                      {renderDocumentField('certidao_casamento_url', 'Certidão de Casamento (Casado)', false)}
                      <FormItem>
                          <FormLabel>Certidões de Nascimento dos Filhos (Menores de 14)</FormLabel>
                          <Input type="file" multiple disabled placeholder="Em breve" />
                      </FormItem>
                  </AccordionContent>
              </AccordionItem>
              <AccordionItem value="outros">
                  <AccordionTrigger className="font-semibold">Outros Documentos</AccordionTrigger>
                  <AccordionContent className="space-y-4 p-2">
                      {renderDocumentField('comprovante_residencia_url', 'Comprovante de Residência', true)}
                      {renderDocumentField('comprovante_escolaridade_url', 'Comprovante de Escolaridade', true)}
                      {renderDocumentField('exame_admissional_url', 'Exame Médico Admissional', true)}
                      {renderDocumentField('foto_3x4_url', 'Foto 3x4', true)}
                      <FormField
                          control={control}
                          name="ja_admitido_anteriormente"
                          render={({ field }) => (
                              <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                                  <FormControl>
                                      <Checkbox
                                          checked={field.value}
                                          onCheckedChange={field.onChange}
                                          disabled={isSaving || isReadOnly} // Bloqueado se isReadOnly
                                      />
                                  </FormControl>
                                  <div className="space-y-1 leading-none">
                                      <FormLabel>
                                          Já foi admitido anteriormente?
                                      </FormLabel>
                                  </div>
                              </FormItem>
                          )}
                      />
                  </AccordionContent>
              </AccordionItem>
          </Accordion>
        </div>
      );
  }
  
  // Se for escopo de Cliente (Empresa) ou Admin
  return (
    <div className="space-y-6">
        <p className="text-sm text-muted-foreground">Anexos de documentos da empresa (CNPJ, Contrato Social, etc.).</p>
        
        {uploading && (
            <div className="flex items-center justify-center p-4 bg-secondary rounded-md">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                <span className="font-medium">Fazendo upload...</span>
            </div>
        )}
        
        <Accordion type="multiple" className="w-full" defaultValue={['documentos_empresa']}>
            <AccordionItem value="documentos_empresa">
                <AccordionTrigger className="font-semibold">Documentos da Empresa</AccordionTrigger>
                <AccordionContent className="space-y-4 p-2">
                    {renderDocumentField('documento_cnpj_url', 'Cópia do CNPJ', false)}
                    {renderDocumentField('contrato_social_url', 'Contrato Social/Estatuto', false)}
                    {renderDocumentField('alvara_funcionamento_url', 'Alvará de Funcionamento', false)}
                    {/* Adicione mais campos conforme necessário para a empresa */}
                </AccordionContent>
            </AccordionItem>
        </Accordion>
    </div>
  );
};

export default FormDocumentos;