import React, { useCallback, useEffect } from 'react';
import { Control, useFormContext } from 'react-hook-form';
import { Separator } from '@/components/ui/separator';
import { TaggedFormField } from '../usuario-forms/TaggedFormField'; // Importando o componente TaggedFormField
import { fetchAddressByCep } from '@/utils/cep-lookup'; // IMPORTANDO UTILITÁRIO

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
  
  // --- LÓGICA CENTRALIZADA DE BUSCA DE CEP ---
  const handleCepLookup = useCallback(async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, '');

    if (cleanCep.length !== 8) {
      return;
    }
    
    // 1. Define estado de carregamento
    setValue('endereco', 'Buscando...');
    setValue('bairro', 'Buscando...');
    setValue('cidade', 'Buscando...');
    setValue('estado', 'Buscando...');
    
    const address = await fetchAddressByCep(cleanCep); // Usa o utilitário

    if (address) {
        setValue('endereco', address.logradouro || '');
        setValue('bairro', address.bairro || '');
        setValue('cidade', address.localidade || '');
        setValue('estado', address.uf || '');
    } else {
        // Limpa se falhar
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
      handleCepLookup(cleanCep);
    }
  }, [cepValue, handleCepLookup]);
  
  const isAddressLoading = watch('endereco') === 'Buscando...';
  // --- FIM LÓGICA CENTRALIZADA DE BUSCA DE CEP ---

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