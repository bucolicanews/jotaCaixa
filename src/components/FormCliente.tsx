import React, { useCallback } from 'react';
import { useForm } from 'react-hook-form';
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
import { UsuarioProfile } from '@/types/usuario';
import { Separator } from './ui/separator';

const textOptional = z.string().optional().or(z.literal(''));

const formSchema = z.object({
  nome: z.string().min(1, 'O nome fantasia/pessoal é obrigatório.'),
  razao_social: textOptional,
  nome_fantasia: textOptional,
  documento: textOptional,
  email: z.string().email('Email inválido.').optional().or(z.literal('')),
  telefone: textOptional, // Celular/Principal
  telefone_fixo: textOptional,
  
  // Endereço
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
  const { perfil, role } = useSessao();

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
      
      // Endereço
      cep: clienteInicial?.cep || '',
      endereco: clienteInicial?.endereco || '',
      numero: clienteInicial?.numero || '',
      complemento: clienteInicial?.complemento || '',
      bairro: clienteInicial?.bairro || '',
      cidade: clienteInicial?.cidade || '',
      estado: clienteInicial?.estado || '',
    },
  });
  
  const cepValue = form.watch('cep');

  const getOwnerId = () => {
    if (role === 'Admin' || role === 'Cliente') return (perfil as any)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id;
    return null;
  };
  
  const fetchAddressByCep = useCallback(async (cep: string) => {
    // Remove caracteres não numéricos
    const cleanCep = cep.replace(/\D/g, '');

    if (cleanCep.length !== 8) {
      return;
    }
    
    // Bloqueia a edição dos campos enquanto busca
    form.setValue('endereco', 'Buscando...');
    form.setValue('bairro', 'Buscando...');
    form.setValue('cidade', 'Buscando...');
    form.setValue('estado', 'Buscando...');
    
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await response.json();

      if (data.erro) {
        showError('CEP não encontrado.');
        form.setValue('endereco', '');
        form.setValue('bairro', '');
        form.setValue('cidade', '');
        form.setValue('estado', '');
        return;
      }

      // Preenche os campos
      form.setValue('endereco', data.logradouro || '');
      form.setValue('bairro', data.bairro || '');
      form.setValue('cidade', data.localidade || '');
      form.setValue('estado', data.uf || '');
      
      // Foca no campo número, que é o próximo a ser preenchido
      document.getElementById('numero')?.focus();

    } catch (error) {
      console.error('Erro ao consultar ViaCEP:', error);
      showError('Falha ao consultar o CEP.');
      form.setValue('endereco', '');
      form.setValue('bairro', '');
      form.setValue('cidade', '');
      form.setValue('estado', '');
    }
  }, [form]);
  
  // Monitora a mudança do CEP para buscar o endereço
  React.useEffect(() => {
    const cleanCep = cepValue?.replace(/\D/g, '');
    if (cleanCep && cleanCep.length === 8) {
      fetchAddressByCep(cleanCep);
    }
  }, [cepValue, fetchAddressByCep]);

  const onSubmit = async (values: FormValues) => {
    const ownerId = getOwnerId();
    if (!ownerId) {
      showError('Não foi possível identificar o proprietário (empresa/admin). Não é possível salvar.');
      return;
    }

    const dataToSave = {
      nome: values.nome,
      razao_social: values.razao_social || null,
      nome_fantasia: values.nome_fantasia || null,
      documento: values.documento || null,
      email: values.email || null,
      telefone: values.telefone || null,
      telefone_fixo: values.telefone_fixo || null,
      
      // Endereço
      cep: values.cep || null,
      endereco: values.endereco || null,
      numero: values.numero || null,
      complemento: values.complemento || null,
      bairro: values.bairro || null,
      cidade: values.cidade || null,
      estado: values.estado || null,
      
      empresa_id: ownerId,
    };

    let error = null;

    if (clienteInicial) {
      const result = await supabase.from('clientes').update(dataToSave).eq('id', clienteInicial.id);
      error = result.error;
    } else {
      const result = await supabase.from('clientes').insert(dataToSave);
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
        <h3 className="font-semibold text-lg">Dados de Identificação</h3>
        <FormField control={form.control} name="nome" render={({ field }) => (
          <FormItem><FormLabel>Nome Fantasia / Nome Pessoal</FormLabel><FormControl><Input placeholder="Nome Fantasia ou Nome Completo" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="razao_social" render={({ field }) => (
          <FormItem><FormLabel>Razão Social (Opcional)</FormLabel><FormControl><Input placeholder="Razão Social da Empresa" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="documento" render={({ field }) => (
          <FormItem><FormLabel>Documento (CPF/CNPJ)</FormLabel><FormControl><Input placeholder="00.000.000/0000-00" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        
        <Separator />
        
        <h3 className="font-semibold text-lg">Contato</h3>
        <FormField control={form.control} name="email" render={({ field }) => (
          <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="contato@cliente.com" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField control={form.control} name="telefone" render={({ field }) => (
                <FormItem><FormLabel>Telefone (Celular/Principal)</FormLabel><FormControl><Input placeholder="(00) 90000-0000" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="telefone_fixo" render={({ field }) => (
                <FormItem><FormLabel>Telefone Fixo (Opcional)</FormLabel><FormControl><Input placeholder="(00) 3000-0000" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
        </div>
        
        <Separator />
        
        <h3 className="font-semibold text-lg">Endereço</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField control={form.control} name="cep" render={({ field }) => (
                <FormItem><FormLabel>CEP</FormLabel><FormControl><Input placeholder="00000-000" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="cidade" render={({ field }) => (
                <FormItem><FormLabel>Cidade</FormLabel><FormControl><Input placeholder="São Paulo" {...field} disabled={field.value === 'Buscando...'} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="estado" render={({ field }) => (
                <FormItem><FormLabel>Estado (UF)</FormLabel><FormControl><Input placeholder="SP" {...field} disabled={field.value === 'Buscando...'} /></FormControl><FormMessage /></FormItem>
            )} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField control={form.control} name="endereco" render={({ field }) => (
                <FormItem><FormLabel>Logradouro/Rua</FormLabel><FormControl><Input placeholder="Rua Exemplo" {...field} disabled={field.value === 'Buscando...'} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="numero" render={({ field }) => (
                <FormItem><FormLabel>Número</FormLabel><FormControl><Input id="numero" placeholder="123" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="complemento" render={({ field }) => (
                <FormItem><FormLabel>Complemento</FormLabel><FormControl><Input placeholder="Apto 101" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
        </div>
        <FormField control={form.control} name="bairro" render={({ field }) => (
            <FormItem><FormLabel>Bairro</FormLabel><FormControl><Input placeholder="Centro" {...field} disabled={field.value === 'Buscando...'} /></FormControl><FormMessage /></FormItem>
        )} />
        
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar Cliente
        </Button>
      </form>
    </Form>
  );
};

export default FormCliente;