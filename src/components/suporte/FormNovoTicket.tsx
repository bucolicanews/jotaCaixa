import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';

const formSchema = z.object({
  titulo: z.string().min(5, 'O título é obrigatório e deve ter pelo menos 5 caracteres.'),
  conteudo: z.string().min(10, 'A mensagem é obrigatória e deve ter pelo menos 10 caracteres.'),
  prioridade: z.enum(['baixa', 'media', 'alta']),
  anexo: z.any().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface FormNovoTicketProps {
  onSaveComplete: () => void;
}

const FormNovoTicket: React.FC<FormNovoTicketProps> = ({ onSaveComplete }) => {
  const { usuario, perfil, role } = useSessao();
  const [loading, setLoading] = useState(false);
  const [anexoFile, setAnexoFile] = useState<File | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      titulo: '',
      conteudo: '',
      prioridade: 'media',
    },
  });

  const getEmpresaId = () => {
    if (role === 'Admin') return usuario?.id || null;
    if (role === 'Cliente') return (perfil as ClienteProfile)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id;
    return null;
  };
  
  const empresaId = getEmpresaId();
  const remetenteId = usuario?.id;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAnexoFile(e.target.files?.[0] || null);
  };

  const uploadAnexo = async (file: File, ticketId: string): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const filePath = `tickets/${ticketId}/${Date.now()}.${fileExt}`;

    const { error } = await supabase.storage
      .from('documentos-admissao') // Reutilizando o bucket de documentos
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.error("Erro de upload:", error);
      throw new Error('Falha ao fazer upload do anexo: ' + error.message);
    }

    const { data: publicUrlData } = supabase.storage.from('documentos-admissao').getPublicUrl(filePath);
    return publicUrlData.publicUrl;
  };

  const onSubmit = async (values: FormValues) => {
    if (!remetenteId || !empresaId) {
      showError('Usuário ou empresa não identificados.');
      return;
    }
    setLoading(true);

    try {
      // 1. Criar o Ticket (Registro Sintético)
      const ticketPayload = {
        proprietario_id: remetenteId,
        empresa_id: empresaId,
        titulo: values.titulo,
        prioridade: values.prioridade,
        status: 'aberto',
      };

      const { data: newTicket, error: ticketError } = await supabase
        .from('tickets')
        .insert(ticketPayload)
        .select('id')
        .single();

      if (ticketError) throw ticketError;
      const ticketId = newTicket.id;
      
      let anexoUrl: string | null = null;
      
      // 2. Fazer upload do anexo (se existir)
      if (anexoFile) {
        anexoUrl = await uploadAnexo(anexoFile, ticketId);
      }

      // 3. Criar a primeira mensagem
      const mensagemPayload = {
        ticket_id: ticketId,
        remetente_id: remetenteId,
        conteudo: values.conteudo,
        anexo_url: anexoUrl,
      };

      const { error: mensagemError } = await supabase
        .from('mensagens_ticket')
        .insert(mensagemPayload);

      if (mensagemError) throw mensagemError;

      showSuccess('Ticket de suporte criado com sucesso!');
      form.reset();
      setAnexoFile(null);
      onSaveComplete();

    } catch (error: any) {
      showError(`Falha ao criar ticket: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="titulo"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Título do Ticket</FormLabel>
              <FormControl><Input placeholder="Resumo do problema ou dúvida" {...field} disabled={loading} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
                control={form.control}
                name="prioridade"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Prioridade</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value} disabled={loading}>
                            <FormControl>
                                <SelectTrigger><SelectValue placeholder="Selecione a prioridade" /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                <SelectItem value="baixa">Baixa</SelectItem>
                                <SelectItem value="media">Média</SelectItem>
                                <SelectItem value="alta">Alta</SelectItem>
                            </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                )}
            />
            <FormItem>
                <FormLabel>Anexo (Opcional)</FormLabel>
                <Input type="file" onChange={handleFileChange} disabled={loading} />
                {anexoFile && <p className="text-xs text-muted-foreground">Arquivo: {anexoFile.name}</p>}
            </FormItem>
        </div>

        <FormField
          control={form.control}
          name="conteudo"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Mensagem Inicial</FormLabel>
              <FormControl><Textarea rows={5} placeholder="Descreva o problema em detalhes..." {...field} disabled={loading} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          Enviar Ticket
        </Button>
      </form>
    </Form>
  );
};

export default FormNovoTicket;