import React, { useCallback, useEffect } from 'react';
import { Control, useFormContext } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useTagManager } from '@/hooks/use-tag-manager';
import { CAMPOS_USUARIO_MAPA } from '@/config/contrato-campos-mapeaveis';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Loader2, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { showError } from '@/utils/toast';
import { useBulkTagManager } from '@/hooks/use-bulk-tag-manager';
import { Button } from '../ui/button'; // Importando Button

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

const TaggedFormField: React.FC<TaggedFormFieldProps> = ({ fieldName, label, placeholder, resourceId, disabled, isOptional = true, tagRefreshKey, onTagToggle }) => {
    const { control, watch, setValue } = useFormContext();
    const fieldMap = CAMPOS_USUARIO_MAPA.find(m => m.field === fieldName);
    const fieldValue = watch(fieldName);
    
    // Se o campo não estiver mapeado para uma tag, renderiza o input normal
    if (!fieldMap || !resourceId) {
        return (
            <FormField control={control} name={fieldName} render={({ field }) => (
                <FormItem>
                    <FormLabel>{label} {isOptional && <span className="text-muted-foreground">(Opcional)</span>}</FormLabel>
                    <FormControl><Input placeholder={placeholder} {...field} value={(field.value as string) || ''} disabled={disabled} /></FormControl>
                    <FormMessage />
                </FormItem>
            )} />
        );
    }
    
    // O useTagManager agora usa o tagRefreshKey (que é o refreshKey do bulk manager)
    const { isTagActive, loading, toggleTag } = useTagManager(resourceId, fieldMap, tagRefreshKey);
    
    const handleToggle = async (checked: boolean) => {
        await toggleTag(checked);
        onTagToggle(); // Chama o refetch do bulk manager no pai
    };
    
    const handleCepLookup = useCallback(async (cep: string) => {
        const cleanCep = cep.replace(/\D/g, '');

        if (cleanCep.length !== 8) return;
        
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
    
    useEffect(() => {
        if (fieldName === 'cep') {
            const cleanCep = fieldValue?.replace(/\D/g, '');
            if (cleanCep && cleanCep.length === 8) {
                handleCepLookup(cleanCep);
            }
        }
    }, [fieldName, fieldValue, handleCepLookup]);


    return (
        <FormField control={control} name={fieldName} render={({ field }) => (
            <FormItem>
                <div className="flex justify-between items-center">
                    <FormLabel>{label} {isOptional && <span className="text-muted-foreground">(Opcional)</span>}</FormLabel>
                    <div className="flex items-center space-x-1">
                        <Checkbox 
                            id={`tag-${fieldName}`}
                            checked={isTagActive}
                            onCheckedChange={handleToggle}
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


interface FormDadosCadastraisProps {
    control: Control<any>;
    isSubmitting: boolean;
    resourceId: string | undefined;
    tagRefreshKey: number; // Este prop não será mais usado diretamente, mas mantido para compatibilidade
}

const FormDadosCadastrais: React.FC<FormDadosCadastraisProps> = ({ isSubmitting, resourceId }) => {
    const { refetchStatus, refreshKey, toggleAllTags, isAllActive, loading: loadingBulk } = useBulkTagManager(resourceId);
    
    const { watch } = useFormContext();
    const isAddressLoading = watch('endereco') === 'Buscando...';
    
    // Função de callback para forçar a atualização do status das tags em massa
    const handleTagToggle = useCallback(() => {
        refetchStatus();
    }, [refetchStatus]);
    
    console.log(`[FormDadosCadastrais] Bulk Loading: ${loadingBulk}, All Active: ${isAllActive}, Submitting: ${isSubmitting}`);


    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="font-semibold text-lg">Dados Cadastrais (Tags de Contrato)</h3>
                <div className="space-x-2">
                    <Button 
                        type="button" 
                        variant="link" 
                        size="sm" 
                        onClick={() => toggleAllTags(true)} 
                        disabled={isSubmitting || loadingBulk || isAllActive}
                        className="p-0 h-auto"
                    >
                        {loadingBulk && isAllActive ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : 'Marcar Todos'}
                    </Button>
                    <Button 
                        type="button" 
                        variant="link" 
                        size="sm" 
                        onClick={() => toggleAllTags(false)} 
                        disabled={isSubmitting || loadingBulk || !isAllActive}
                        className="p-0 h-auto text-destructive"
                    >
                        {loadingBulk && !isAllActive ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : 'Desmarcar Todos'}
                    </Button>
                </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">Dados pessoais e de contato do funcionário.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <TaggedFormField 
                    fieldName="cpf" 
                    label="CPF" 
                    placeholder="000.000.000-00" 
                    resourceId={resourceId} 
                    disabled={isSubmitting}
                    tagRefreshKey={refreshKey} // Passando o refreshKey do bulk manager
                    onTagToggle={handleTagToggle}
                />
                <TaggedFormField 
                    fieldName="rg" 
                    label="RG" 
                    placeholder="00.000.000-0" 
                    resourceId={resourceId} 
                    disabled={isSubmitting}
                    tagRefreshKey={refreshKey} // Passando o refreshKey do bulk manager
                    onTagToggle={handleTagToggle}
                />
            </div>

            <TaggedFormField 
                fieldName="nome_mae" 
                label="Nome da Mãe" 
                placeholder="Nome completo da mãe" 
                resourceId={resourceId} 
                disabled={isSubmitting}
                isOptional={false}
                tagRefreshKey={refreshKey} // Passando o refreshKey do bulk manager
                onTagToggle={handleTagToggle}
            />
            <TaggedFormField 
                fieldName="nome_pai" 
                label="Nome do Pai" 
                placeholder="Nome completo do pai" 
                resourceId={resourceId} 
                disabled={isSubmitting}
                tagRefreshKey={refreshKey} // Passando o refreshKey do bulk manager
                onTagToggle={handleTagToggle}
            />
            <TaggedFormField 
                fieldName="telefone" 
                label="Telefone de Contato" 
                placeholder="(00) 90000-0000" 
                resourceId={resourceId} 
                disabled={isSubmitting}
                tagRefreshKey={refreshKey} // Passando o refreshKey do bulk manager
                onTagToggle={handleTagToggle}
            />

            <Separator />
            <h4 className="font-semibold">Endereço</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <TaggedFormField 
                    fieldName="cep" 
                    label="CEP" 
                    placeholder="00000-000" 
                    resourceId={resourceId} 
                    disabled={isSubmitting}
                    tagRefreshKey={refreshKey} // Passando o refreshKey do bulk manager
                    onTagToggle={handleTagToggle}
                />
                <TaggedFormField 
                    fieldName="cidade" 
                    label="Cidade" 
                    placeholder="São Paulo" 
                    resourceId={resourceId} 
                    disabled={isSubmitting || isAddressLoading}
                    tagRefreshKey={refreshKey} // Passando o refreshKey do bulk manager
                    onTagToggle={handleTagToggle}
                />
                <TaggedFormField 
                    fieldName="estado" 
                    label="Estado (UF)" 
                    placeholder="SP" 
                    resourceId={resourceId} 
                    disabled={isSubmitting || isAddressLoading}
                    tagRefreshKey={refreshKey} // Passando o refreshKey do bulk manager
                    onTagToggle={handleTagToggle}
                />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <TaggedFormField 
                    fieldName="endereco" 
                    label="Logradouro/Rua" 
                    placeholder="Rua Exemplo" 
                    resourceId={resourceId} 
                    disabled={isSubmitting || isAddressLoading}
                    tagRefreshKey={refreshKey} // Passando o refreshKey do bulk manager
                    onTagToggle={handleTagToggle}
                />
                <TaggedFormField 
                    fieldName="numero" 
                    label="Número" 
                    placeholder="123" 
                    resourceId={resourceId} 
                    disabled={isSubmitting}
                    tagRefreshKey={refreshKey} // Passando o refreshKey do bulk manager
                    onTagToggle={handleTagToggle}
                />
                <TaggedFormField 
                    fieldName="complemento" 
                    label="Complemento" 
                    placeholder="Apto 101" 
                    resourceId={resourceId} 
                    disabled={isSubmitting}
                    tagRefreshKey={refreshKey} // Passando o refreshKey do bulk manager
                    onTagToggle={handleTagToggle}
                />
            </div>
            <TaggedFormField 
                fieldName="bairro" 
                label="Bairro" 
                placeholder="Centro" 
                resourceId={resourceId} 
                disabled={isSubmitting || isAddressLoading}
                tagRefreshKey={refreshKey} // Passando o refreshKey do bulk manager
                onTagToggle={handleTagToggle}
            />
        </div>
    );
};

export default FormDadosCadastrais;