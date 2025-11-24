import React from 'react';
import { Control } from 'react-hook-form';
import { TaggedFormField } from '../usuario-forms/TaggedFormField'; // Importando o componente TaggedFormField

interface FormIdentificacaoProps {
  control: Control<any>;
  clienteId: string | undefined;
  isSubmitting: boolean;
  tagRefreshKey: number;
  onTagToggle: () => void; // NOVO PROP
}

const FormIdentificacao: React.FC<FormIdentificacaoProps> = ({ control, clienteId, isSubmitting, tagRefreshKey, onTagToggle }) => {
  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-lg">Dados de Identificação</h3>
      
      <TaggedFormField 
          control={control} 
          fieldName="nome" 
          label="Nome Principal / Nome Pessoal" 
          placeholder="Nome Principal ou Nome Completo" 
          resourceId={clienteId} 
          disabled={isSubmitting}
          isOptional={false}
          tagRefreshKey={tagRefreshKey}
          onTagToggle={onTagToggle}
          isClientScope={true} // Escopo de Cliente
      />
      <TaggedFormField 
          control={control} 
          fieldName="nome_fantasia" 
          label="Nome Fantasia (Opcional)" 
          placeholder="Nome Fantasia da Empresa" 
          resourceId={clienteId} 
          disabled={isSubmitting}
          tagRefreshKey={tagRefreshKey}
          onTagToggle={onTagToggle}
          isClientScope={true}
      />
      <TaggedFormField 
          control={control} 
          fieldName="razao_social" 
          label="Razão Social (Opcional)" 
          placeholder="Razão Social da Empresa" 
          resourceId={clienteId} 
          disabled={isSubmitting}
          tagRefreshKey={tagRefreshKey}
          onTagToggle={onTagToggle}
          isClientScope={true}
      />
      <TaggedFormField 
          control={control} 
          fieldName="documento" 
          label="Documento (CPF/CNPJ)" 
          placeholder="00.000.000/0000-00" 
          resourceId={clienteId} 
          disabled={isSubmitting}
          tagRefreshKey={tagRefreshKey}
          onTagToggle={onTagToggle}
          isClientScope={true}
      />
    </div>
  );
};

export default FormIdentificacao;