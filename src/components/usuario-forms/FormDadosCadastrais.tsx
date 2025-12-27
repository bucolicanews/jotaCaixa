import React, { useCallback, useEffect } from 'react';
import { Control, useFormContext } from 'react-hook-form';
import { Separator } from '@/components/ui/separator';
import { useBulkTagManager } from '@/hooks/use-bulk-tag-manager';
import { TaggedFormField } from './TaggedFormField'; // Importando o componente TaggedFormField
import { showError } from '@/utils/toast'; // Importando showError

interface TaggedFormFieldProps {
    fieldName: string;
    label: string;
    placeholder: string;
    resourceId: string | undefined;
    disabled: boolean;
    isOptional?: boolean;
    tagRefreshKey: number;
    onTagToggle: () => void;
    isReadOnly: boolean;
    isClientScope: boolean; // NOVO PROP
    isAddressLoading: boolean; // NOVO PROP
}

// Componente wrapper para campos de Usuário (Funcionário)
const UserTaggedFormField: React.FC<TaggedFormFieldProps> = (props) => {
    const { control } = useFormContext();
    return (
        <TaggedFormField 
            {...props} 
            control={control} 
            isClientScope={false} // Escopo de Usuário
        />
    );
};


interface FormDadosCadastraisProps {
    control: Control<any>;
    isSubmitting: boolean;
    resourceId: string | undefined;
    tagRefreshKey: number;
    onTagToggle: () => void;
    isReadOnly: boolean;
    isClientScope?: boolean; // Adicionado para compatibilidade
    isAddressLoading: boolean; // NOVO PROP
}

const FormDadosCadastrais: React.FC<FormDadosCadastraisProps> = ({ isSubmitting, resourceId, tagRefreshKey, onTagToggle, isReadOnly, isAddressLoading }) => {
    const { refetchStatus } = useBulkTagManager(resourceId);
    const { control, watch, setValue } = useFormContext(); // Usando useFormContext para acessar o estado do pai
    
    const handleTagToggle = useCallback(() => {
        refetchStatus();
        onTagToggle();
    }, [refetchStatus, onTagToggle]);
    
    // Monitora o CEP para o lookup (a lógica de lookup está no FormUsuario.tsx)
    const cepValue = watch('cep');
    
    // A lógica de busca de CEP foi removida daqui e centralizada no FormUsuario.tsx
    // Apenas mantemos o monitoramento do estado de carregamento (isAddressLoading)

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="font-semibold text-lg">Dados Cadastrais (Tags de Contrato)</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">Dados pessoais e de contato do funcionário.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <UserTaggedFormField 
                    fieldName="cpf" 
                    label="CPF" 
                    placeholder="000.000.000-00" 
                    resourceId={resourceId} 
                    disabled={isSubmitting}
                    tagRefreshKey={tagRefreshKey}
                    onTagToggle={handleTagToggle}
                    isReadOnly={isReadOnly} // Aplicando isReadOnly
                    isClientScope={false}
                    isAddressLoading={isAddressLoading}
                />
                <UserTaggedFormField 
                    fieldName="rg" 
                    label="RG" 
                    placeholder="00.000.000-0" 
                    resourceId={resourceId} 
                    disabled={isSubmitting}
                    tagRefreshKey={tagRefreshKey}
                    onTagToggle={handleTagToggle}
                    isReadOnly={isReadOnly} // Aplicando isReadOnly
                    isClientScope={false}
                    isAddressLoading={isAddressLoading}
                />
            </div>

            <UserTaggedFormField 
                fieldName="nome_mae" 
                label="Nome da Mãe" 
                placeholder="Nome completo da mãe" 
                resourceId={resourceId} 
                disabled={isSubmitting}
                isOptional={false}
                tagRefreshKey={tagRefreshKey}
                onTagToggle={handleTagToggle}
                isReadOnly={isReadOnly} // Aplicando isReadOnly
                isClientScope={false}
                isAddressLoading={isAddressLoading}
            />
            <UserTaggedFormField 
                fieldName="nome_pai" 
                label="Nome do Pai" 
                placeholder="Nome completo do pai" 
                resourceId={resourceId} 
                disabled={isSubmitting}
                tagRefreshKey={tagRefreshKey}
                onTagToggle={handleTagToggle}
                isReadOnly={isReadOnly} // Aplicando isReadOnly
                isClientScope={false}
                isAddressLoading={isAddressLoading}
            />
            <UserTaggedFormField 
                fieldName="telefone" 
                label="Telefone de Contato" 
                placeholder="(00) 90000-0000" 
                resourceId={resourceId} 
                disabled={isSubmitting}
                tagRefreshKey={tagRefreshKey}
                onTagToggle={handleTagToggle}
                isReadOnly={isReadOnly} // Aplicando isReadOnly
                isClientScope={false}
                isAddressLoading={isAddressLoading}
            />

            <Separator />
            <h4 className="font-semibold">Endereço</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <UserTaggedFormField 
                    fieldName="cep" 
                    label="CEP" 
                    placeholder="00000-000" 
                    resourceId={resourceId} 
                    disabled={isSubmitting}
                    tagRefreshKey={tagRefreshKey}
                    onTagToggle={handleTagToggle}
                    isReadOnly={isReadOnly} // Aplicando isReadOnly
                    isClientScope={false}
                    isAddressLoading={isAddressLoading}
                />
                <UserTaggedFormField 
                    fieldName="cidade" 
                    label="Cidade" 
                    placeholder="São Paulo" 
                    resourceId={resourceId} 
                    disabled={isSubmitting || isAddressLoading} // Desabilitado se estiver buscando
                    tagRefreshKey={tagRefreshKey}
                    onTagToggle={handleTagToggle}
                    isReadOnly={isReadOnly} // Aplicando isReadOnly
                    isClientScope={false}
                    isAddressLoading={isAddressLoading}
                />
                <UserTaggedFormField 
                    fieldName="estado" 
                    label="Estado (UF)" 
                    placeholder="PA" 
                    resourceId={resourceId} 
                    disabled={isSubmitting || isAddressLoading} // Desabilitado se estiver buscando
                    tagRefreshKey={tagRefreshKey}
                    onTagToggle={handleTagToggle}
                    isReadOnly={isReadOnly} // Aplicando isReadOnly
                    isClientScope={false}
                    isAddressLoading={isAddressLoading}
                />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <UserTaggedFormField 
                    fieldName="endereco" 
                    label="Logradouro/Rua" 
                    placeholder="Rua Exemplo" 
                    resourceId={resourceId} 
                    disabled={isSubmitting || isAddressLoading} // Desabilitado se estiver buscando
                    tagRefreshKey={tagRefreshKey}
                    onTagToggle={handleTagToggle}
                    isReadOnly={isReadOnly} // Aplicando isReadOnly
                    isClientScope={false}
                    isAddressLoading={isAddressLoading}
                />
                <UserTaggedFormField 
                    fieldName="numero" 
                    label="Número" 
                    placeholder="123" 
                    resourceId={resourceId} 
                    disabled={isSubmitting}
                    tagRefreshKey={tagRefreshKey}
                    onTagToggle={handleTagToggle}
                    isReadOnly={isReadOnly} // Aplicando isReadOnly
                    isClientScope={false}
                    isAddressLoading={isAddressLoading}
                />
                <UserTaggedFormField 
                    fieldName="complemento" 
                    label="Complemento" 
                    placeholder="Apto 101" 
                    resourceId={resourceId} 
                    disabled={isSubmitting}
                    tagRefreshKey={tagRefreshKey}
                    onTagToggle={handleTagToggle}
                    isReadOnly={isReadOnly} // Aplicando isReadOnly
                    isClientScope={false}
                    isAddressLoading={isAddressLoading}
                />
            </div>
            <UserTaggedFormField 
                fieldName="bairro" 
                label="Bairro" 
                placeholder="Centro" 
                resourceId={resourceId} 
                disabled={isSubmitting || isAddressLoading} // Desabilitado se estiver buscando
                tagRefreshKey={tagRefreshKey}
                onTagToggle={handleTagToggle}
                isReadOnly={isReadOnly} // Aplicando isReadOnly
                isClientScope={false}
                isAddressLoading={isAddressLoading}
            />
        </div>
    );
};

export default FormDadosCadastrais;