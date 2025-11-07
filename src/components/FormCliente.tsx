import React, { useCallback } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Loader2, Tag } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { Cliente } from '@/types/cliente';
import { useSessao } from '@/hooks/use-sessao';
import { UsuarioProfile, ClienteProfile } from '@/types/usuario';
import FormIdentificacao from './cliente-forms/FormIdentificacao';
import FormContato from './cliente-forms/FormContato';
import FormEndereco from './cliente-forms/FormEndereco';
import { useBulkTagManager } from '@/hooks/use-bulk-tag-manager'; // Importando o hook de bulk tag

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
  const { perfil, role, usuario } = useSessao();
  const clienteId = clienteInicial?.id;
  // Removendo o estado local tagRefreshKey, pois usaremos o do useBulkTagManager
  // const [tagRefreshKey, setTagRefreshKey] = useState(0); 

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
  
  const getOwnerIds = () => {
    let proprietarioId: string | null = null;
    
    if (role === 'Admin') {
        proprietarioId = usuario?.id || null;
    } else if (role === 'Cliente') {
        proprietarioId = (perfil as ClienteProfile)?.id;
    } else if (role === 'Usuario') {
        proprietarioId = (perfil as UsuarioProfile)?.cliente_id;
    }
    
    return { proprietarioId };
  };
  
  // Usando o useBulkTagManager para a lista de tags do Cliente CR
  const { loading: loadingBulk, isAllActive, toggleAllTags, refetchStatus, refreshKey } = useBulkTagManager(clienteId);
  
  // Função de callback para forçar a atualização do status das tags em massa
  const handleTagToggle = useCallback(() => {
      refetchStatus();
  }, [refetchStatus]);

  const onSubmit = async (values: FormValues) => {
    const { proprietarioId } = getOwnerIds();
    
    if (!proprietarioId) {
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
      
      proprietario_id: proprietarioId, // AJUSTE AQUI
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
      // setTagRefreshKey(prev => prev + 1); // Não é mais necessário
      onSaveComplete();
    }
  };
  
  const formMethods = form;

  return (
    <FormProvider {...formMethods}>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          
          <div className="flex justify-between items-center pt-4 border-t">
              <h3 className="font-semibold text-lg flex items-center"><Tag className="w-5 h-5 mr-2" /> Tags de Contrato</h3>
              <div className="flex space-x-2">
                  <Button 
                      type="button" 
                      variant="outline" 
                      size="sm" 
                      onClick={() => toggleAllTags(true)} 
                      disabled={loadingBulk || form.formState.isSubmitting || isAllActive || !clienteId}
                  >
                      {loadingBulk ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Marcar Todas'}
                  </Button>
                  <Button 
                      type="button" 
                      variant="outline" 
                      size="sm" 
                      onClick={() => toggleAllTags(false)} 
                      disabled={loadingBulk || form.formState.isSubmitting || !isAllActive || !clienteId}
                  >
                      {loadingBulk ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Desmarcar Todas'}
                  </Button>
              </div>
          </div>
          <p className="text-sm text-muted-foreground">
              Marque os campos abaixo que devem ser usados como tags dinâmicas em modelos de contrato.
          </p>
          
          <FormIdentificacao 
              control={form.control} 
              clienteId={clienteId} 
              isSubmitting={form.formState.isSubmitting}
              tagRefreshKey={refreshKey} // Passando o refreshKey do bulk manager
              onTagToggle={handleTagToggle}
          />
          
          <FormContato 
              control={form.control} 
              clienteId={clienteId} 
              isSubmitting={form.formState.isSubmitting}
              tagRefreshKey={refreshKey} // Passando o refreshKey do bulk manager
              onTagToggle={handleTagToggle}
          />
          
          <FormEndereco 
              control={form.control} 
              clienteId={clienteId} 
              isSubmitting={form.formState.isSubmitting}
              tagRefreshKey={refreshKey} // Passando o refreshKey do bulk manager
              onTagToggle={handleTagToggle}
          />
          
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