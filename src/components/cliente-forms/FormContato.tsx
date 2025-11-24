import React from 'react';
import { Control } from 'react-hook-form';
import { Separator } from '@/components/ui/separator';
import { TaggedFormField } from '../usuario-forms/TaggedFormField'; // Importando o componente TaggedFormField

interface FormContatoProps {
  control: Control<any>;
  clienteId: string | undefined;
  isSubmitting: boolean;
  tagRefreshKey: number;
  onTagToggle: () => void; // NOVO PROP
}

const FormContato: React.FC<FormContatoProps> = ({ control, clienteId, isSubmitting, tagRefreshKey, onTagToggle }) => {
  return (
    <div className="space-y-4">
      <Separator />
      <h3 className="font-semibold text-lg">Contato</h3>
      
      <TaggedFormField 
          control={control} 
          fieldName="email" 
          label="Email" 
          placeholder="contato@cliente.com" 
          resourceId={clienteId} 
          disabled={isSubmitting}
          tagRefreshKey={tagRefreshKey}
          onTagToggle={onTagToggle}
          isClientScope={true} // Escopo de Cliente
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TaggedFormField 
              control={control} 
              fieldName="telefone" 
              label="Telefone (Celular/Principal)" 
              placeholder="(00) 90000-0000" 
              resourceId={clienteId} 
              disabled={isSubmitting}
              tagRefreshKey={tagRefreshKey}
              onTagToggle={onTagToggle}
              isClientScope={true}
          />
          <TaggedFormField 
              control={control} 
              fieldName="telefone_fixo" 
              label="Telefone Fixo" 
              placeholder="(00) 3000-0000" 
              resourceId={clienteId} 
              disabled={isSubmitting}
              tagRefreshKey={tagRefreshKey}
              onTagToggle={onTagToggle}
              isClientScope={true}
          />
      </div>
    </div>
  );
};

export default FormContato;