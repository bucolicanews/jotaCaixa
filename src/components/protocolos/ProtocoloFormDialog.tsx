
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
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { useProtocolos } from '@/hooks/use-protocolos';

// Zod Schema for validation
const formSchema = z.object({
  cliente_id: z.string().min(1, 'Cliente é obrigatório'),
  numero_protocolo: z.string().optional(),
  img_protocolo: z.any().optional(),
  nome_resp_recebimento: z.string().optional(),
});

interface ProtocoloFormDialogProps {
  children: React.ReactNode;
  protocolo?: any;
  onSuccess?: () => void;
}

const ProtocoloFormDialog: FC<ProtocoloFormDialogProps> = ({ children, protocolo, onSuccess }) => {
  const [open, setOpen] = useState(false);
  const [clientes, setClientes] = useState<any[]>([]);
  const { handleCreateProtocolo } = useProtocolos();
  const { session } = useSessao();
  
  const { control, handleSubmit, register, reset, formState: { errors } } = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
        cliente_id: protocolo?.cliente_id || '',
        numero_protocolo: protocolo?.numero_protocolo || '',
    }
  });

  useEffect(() => {
    // Fetch clients
    const fetchClientes = async () => {
      const { data, error } = await supabase.from('tbl_clientes').select('id, nome');
      if (error) {
        showError('Erro ao buscar clientes');
      } else {
        setClientes(data);
      }
    };
    fetchClientes();
  }, []);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
        await handleCreateProtocolo(values);
        showSuccess('Protocolo salvo com sucesso!');
        setOpen(false);
        reset();
        if(onSuccess) onSuccess();
    } catch (error) {
        showError('Erro ao salvar protocolo');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{protocolo ? 'Editar' : 'Novo'} Protocolo</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
                <Label htmlFor="cliente_id">Cliente</Label>
                <Controller
                    name="cliente_id"
                    control={control}
                    render={({ field }) => (
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <SelectTrigger>
                                <SelectValue placeholder="Selecione um cliente" />
                            </SelectTrigger>
                            <SelectContent>
                                {clientes.map((cliente) => (
                                    <SelectItem key={cliente.id} value={cliente.id.toString()}>
                                        {cliente.nome}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                />
                {errors.cliente_id && <p className="text-red-500 text-sm">{errors.cliente_id.message}</p>}
            </div>

            <div>
                <Label htmlFor="img_protocolo">Foto do Protocolo Assinado</Label>
                <Input id="img_protocolo" type="file" {...register('img_protocolo')} />
            </div>

            <div>
                <Label htmlFor="nome_resp_recebimento">Nome do Responsável pelo Recebimento</Label>
                <Input id="nome_resp_recebimento" {...register('nome_resp_recebimento')} />
            </div>

          <Button type="submit">Salvar</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ProtocoloFormDialog;
