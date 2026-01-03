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
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useProtocolos } from '@/hooks/use-protocolos';
import { Loader2 } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { v4 as uuidv4 } from 'uuid';
import { useOwner } from '@/hooks/use-owner';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';

// Zod Schema for validation
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain'];

const formSchema = z.object({
  id_cliente: z.string().uuid('Selecione um cliente.'),
  numero_protocolo: z.string().optional().or(z.literal('')),
  descrição: z.string().optional().or(z.literal('')),
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

interface ProtocoloFormDialogProps {
  children: React.ReactNode;
  protocolo?: any;
  onSuccess?: () => void;
}

const FormProtocolo: FC<ProtocoloFormDialogProps> = ({ children, protocolo, onSuccess }) => {
  const [open, setOpen] = useState(false);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [isLoadingClientes, setIsLoadingClientes] = useState(true);
  const { handleCreateProtocolo } = useProtocolos();
  const { ownerId, ownerType } = useOwner();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
        id_cliente: protocolo?.id_cliente || '',
        numero_protocolo: protocolo?.numero_protocolo || '',
        descrição: protocolo?.descrição || '',
        nome_resp_recebimento: protocolo?.nome_resp_recebimento || '',
    }
  });
  
  const imgProtocoloRef = form.register('img_protocolo');
  const anexosRef = form.register('anexos');

  const fetchClientes = async () => {
    if (!ownerId) return;
    setIsLoadingClientes(true);
    
    const isAdminContext = ownerType === 'Admin' || ownerType === 'AdminUsuario';
    const tabelaClientes = isAdminContext ? 'tbl_clientes' : 'clientes';
    const ownerKey = isAdminContext ? 'admin_id' : 'proprietario_id';

    let query = supabase.from(tabelaClientes).select('id, nome');
    
    if (isAdminContext) {
        // Admin/AdminUsuario: Busca todos os clientes do sistema (tbl_clientes)
        query = query.eq('aprovado', true);
    } else {
        // Cliente/Usuario Cliente: Busca clientes CR (clientes)
        query = query.eq(ownerKey, ownerId);
    }
    
    const { data, error } = await query.order('nome', { ascending: true });
    
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
        await handleCreateProtocolo(values);
        showSuccess('Protocolo salvo com sucesso!');
        setOpen(false);
        form.reset({ nome_resp_recebimento: '', id_cliente: '', numero_protocolo: '', descrição: '' });
        if(onSuccess) onSuccess();
    } catch (error) {
        showError('Erro ao salvar protocolo');
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{protocolo ? 'Editar' : 'Novo'} Protocolo</DialogTitle>
        </DialogHeader>
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                    control={form.control}
                    name="id_cliente"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Cliente</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isLoadingClientes || isSubmitting}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder={isLoadingClientes ? "Carregando..." : "Selecione o cliente..."} />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {clientes.map((cliente) => (
                                        <SelectItem key={cliente.id} value={cliente.id}>
                                            {cliente.nome}
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
                    name="numero_protocolo"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Número do Protocolo (Opcional)</FormLabel>
                            <FormControl><Input placeholder="Ex: PROT-2024-001" {...field} disabled={isSubmitting} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                
                <FormField
                    control={form.control}
                    name="descrição"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Descrição (Opcional)</FormLabel>
                            <FormControl><Textarea placeholder="Detalhes do documento ou serviço" {...field} disabled={isSubmitting} /></FormControl>
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
                            <FormControl><Input placeholder="Digite o nome..." {...field} disabled={isSubmitting} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="img_protocolo"
                    render={() => (
                        <FormItem>
                            <FormLabel>Foto do Protocolo Assinado (Obrigatório)</FormLabel>
                            <FormControl>
                                <Input type="file" accept="image/jpeg,image/png,image/webp" {...imgProtocoloRef} disabled={isSubmitting} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="anexos"
                    render={() => (
                        <FormItem>
                            <FormLabel>Outros Anexos (Opcional)</FormLabel>
                            <FormControl>
                                <Input type="file" multiple {...anexosRef} disabled={isSubmitting} />
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
      </DialogContent>
    </Dialog>
  );
};

export default FormProtocolo;