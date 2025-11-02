import React from 'react';
import { Control } from 'react-hook-form';
import { TaggedFormField } from './TaggedFormField'; // Importando o componente TaggedFormField

interface FormIdentificacaoProps {
  control: Control<any>;
  clienteId: string | undefined;
  isSubmitting: boolean;
  tagRefreshKey: number;
}

const FormIdentificacao: React.FC<FormIdentificacaoProps> = ({ control, clienteId, isSubmitting, tagRefreshKey }) => {
  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-lg">Dados de Identificação</h3>
      
      <TaggedFormField 
          control={control} 
          fieldName="nome" 
          label="Nome Fantasia / Nome Pessoal" 
          placeholder="Nome Fantasia ou Nome Completo" 
          clienteId={clienteId} 
          disabled={isSubmitting}
          isOptional={false}
          tagRefreshKey={tagRefreshKey}
      />
      <TaggedFormField 
          control={control} 
          fieldName="razao_social" 
          label="Razão Social" 
          placeholder="Razão Social da Empresa" 
          clienteId={clienteId} 
          disabled={isSubmitting}
          tagRefreshKey={tagRefreshKey}
      />
      <TaggedFormField 
          control={control} 
          fieldName="documento" 
          label="Documento (CPF/CNPJ)" 
          placeholder="00.000.000/0000-00" 
          clienteId={clienteId} 
          disabled={isSubmitting}
          tagRefreshKey={tagRefreshKey}
      />
    </div>
  );
};

export default FormIdentificacao;