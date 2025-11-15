import React, { useState, useCallback } from 'react';
import { useForm, Control } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { Cliente } from '@/types/cliente';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import FormDadosCadastrais from '../usuario-forms/FormDadosCadastrais';
import { useBulkTagManager } from '@/hooks/use-bulk-tag-manager';

const textOptional = z.string().optional().or(z.literal(''));

const formSchema = z.object({
  nome: z.string().min(1, 'O nome é obrigatório.'),
  razao_social: textOptional,
  nome_fantasia: textOptional,
  documento: textOptional,
  email: z.string().email('Email inválido.').optional().or(z.literal('')),
  telefone: textOptional,
  telefone_fixo: textOptional,
  
  // Dados Cadastrais (para tags)
  cep: textOptional,
  endereco: textOptional,
  numero: textOptional,
  complemento: textOptional,
  bairro: textOptional,
  cidade: textOptional,
  estado: textOptional,
});

type FormValues = z.infer<typeof formSchema>;

interface FormClienteProps {
  clienteInicial?: Cliente | null;
  onSaveComplete: () => void;
}

const FormCliente: React.FC<FormClienteProps> = ({ clienteInicial, onSaveComplete }) => {
  const isEditing = !!clienteInicial;
  const { perfil, role, usuario } = useSessao();
  const [activeTab, setActiveTab] = useState('geral');
  
  const resourceId = clienteInicial?.id;
  const { refetchStatus, refreshKey } = useBulkTagManager(resourceId);

  const getProprietarioId = (): string | null => {
    if (role === 'Admin') return usuario?.id || null;
    if (role === 'Cliente') return (perfil as ClienteProfile)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id; // FIX: proprietario_id -> cliente_id
    return null;
  };
  
  const proprietarioId = getProprietarioId();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome: clienteInicial?.nome || '',
      razao_social: clienteInicial?.razao_social || '',
      nome_fantasia: clienteInicial?.nome_fantasia || '',
      documento: clienteInicial?.documento || '',
      email: clienteInicial?.email || '',
      telefone: clienteInicial?.telefone || '',
      telefone_fixo: clienteInicial?.telefone_fixo || '',
      
      // Dados Cadastrais
      cep: clienteInicial?.cep || '',
      endereco: clienteInicial?.endereco || '',
      numero: clienteInicial?.numero || '',
      complemento: clienteInicial?.complemento || '',
      bairro: clienteInicial?.bairro || '',
      cidade: clienteInicial?.cidade || '',
      estado: clienteInicial?.estado || '',
    },
  });
  
  const handleTagToggle = useCallback(() => {
      refetchStatus();
  }, [refetchStatus]);

  const onSubmit = async (values: FormValues) => {
    if (!proprietarioId) {
      showError('ID do proprietário não encontrado. Não é possível salvar.');
      return;
    }
    
    const dataToSave = {
      proprietario_id: proprietarioId,
      nome: values.nome,
      razao_social: values.razao_social || null,
      nome_fantasia: values.nome_fantasia || null,
      documento: values.documento || null,
      email: values.email || null,
      telefone: values.telefone || null,
      telefone_fixo: values.telefone_fixo || null,
      
      // Dados Cadastrais
      cep: values.cep || null,
      endereco: values.endereco || null,
      numero: values.numero || null,
      complemento: values.complemento || null,
      bairro: values.bairro || null,
      cidade: values.cidade || null,
      estado: values.estado || null,
    };

    let error = null;

    if (isEditing) {
      // Atualizar
      const result = await supabase
        .from('clientes')
        .update(dataToSave)
        .eq('id', clienteInicial.id);
      error = result.error;
    } else {
      // Inserir
      const result = await supabase
        .from('clientes')
        .insert(dataToSave);
      error = result.error;
    }

    if (error) {
      showError(`Falha ao salvar cliente: ${error.message}`);
    } else {
      showSuccess(`Cliente salvo com sucesso!`);
      onSaveComplete();
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="geral">Geral</TabsTrigger>
                <TabsTrigger value="cadastrais">Dados Cadastrais (Tags)</TabsTrigger>
            </TabsList>
            
            <TabsContent value="geral" className="mt-4 space-y-4 p-4">
                <FormField
                    control={form.control}
                    name="nome"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Nome/Apelido</FormLabel>
                            <FormControl>
                                <Input placeholder="Ex: João da Silva" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="razao_social"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Razão Social (Opcional)</FormLabel>
                            <FormControl>
                                <Input placeholder="Ex: João da Silva LTDA" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="nome_fantasia"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Nome Fantasia (Opcional)</FormLabel>
                            <FormControl>
                                <Input placeholder="Ex: JS Serviços" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="documento"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>CPF/CNPJ (Opcional)</FormLabel>
                            <FormControl>
                                <Input placeholder="000.000.000-00 ou 00.000.000/0000-00" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Email (Opcional)</FormLabel>
                            <FormControl>
                                <Input type="email" placeholder="email@exemplo.com" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="telefone"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Telefone (Celular)</FormLabel>
                                <FormControl>
                                    <Input placeholder="(00) 90000-0000" {...field} />
                            </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="telefone_fixo"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Telefone (Fixo - Opcional)</FormLabel>
                                <FormControl>
                                    <Input placeholder="(00) 0000-0000" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
            </TabsContent>
            
            <TabsContent value="cadastrais" className="mt-4 space-y-6 p-4">
                <FormDadosCadastrais
                    control={form.control as unknown as Control<any>}
                    isSubmitting={form.formState.isSubmitting}
                    resourceId={resourceId}
                    tagRefreshKey={refreshKey}
                    onTagToggle={handleTagToggle}
                    isReadOnly={false} // Cliente CR é sempre editável pelo gestor
                />
            </TabsContent>
        </Tabs>

        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar Cliente
        </Button>
      </form>
    </Form>
  );
};

export default FormCliente;