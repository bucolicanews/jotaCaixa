import React, { useState, useCallback, useEffect } from 'react';
import { useForm, Control, FormProvider } from 'react-hook-form';
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
import { useBulkTagManager } from '@/hooks/use-bulk-tag-manager';
import FormIdentificacao from '../cliente-forms/FormIdentificacao';
import FormContato from '../cliente-forms/FormContato';
import { fetchAddressByCep } from '@/utils/cep-lookup';
import FormEndereco from '../cliente-forms/FormEndereco';

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
  const [activeTab, setActiveTab] = useState('identificacao'); // ALTERADO: Aba inicial para 'identificacao'
  
  const resourceId = clienteInicial?.id;
  const { refetchStatus, refreshKey } = useBulkTagManager(resourceId);

  const getProprietarioId = (): string | null => {
    if (role === 'Admin') return usuario?.id || null;
    if (role === 'Cliente') return (perfil as ClienteProfile)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id;
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
  
  const { watch, setValue } = form;
  const cepValue = watch('cep');
  
  const handleCepLookup = useCallback(async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, '');

    if (cleanCep.length !== 8) {
      return;
    }
    
    setValue('endereco', 'Buscando...');
    setValue('bairro', 'Buscando...');
    setValue('cidade', 'Buscando...');
    setValue('estado', 'Buscando...');
    
    const address = await fetchAddressByCep(cleanCep);
    
    if (address) {
      setValue('endereco', address.logradouro || '');
      setValue('bairro', address.bairro || '');
      setValue('cidade', address.localidade || '');
      setValue('estado', address.uf || '');
    } else {
      // Limpa os campos se o endereço não for encontrado
      setValue('endereco', '');
      setValue('bairro', '');
      setValue('cidade', '');
      setValue('estado', '');
    }
  }, [setValue]);
  
  useEffect(() => {
    if (cepValue) {
      handleCepLookup(cepValue);
    }
  }, [cepValue, handleCepLookup]);
  
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
    <FormProvider {...form}>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="identificacao">Identificação</TabsTrigger>
                <TabsTrigger value="contato">Contato</TabsTrigger>
                <TabsTrigger value="endereco">Endereço</TabsTrigger>
            </TabsList>
            
            <TabsContent value="identificacao" className="mt-4 space-y-4 p-4">
                <FormIdentificacao
                    control={form.control as unknown as Control<any>}
                    clienteId={resourceId}
                    isSubmitting={form.formState.isSubmitting}
                    tagRefreshKey={refreshKey}
                    onTagToggle={handleTagToggle}
                />
            </TabsContent>
            
            <TabsContent value="contato" className="mt-4 space-y-4 p-4">
                <FormContato
                    control={form.control as unknown as Control<any>}
                    clienteId={resourceId}
                    isSubmitting={form.formState.isSubmitting}
                    tagRefreshKey={refreshKey}
                    onTagToggle={handleTagToggle}
                />
            </TabsContent>
            
            <TabsContent value="endereco" className="mt-4 space-y-4 p-4">
                <FormEndereco
                    control={form.control as unknown as Control<any>}
                    clienteId={resourceId}
                    isSubmitting={form.formState.isSubmitting}
                    tagRefreshKey={refreshKey}
                    onTagToggle={handleTagToggle}
                />
            </TabsContent>
          </Tabs>

          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar Cliente
          </Button>
        </form>
      </Form>
    </FormProvider>
  );
};

export default FormCliente;