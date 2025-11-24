import React, { useCallback, useEffect } from 'react';
import { Control, useFormContext } from 'react-hook-form';
import { Separator } from '@/components/ui/separator';
import { TaggedFormField } from '../usuario-forms/TaggedFormField'; // Importando o componente TaggedFormField
import { showError } from '@/utils/toast';

interface FormEnderecoProps {
  control: Control<any>;
  clienteId: string | undefined;
  isSubmitting: boolean;
  tagRefreshKey: number;
  onTagToggle: () => void; // NOVO PROP
}

const FormEndereco: React.FC<FormEnderecoProps> = ({ control, clienteId, isSubmitting, tagRefreshKey, onTagToggle }) => {
  const { watch, setValue } = useFormContext();
  const cepValue = watch('cep');
  
  const fetchAddressByCep = useCallback(async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, '');

    if (cleanCep.length !== 8) {
      return;
    }
    
    // Bloqueia a edição dos campos enquanto busca
    setValue('endereco', 'Buscando...');
    setValue('bairro', 'Buscando...');
    setValue('cidade', 'Buscando...');
    setValue('estado', 'Buscando...');
    
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await response.json();

      if (data.erro) {
        showError('CEP não encontrado.');
        setValue('endereco', '');
        setValue('bairro', '');
        setValue('cidade', '');
        setValue('estado', '');
        return;
      }

      // Preenche os campos
      setValue('endereco', data.logradouro || '');
      setValue('bairro', data.bairro || '');
      setValue('cidade', data.localidade || '');
      setValue('estado', data.uf || '');
      
    } catch (error) {
      console.error('Erro ao consultar ViaCEP:', error);
      showError('Falha ao consultar o CEP.');
      setValue('endereco', '');
      setValue('bairro', '');
      setValue('cidade', '');
      setValue('estado', '');
    }
  }, [setValue]);
  
  // Monitora a mudança do CEP para buscar o endereço
  useEffect(() => {
    const cleanCep = cepValue?.replace(/\D/g, '');
    if (cleanCep && cleanCep.length === 8) {
      fetchAddressByCep(cleanCep);
    }
  }, [cepValue, fetchAddressByCep]);
  
  const isAddressLoading = watch('endereco') === 'Buscando...';

  return (
    <div className="space-y-4">
      <Separator />
      <h3 className="font-semibold text-lg">Endereço</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <TaggedFormField 
              control={control} 
              fieldName="cep" 
              label="CEP" 
              placeholder="00000-000" 
              resourceId={clienteId} 
              disabled={isSubmitting}
              tagRefreshKey={tagRefreshKey}
              onTagToggle={onTagToggle}
              isClientScope={true} // Escopo de Cliente
              isAddressLoading={isAddressLoading}
          />
          <TaggedFormField 
              control={control} 
              fieldName="cidade" 
              label="Cidade" 
              placeholder="São Paulo" 
              resourceId={clienteId} 
              disabled={isSubmitting || isAddressLoading}
              tagRefreshKey={tagRefreshKey}
              onTagToggle={onTagToggle}
              isClientScope={true}
              isAddressLoading={isAddressLoading}
          />
          <TaggedFormField 
              control={control} 
              fieldName="estado" 
              label="Estado (UF)" 
              placeholder="SP" 
              resourceId={clienteId} 
              disabled={isSubmitting || isAddressLoading}
              tagRefreshKey={tagRefreshKey}
              onTagToggle={onTagToggle}
              isClientScope={true}
              isAddressLoading={isAddressLoading}
          />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <TaggedFormField 
              control={control} 
              fieldName="endereco" 
              label="Logradouro/Rua" 
              placeholder="Rua Exemplo" 
              resourceId={clienteId} 
              disabled={isSubmitting || isAddressLoading}
              tagRefreshKey={tagRefreshKey}
              onTagToggle={onTagToggle}
              isClientScope={true}
              isAddressLoading={isAddressLoading}
          />
          <TaggedFormField 
              control={control} 
              fieldName="numero" 
              label="Número" 
              placeholder="123" 
              resourceId={clienteId} 
              disabled={isSubmitting}
              tagRefreshKey={tagRefreshKey}
              onTagToggle={onTagToggle}
              isClientScope={true}
              isAddressLoading={isAddressLoading}
          />
          <TaggedFormField 
              control={control} 
              fieldName="complemento" 
              label="Complemento" 
              placeholder="Apto 101" 
              resourceId={clienteId} 
              disabled={isSubmitting}
              tagRefreshKey={tagRefreshKey}
              onTagToggle={onTagToggle}
              isClientScope={true}
              isAddressLoading={isAddressLoading}
          />
      </div>
      <TaggedFormField 
          control={control} 
          fieldName="bairro" 
          label="Bairro" 
          placeholder="Centro" 
          resourceId={clienteId} 
          disabled={isSubmitting || isAddressLoading}
          tagRefreshKey={tagRefreshKey}
          onTagToggle={onTagToggle}
          isClientScope={true}
          isAddressLoading={isAddressLoading}
      />
    </div>
  );
};

export default FormEndereco;