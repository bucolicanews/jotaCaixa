import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useSessao } from '@/hooks/use-sessao';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { showError, showSuccess } from '@/utils/toast';
import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain'];

const formSchema = z.object({
  id_cliente: z.string().uuid('Selecione um cliente.'),
  nome_resp_recebimento: z.string().min(3, 'O nome do responsável é obrigatório.'),
  img_protocolo: z
    .instanceof(FileList)
    .refine(files => files?.length === 1, 'A foto do protocolo é obrigatória.')
    .refine(files => files?.[0]?.size <= MAX_FILE_SIZE, `Tamanho máximo de 5MB.`)
    .refine(files => ALLOWED_IMAGE_TYPES.includes(files?.[0]?.type), 'Apenas formatos JPG, PNG e WEBP são permitidos.'),
  anexos: z
    .instanceof(FileList)
    .optional()
    .refine(files => !files || Array.from(files).every(file => file.size <= MAX_FILE_SIZE), `Tamanho máximo por anexo é 5MB.`)
    .refine(files => !files || Array.from(files).every(file => ALLOWED_FILE_TYPES.includes(file.type)), 'Tipos de arquivo inválidos nos anexos.'),
});

interface Cliente {
  id: string;
  nome: string;
}

interface FormProtocoloProps {
  onSaveComplete: () => void;
}

const FormProtocolo: React.FC<FormProtocoloProps> = ({ onSaveComplete }) => {
  const { usuario, session, role, perfil } = useSessao();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome_resp_recebimento: '',
    },
  });
  
  const imgProtocoloRef = form.register('img_protocolo');
  const anexosRef = form.register('anexos');

  const getOwnerId = () => {
    if (role === 'Admin') return usuario?.id || null;
    if (role === 'Cliente') return (perfil as ClienteProfile)?.id;
    if (role === 'Usuario' && perfil) {
      if ('cliente_id' in perfil && (perfil as any).cliente_id) {
        return (perfil as any).cliente_id;
      }
      if ('admin_id' in perfil && (perfil as any).admin_id) {
        return (perfil as any).admin_id;
      }
    }
    return null;
  };

  const fetchClientes = async () => {
    const ownerId = getOwnerId();
    const isUserOfAdmin = role === 'Usuario' && (perfil as UsuarioProfile)?.admin_id;
    const isAdmin = role === 'Admin' || isUserOfAdmin;

    let query;

    if (isAdmin) {
      // Admin ou usuário do Admin: busca na tbl_clientes
      query = supabase.from('tbl_clientes').select('id, nome');
    } else {
      // Cliente ou usuário do Cliente: busca na tabela 'clientes'
      if (!ownerId) return [];
      query = supabase.from('clientes').select('id, nome').eq('proprietario_id', ownerId);
    }
    
    const { data, error } = await query;
    if (error) {
      showError('Erro ao buscar clientes: ' + error.message);
      throw new Error(error.message);
    }
    return data as Cliente[];
  };

  const { data: clientes = [], isLoading: isLoadingClientes } = useQuery({
    queryKey: ['clientesParaProtocolo', role, usuario?.id],
    queryFn: fetchClientes,
    enabled: !!session,
  });

  const uploadFile = async (file: File, bucket: string, path: string) => {
    const { data, error } = await supabase.storage.from(bucket).upload(path, file);
    if (error) {
      throw new Error(`Erro no upload do arquivo ${file.name}: ${error.message}`);
    }
    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(path);
    return publicUrl;
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsSubmitting(true);
    try {
      const protocolUUID = uuidv4();
      const imgProtocoloFile = values.img_protocolo[0];
      const anexosFiles = values.anexos ? Array.from(values.anexos) : [];

      // 1. Upload da imagem do protocolo
      const imgExtension = imgProtocoloFile.name.split('.').pop();
      const imgPath = `${values.id_cliente}/${protocolUUID}/protocolo_assinado.${imgExtension}`;
      const url_img_protocolo = await uploadFile(imgProtocoloFile, 'protocolos', imgPath);

      // 2. Upload dos anexos
      const anexosUrls = await Promise.all(
        anexosFiles.map(file => {
          const anexoPath = `${values.id_cliente}/${protocolUUID}/${uuidv4()}-${file.name}`;
          return uploadFile(file, 'protocolos', anexoPath);
        })
      );
      
      // 3. Inserir no banco de dados
      const { error: insertError } = await supabase.from('protocolos').insert({
        id: protocolUUID,
        id_cliente: values.id_cliente,
        nome_resp_recebimento: values.nome_resp_recebimento,
        status: 'Impresso',
        url_img_protocolo: url_img_protocolo,
        anexos: anexosUrls.length > 0 ? anexosUrls : null, // Salva como array de URLs
      });

      if (insertError) throw insertError;

      showSuccess('Protocolo criado com sucesso!');
      onSaveComplete();

    } catch (error: any) {
      showError('Erro ao criar protocolo: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="id_cliente"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cliente</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isLoadingClientes}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o cliente..." />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {isLoadingClientes ? (
                    <div className="flex items-center justify-center p-2"><Loader2 className="h-4 w-4 animate-spin" /></div>
                  ) : (
                    clientes.map(cliente => (<SelectItem key={cliente.id} value={cliente.id}>{cliente.nome}</SelectItem>))
                  )}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="nome_resp_recebimento"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome do Responsável pelo Recebimento</FormLabel>
              <FormControl><Input placeholder="Digite o nome..." {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="img_protocolo"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Foto do Protocolo Assinado (Obrigatório)</FormLabel>
              <FormControl>
                <Input type="file" accept="image/jpeg,image/png,image/webp" {...imgProtocoloRef} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="anexos"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Outros Anexos (Opcional)</FormLabel>
              <FormControl>
                <Input type="file" multiple {...anexosRef} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end pt-4">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar Protocolo
          </Button>
        </div>
      </form>
    </Form>
  );
};

export default FormProtocolo;
