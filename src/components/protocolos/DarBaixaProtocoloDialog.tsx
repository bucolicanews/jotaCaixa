import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { Protocolo } from '@/types/protocolo';

interface DarBaixaProtocoloDialogProps {
  protocolo: Protocolo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const formSchema = z.object({
  nome_resp_recebimento: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres'),
  data_entrega: z.string().min(1, 'Data de entrega é obrigatória'),
  img_protocolo: z
    .instanceof(FileList)
    .refine((files) => files?.length === 1, 'Foto do protocolo assinado é obrigatória')
    .refine(
      (files) => files?.[0]?.size <= MAX_FILE_SIZE,
      'Tamanho máximo do arquivo é 5MB'
    )
    .refine(
      (files) => ACCEPTED_IMAGE_TYPES.includes(files?.[0]?.type),
      'Apenas imagens JPEG, PNG ou WEBP são aceitas'
    ),
});

type FormValues = z.infer<typeof formSchema>;

export function DarBaixaProtocoloDialog({
  protocolo,
  open,
  onOpenChange,
  onSuccess,
}: DarBaixaProtocoloDialogProps) {
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome_resp_recebimento: '',
      data_entrega: new Date().toISOString().split('T')[0],
      img_protocolo: undefined,
    },
  });

  const onSubmit = async (values: FormValues) => {
    setIsLoading(true);
    try {
      const file = values.img_protocolo[0];
      const fileExt = file.name.split('.').pop();
      const filePath = `${protocolo.cliente_id}/${protocolo.id}/protocolo_assinado.${fileExt}`;

      // Upload da foto para o bucket
      const { error: uploadError } = await supabase.storage
        .from('protocolos_files')
        .upload(filePath, file, {
          upsert: true,
        });

      if (uploadError) {
        throw uploadError;
      }

      // Obter URL pública da foto
      const { data: urlData } = supabase.storage
        .from('protocolos_files')
        .getPublicUrl(filePath);

      // Update na tabela protocolos
      const { error: updateError } = await supabase
        .from('protocolos')
        .update({
          status: 'Entregue',
          nome_resp_recebimento: values.nome_resp_recebimento,
          data_recebimento: new Date(values.data_entrega).toISOString(),
          img_protocolo: urlData.publicUrl,
        })
        .eq('id', protocolo.id);

      if (updateError) {
        throw updateError;
      }

      showSuccess('Protocolo entregue com sucesso');
      onSuccess();
      onOpenChange(false);
      form.reset();
    } catch (error) {
      console.error('Erro ao dar baixa no protocolo:', error);
      showError('Erro ao dar baixa no protocolo');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Dar Baixa - Protocolo {protocolo.numero_protocolo}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="nome_resp_recebimento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome do Responsável pelo Recebimento</FormLabel>
                  <FormControl>
                    <Input placeholder="Digite o nome" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="data_entrega"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data de Entrega</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="img_protocolo"
              render={({ field: { value, onChange, ...fieldProps } }) => (
                <FormItem>
                  <FormLabel>Foto do Protocolo Assinado</FormLabel>
                  <FormControl>
                    <Input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => onChange(e.target.files)}
                      {...fieldProps}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isLoading}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Processando...' : 'Confirmar Entrega'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
