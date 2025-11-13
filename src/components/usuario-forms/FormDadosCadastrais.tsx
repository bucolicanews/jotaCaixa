import React, { useCallback, useEffect } from 'react';
import { Control, useFormContext } from 'react-hook-form';
import { Separator } from '@/components/ui/separator';
import { showError } from '@/utils/toast';
import { useBulkTagManager } from '@/hooks/use-bulk-tag-manager';
import { TaggedFormField } from './TaggedFormField'; // Importando o componente TaggedFormField

interface TaggedFormFieldProps {
    fieldName: string;
    label: string;
    placeholder: string;
    resourceId: string | undefined;
    disabled: boolean;
    isOptional?: boolean;
    tagRefreshKey: number;
    onTagToggle: () => void; // NOVO PROP
}

// Componente wrapper para campos de Usuário (Funcionário)
const UserTaggedFormField: React.FC<TaggedFormFieldProps> = (props) => {
    const { watch, setValue } = useFormContext();
    const fieldValue = watch(props.fieldName);
    
    const handleCepLookup = useCallback(async (cep: string) => {
        const cleanCep = cep.replace(/\D/g, '');

        if (cleanCep.length !== 8) return;
        
        props.fieldName !== 'cep' && setValue('endereco', 'Buscando...');
        props.fieldName !== 'cep' && setValue('bairro', 'Buscando...');
        props.fieldName !== 'cep' && setValue('cidade', 'Buscando...');
        props.fieldName !== 'cep' && setValue('estado', 'Buscando...');
        
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
    }, [setValue, props.fieldName]);
    
    useEffect(() => {
        if (props.fieldName === 'cep') {
            const cleanCep = fieldValue?.replace(/\D/g, '');
            if (cleanCep && cleanCep.length === 8) {
                handleCepLookup(cleanCep);
            }
        }
    }, [props.fieldName, fieldValue, handleCepLookup]);


    return (
        <TaggedFormField 
            {...props} 
            control={useFormContext().control} 
            isClientScope={false} // Escopo de Usuário
        />
    );
};


interface FormDadosCadastraisProps {
    control: Control<any>;
    isSubmitting: boolean;
    resourceId: string | undefined;
    tagRefreshKey: number; // Este prop não será mais usado diretamente, mas mantido para compatibilidade
    onTagToggle: () => void; // ADICIONADO
}

const FormDadosCadastrais: React.FC<FormDadosCadastraisProps> = ({ isSubmitting, resourceId, tagRefreshKey, onTagToggle }) => {
    const { watch } = useFormContext();
    const { refetchStatus } = useBulkTagManager(resourceId);
    
    // Função de callback para forçar a atualização do status das tags em massa
    const handleTagToggle = useCallback(() => {
        refetchStatus();
        onTagToggle();
    }, [refetchStatus, onTagToggle]);
    
    const isAddressLoading = watch('endereco') === 'Buscando...';
    

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="font-semibold text-lg">Dados Cadastrais (Tags de Contrato)</h3>
                {/* Botões de Marcar/Desmarcar Todos Removidos */}
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
                />
                <UserTaggedFormField 
                    fieldName="rg" 
                    label="RG" 
                    placeholder="00.000.000-0" 
                    resourceId={resourceId} 
                    disabled={isSubmitting}
                    tagRefreshKey={tagRefreshKey}
                    onTagToggle={handleTagToggle}
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
            />
            <UserTaggedFormField 
                fieldName="nome_pai" 
                label="Nome do Pai" 
                placeholder="Nome completo do pai" 
                resourceId={resourceId} 
                disabled={isSubmitting}
                tagRefreshKey={tagRefreshKey}
                onTagToggle={handleTagToggle}
            />
            <UserTaggedFormField 
                fieldName="telefone" 
                label="Telefone de Contato" 
                placeholder="(00) 90000-0000" 
                resourceId={resourceId} 
                disabled={isSubmitting}
                tagRefreshKey={tagRefreshKey}
                onTagToggle={handleTagToggle}
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
                />
                <UserTaggedFormField 
                    fieldName="cidade" 
                    label="Cidade" 
                    placeholder="São Paulo" 
                    resourceId={resourceId} 
                    disabled={isSubmitting || isAddressLoading}
                    tagRefreshKey={tagRefreshKey}
                    onTagToggle={handleTagToggle}
                />
                <UserTaggedFormField 
                    fieldName="estado" 
                    label="Estado (UF)" 
                    placeholder="SP" 
                    resourceId={resourceId} 
                    disabled={isSubmitting || isAddressLoading}
                    tagRefreshKey={tagRefreshKey}
                    onTagToggle={handleTagToggle}
                />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <UserTaggedFormField 
                    fieldName="endereco" 
                    label="Logradouro/Rua" 
                    placeholder="Rua Exemplo" 
                    resourceId={resourceId} 
                    disabled={isSubmitting || isAddressLoading}
                    tagRefreshKey={tagRefreshKey}
                    onTagToggle={handleTagToggle}
                />
                <UserTaggedFormField 
                    fieldName="numero" 
                    label="Número" 
                    placeholder="123" 
                    resourceId={resourceId} 
                    disabled={isSubmitting}
                    tagRefreshKey={tagRefreshKey}
                    onTagToggle={handleTagToggle}
                />
                <UserTaggedFormField 
                    fieldName="complemento" 
                    label="Complemento" 
                    placeholder="Apto 101" 
                    resourceId={resourceId} 
                    disabled={isSubmitting}
                    tagRefreshKey={tagRefreshKey}
                    onTagToggle={handleTagToggle}
                />
            </div>
            <UserTaggedFormField 
                fieldName="bairro" 
                label="Bairro" 
                placeholder="Centro" 
                resourceId={resourceId} 
                disabled={isSubmitting || isAddressLoading}
                tagRefreshKey={tagRefreshKey}
                onTagToggle={handleTagToggle}
            />
        </div>
    );
};

export default FormDadosCadastrais;