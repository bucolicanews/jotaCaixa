import React, { useState } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useSessao } from '@/hooks/use-sessao';
import { UsuarioProfile } from '@/types/usuario';

// Nome do bucket de armazenamento para atestados
// CORREÇÃO: Usar o nome real do bucket, não o nome da coluna
const ATESTADO_BUCKET = 'documentos-admissao'; 

const formSchema = z.object({
  data_falta: z.date({ required_error: 'A data da falta é obrigatória.' }),
  tipo_falta: z.enum(['justificada', 'nao_justificada'], { required_error: 'O tipo de falta é obrigatório.' }),
  motivo: z.string().min(5, 'O motivo deve ter pelo menos 5 caracteres.'),
  atestado_url: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface GerenciarFaltasProps {
  usuarioId: string;
  onFaltaRegistrada: () => void;
}

const GerenciarFaltas: React.FC<GerenciarFaltasProps> = ({ usuarioId, onFaltaRegistrada }) => {
  const { perfil } = useSessao();
  const userProfile = perfil as UsuarioProfile;
  
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      data_falta: new Date(),
      tipo_falta: 'nao_justificada',
      motivo: '',
      atestado_url: '',
    },
  });
  
  const tipoFalta = form.watch('tipo_falta');

  const handleFileUpload = async (file: File): Promise<string | null> => {
    setIsUploading(true);
    
    const fileExt = file.name.split('.').pop();
    const fileName = `${usuarioId}/${format(new Date(), 'yyyyMMddHHmmss')}_atestado.${fileExt}`;
    
    try {
      const { data, error: uploadError } = await supabase.storage
        .from(ATESTADO_BUCKET) // CORRIGIDO: Usando o nome do bucket
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }
      
      // Obtém a URL pública
      const { data: publicUrlData } = supabase.storage
        .from(ATESTADO_BUCKET)
        .getPublicUrl(data.path);
        
      showSuccess('Atestado enviado com sucesso!');
      return publicUrlData.publicUrl;
      
    } catch (error: any) {
      showError('Falha ao fazer upload do atestado: ' + error.message);
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    // CORREÇÃO TS2322: Inicializa como string | null para ser compatível com o retorno de handleFileUpload
    let finalAtestadoUrl: string | null = values.atestado_url || null; 

    try {
      // 1. Upload do arquivo, se existir e for justificada
      if (tipoFalta === 'justificada' && file) {
        finalAtestadoUrl = await handleFileUpload(file);
        if (!finalAtestadoUrl) {
          // O erro já foi mostrado em handleFileUpload
          return;
        }
      }
      
      // 2. Salvar o registro da falta
      const { error } = await supabase
        .from('tbl_faltas')
        .insert({
          usuario_id: usuarioId,
          cliente_id: userProfile.cliente_id,
          data_falta: format(values.data_falta, 'yyyy-MM-dd'),
          tipo_falta: values.tipo_falta,
          motivo: values.motivo,
          atestado_url: finalAtestadoUrl, // Agora finalAtestadoUrl é string | null
          registrado_por: perfil?.nome || 'Sistema',
        });

      if (error) {
        throw new Error(error.message);
      }

      showSuccess('Falta registrada com sucesso!');
      form.reset();
      setFile(null);
      onFaltaRegistrada();
    } catch (error: any) {
      showError('Falha ao salvar registro: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormProvider {...form}>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 p-4 border rounded-lg">
          <h3 className="text-xl font-semibold">Registrar Falta/Atestado</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Data da Falta */}
            <FormField control={form.control} name="data_falta" render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Data da Falta</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant={"outline"}
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                        disabled={isSubmitting || isUploading}
                      >
                        {field.value ? format(field.value, "PPP") : <span>Selecione a data</span>}
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={field.onChange}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )} />
            
            {/* Tipo de Falta */}
            <FormField control={form.control} name="tipo_falta" render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo de Falta</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isSubmitting || isUploading}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o tipo" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="justificada">Justificada (Atestado)</SelectItem>
                    <SelectItem value="nao_justificada">Não Justificada</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
          </div>
          
          {/* Motivo */}
          <FormField control={form.control} name="motivo" render={({ field }) => (
            <FormItem>
              <FormLabel>Motivo</FormLabel>
              <FormControl>
                <Textarea placeholder="Descreva o motivo da falta..." {...field} disabled={isSubmitting || isUploading} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />
          
          {/* Upload de Atestado (Apenas se Justificada) */}
          {tipoFalta === 'justificada' && (
            <div className="space-y-2">
              <FormLabel>Anexar Atestado (PDF/Imagem)</FormLabel>
              <div className="flex items-center space-x-4">
                <Input
                  type="file"
                  accept=".pdf,image/*"
                  onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
                  className="flex-1"
                  disabled={isSubmitting || isUploading}
                />
                {file && (
                  <Button type="button" variant="outline" size="icon" onClick={() => setFile(null)} disabled={isSubmitting || isUploading}>
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
              {file && <p className="text-sm text-muted-foreground">Arquivo selecionado: {file.name}</p>}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isSubmitting || isUploading || (tipoFalta === 'justificada' && !file)}>
            {(isSubmitting || isUploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isUploading ? 'Enviando Atestado...' : 'Registrar Falta'}
          </Button>
        </form>
      </Form>
    </FormProvider>
  );
};

export default GerenciarFaltas;