import React, { useCallback } from 'react';
import { useForm, Control } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2, Tag } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { Cliente } from '@/types/cliente';
import { useSessao } from '@/hooks/use-sessao';
import { UsuarioProfile, ClienteProfile } from '@/types/usuario';
import { Separator } from './ui/separator';
import { Checkbox } from './ui/checkbox';
import { CAMPOS_CLIENTE_MAPA } from '@/config/contrato-campos-mapeaveis';
import { useTagManager } from '@/hooks/use-tag-manager';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label'; // Importando Label

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

// Componente auxiliar para renderizar campos com a opção de Tag
interface TaggedFormFieldProps {
    control: Control<FormValues>;
    fieldName: keyof FormValues;
    label: string;
    placeholder: string;
    clienteId?: string;
    disabled?: boolean;
    isOptional?: boolean;
}

const TaggedFormField: React.FC<TaggedFormFieldProps> = ({ control, fieldName, label, placeholder, clienteId, disabled, isOptional = true }) => {
    const fieldMap = CAMPOS_CLIENTE_MAPA.find(m => m.field === fieldName);
    
    // Se o campo não estiver mapeado para uma tag, renderiza o input normal
    if (!fieldMap || !clienteId) {
        return (
            <FormField control={control} name={fieldName} render={({ field }) => (
                <FormItem>
                    <FormLabel>{label} {isOptional && <span className="text-muted-foreground">(Opcional)</span>}</FormLabel>
                    <FormControl><Input placeholder={placeholder} {...field} disabled={disabled} /></FormControl>
                    <FormMessage />
                </FormItem>
            )} />
        );
    }
    
    // Passando 0 como refreshKey, pois FormCliente não tem gerenciamento global de tags.
    const { isTagActive, loading, toggleTag } = useTagManager(clienteId, { label: fieldMap.label, tag: fieldMap.tag, field: fieldMap.field }, 0);

    return (
        <FormField control={control} name={fieldName} render={({ field }) => (
            <FormItem>
                <div className="flex justify-between items-center">
                    <FormLabel>{label} {isOptional && <span className="text-muted-foreground">(Opcional)</span>}</FormLabel>
                    <div className="flex items-center space-x-1">
                        <Checkbox 
                            id={`tag-${fieldName}`}
                            checked={isTagActive}
                            onCheckedChange={(checked) => toggleTag(!!checked)}
                            disabled={loading || disabled}
                        />
                        <Label htmlFor={`tag-${fieldName}`} className={cn("text-xs font-normal flex items-center", isTagActive ? "text-primary" : "text-muted-foreground")}>
                            {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Tag className="w-3 h-3 mr-1" />}
                            Usar como Tag
                        </Label>
                    </div>
                </div>
                <FormControl><Input placeholder={placeholder} {...field} value={(field.value as string) || ''} disabled={disabled} /></FormControl>
                <FormMessage />
            </FormItem>
        )} />
    );
};


const FormCliente: React.FC<FormClienteProps> = ({ clienteInicial, onSaveComplete }) => {
  const { perfil, role, usuario } = useSessao();
  const clienteId = clienteInicial?.id;

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

  const getOwnerIds = () => {
    let empresaId: string | null = null;
    
    if (role === 'Admin') {
        // Admin usa seu próprio ID como empresa_id
        empresaId = usuario?.id || null;
    } else if (role === 'Cliente') {
        // Cliente usa seu próprio ID como empresa_id
        empresaId = (perfil as ClienteProfile)?.id;
    } else if (role === 'Usuario') {
        // Usuário usa o ID do seu cliente/empresa
        empresaId = (perfil as UsuarioProfile)?.cliente_id;
    }
    
    return { empresaId };
  };
  
  const fetchAddressByCep = useCallback(async (cep: string) => {
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
    const { empresaId } = getOwnerIds();
    
    // Validação: Se não for Admin, deve ter um empresaId válido.
    if (!empresaId) {
      showError('Não foi possível identificar o proprietário. Não é possível salvar.');
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
      
      // IDs de Propriedade
      empresa_id: empresaId, // ID do Admin ou ID da Empresa Cliente
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
        <TaggedFormField control={form.control as Control<FormValues>} fieldName="nome" label="Nome Fantasia / Nome Pessoal" placeholder="Nome Fantasia ou Nome Completo" clienteId={clienteId} isOptional={false} />
        <TaggedFormField control={form.control as Control<FormValues>} fieldName="razao_social" label="Razão Social" placeholder="Razão Social da Empresa" clienteId={clienteId} />
        <TaggedFormField control={form.control as Control<FormValues>} fieldName="documento" label="Documento (CPF/CNPJ)" placeholder="00.000.000/0000-00" clienteId={clienteId} />
        
        <Separator />
        
        <h3 className="font-semibold text-lg">Contato</h3>
        <TaggedFormField control={form.control as Control<FormValues>} fieldName="email" label="Email" placeholder="contato@cliente.com" clienteId={clienteId} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TaggedFormField control={form.control as Control<FormValues>} fieldName="telefone" label="Telefone (Celular/Principal)" placeholder="(00) 90000-0000" clienteId={clienteId} />
            <TaggedFormField control={form.control as Control<FormValues>} fieldName="telefone_fixo" label="Telefone Fixo" placeholder="(00) 3000-0000" clienteId={clienteId} />
        </div>
        
        <Separator />
        
        <h3 className="font-semibold text-lg">Endereço</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <TaggedFormField control={form.control as Control<FormValues>} fieldName="cep" label="CEP" placeholder="00000-000" clienteId={clienteId} />
            <TaggedFormField control={form.control as Control<FormValues>} fieldName="cidade" label="Cidade" placeholder="São Paulo" clienteId={clienteId} disabled={form.watch('cidade') === 'Buscando...'} />
            <TaggedFormField control={form.control as Control<FormValues>} fieldName="estado" label="Estado (UF)" placeholder="SP" clienteId={clienteId} disabled={form.watch('estado') === 'Buscando...'} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <TaggedFormField control={form.control as Control<FormValues>} fieldName="endereco" label="Logradouro/Rua" placeholder="Rua Exemplo" clienteId={clienteId} disabled={form.watch('endereco') === 'Buscando...'} />
            <TaggedFormField control={form.control as Control<FormValues>} fieldName="numero" label="Número" placeholder="123" clienteId={clienteId} />
            <TaggedFormField control={form.control as Control<FormValues>} fieldName="complemento" label="Complemento" placeholder="Apto 101" clienteId={clienteId} />
        </div>
        <TaggedFormField control={form.control as Control<FormValues>} fieldName="bairro" label="Bairro" placeholder="Centro" clienteId={clienteId} disabled={form.watch('bairro') === 'Buscando...'} />
        
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar Cliente
        </Button>
      </form>
    </Form>
  );
};

export default FormCliente;