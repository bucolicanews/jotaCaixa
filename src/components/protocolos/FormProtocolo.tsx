import { FC, useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useProtocolos } from '@/hooks/use-protocolos';
import { useSessao } from '@/hooks/use-sessao';
import { Loader2 } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { useOwner } from '@/hooks/use-owner';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Protocolo } from '@/types/protocolo';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

const formSchema = z.object({
  id_cliente: z.string().uuid('Selecione um cliente.'),
  titulo: z.string().min(3, 'O título é obrigatório.'),
  descricao: z.string().optional(),
  link_tarefa: z.string().url('URL inválida').optional().or(z.literal('')),
  anexos: z
    .instanceof(FileList)
    .optional()
    .refine(files => !files || Array.from(files).every(file => file.size <= MAX_FILE_SIZE), `Tamanho máximo por anexo é 5MB.`)
    .refine(files => !files || Array.from(files).every(file => ALLOWED_FILE_TYPES.includes(file.type)), 'Tipos de arquivo inválidos nos anexos.'),
});

interface Cliente {
  id: string;
  nome: string;
  razao_social: string | null;
}

interface ProtocoloFormDialogProps {
  children: React.ReactNode;
  protocolo?: Protocolo;
  onSuccess?: () => void;
  onUpdate?: (protocoloId: string, data: any) => Promise<void>;
  externalOpen?: boolean;
  onExternalOpenChange?: (open: boolean) => void;
}

const FormProtocolo: FC<ProtocoloFormDialogProps> = ({ 
  children, 
  protocolo, 
  onSuccess, 
  onUpdate,
  externalOpen,
  onExternalOpenChange
}) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = onExternalOpenChange || setInternalOpen;
  
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [isLoadingClientes, setIsLoadingClientes] = useState(true);
  const { handleCreateProtocolo } = useProtocolos();
  const { ownerId, ownerType } = useOwner();
  const { usuario } = useSessao();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const isEditing = !!protocolo;
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
        id_cliente: protocolo?.cliente_id || '',
        titulo: protocolo?.titulo || '',
        descricao: protocolo?.descricao || '',
        link_tarefa: protocolo?.link_tarefa || '',
    }
  });
  
  useEffect(() => {
    if (open && protocolo) {
      form.reset({
        id_cliente: protocolo.cliente_id || '',
        titulo: protocolo.titulo || '',
        descricao: protocolo.descricao || '',
        link_tarefa: protocolo.link_tarefa || '',
      });
    }
  }, [open, protocolo, form]);
  
  const anexosRef = form.register('anexos');

  const fetchClientes = async () => {
    if (!ownerId) return;
    setIsLoadingClientes(true);
    
    const isAdminContext = ownerType === 'Admin' || ownerType === 'AdminUsuario';
    const tabelaClientes = isAdminContext ? 'tbl_clientes' : 'clientes';
    const ownerKey = isAdminContext ? 'admin_id' : 'proprietario_id';

    let query = supabase.from(tabelaClientes).select('id, nome, razao_social');
    
    if (isAdminContext) {
        query = query.eq('aprovado', true);
    } else {
        query = query.eq(ownerKey, ownerId);
    }
    
    const { data, error } = await query.order('razao_social', { ascending: true }).order('nome', { ascending: true });
    
    if (error) {
        showError('Erro ao buscar clientes: ' + error.message);
        setClientes([]);
    } else {
        setClientes(data as Cliente[]);
    }
    setIsLoadingClientes(false);
  };

  useEffect(() => {
    if (open && ownerId) {
        fetchClientes();
    }
  }, [open, ownerId]);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsSubmitting(true);
    try {
        if (isEditing && onUpdate && protocolo) {
            await onUpdate(protocolo.id, values);
        } else {
            await handleCreateProtocolo(values);
            showSuccess('Protocolo salvo com sucesso!');
        }
        setOpen(false);
        form.reset({ 
            id_cliente: '', 
            titulo: '', 
            descricao: '',
            link_tarefa: '',
        });
        if(onSuccess) onSuccess();
    } catch (error: any) {
        console.error('Erro ao salvar protocolo:', error);
        showError(`Erro ao salvar protocolo: ${error.message || error}`);
    } finally {
        setIsSubmitting(false);
    }
  };

  const dialogContent = (
    <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{isEditing ? 'Editar' : 'Novo'} Protocolo</DialogTitle>
      </DialogHeader>
      <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                  control={form.control}
                  name="id_cliente"
                  render={({ field }) => (
                      <FormItem>
                          <FormLabel>Cliente</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value} disabled={isLoadingClientes || isSubmitting}>
                              <FormControl>
                                  <SelectTrigger>
                                      <SelectValue placeholder={isLoadingClientes ? "Carregando..." : "Selecione o cliente..."} />
                                  </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                  {clientes.map((cliente) => (
                                      <SelectItem key={cliente.id} value={cliente.id}>
                                          {cliente.razao_social || cliente.nome}
                                      </SelectItem>
                                  ))}
                              </SelectContent>
                          </Select>
                          <FormMessage />
                      </FormItem>
                  )}
              />
              
              <FormField
                  control={form.control}
                  name="titulo"
                  render={({ field }) => (
                      <FormItem>
                          <FormLabel>Título do Protocolo</FormLabel>
                          <FormControl><Input placeholder="Ex: Entrega de documentos contábeis" {...field} disabled={isSubmitting} /></FormControl>
                          <FormMessage />
                      </FormItem>
                  )}
              />
              
              <FormField
                  control={form.control}
                  name="descricao"
                  render={({ field }) => (
                      <FormItem>
                          <FormLabel>Descrição (Opcional)</FormLabel>
                          <FormControl><Textarea placeholder="Detalhes sobre o protocolo..." {...field} disabled={isSubmitting} rows={3} /></FormControl>
                          <FormMessage />
                      </FormItem>
                  )}
              />

              <FormField
                  control={form.control}
                  name="link_tarefa"
                  render={({ field }) => (
                      <FormItem>
                          <FormLabel>Link da Tarefa (Opcional)</FormLabel>
                          <FormControl><Input placeholder="https://exemplo.com/tarefa/123" {...field} disabled={isSubmitting} /></FormControl>
                          <FormMessage />
                      </FormItem>
                  )}
              />
              
              <FormField
                  control={form.control}
                  name="anexos"
                  render={() => (
                      <FormItem>
                          <FormLabel>{isEditing ? 'Adicionar Anexos (Opcional)' : 'Anexos (Opcional)'}</FormLabel>
                          <FormControl>
                              <Input 
                                  type="file" 
                                  multiple 
                                  accept=".pdf,.jpg,.jpeg,.png"
                                  {...anexosRef} 
                                  disabled={isSubmitting} 
                              />
                          </FormControl>
                          <FormMessage />
                      </FormItem>
                  )}
              />

              <div className="flex justify-end pt-4">
                  <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {isEditing ? 'Atualizar Protocolo' : 'Salvar Protocolo'}
                  </Button>
              </div>
          </form>
      </Form>
    </DialogContent>
  );

  if (externalOpen !== undefined) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        {dialogContent}
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      {dialogContent}
    </Dialog>
  );
};

export default FormProtocolo;
