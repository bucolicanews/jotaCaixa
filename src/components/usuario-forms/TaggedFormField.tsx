import React from 'react';
import { Control } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Loader2, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTagManager } from '@/hooks/use-tag-manager';
import { CAMPOS_USUARIO_MAPA, CAMPOS_CLIENTE_MAPA } from '@/config/contrato-campos-mapeaveis';

interface TagMetadata {
    label: string;
    tag: string;
    field: string; // Adicionado para resolver TS2339
}

interface TaggedFormFieldProps {
    control: Control<any>;
    fieldName: string;
    label: string;
    placeholder: string;
    resourceId: string | undefined; // Propriedade renomeada
    disabled: boolean;
    isOptional?: boolean;
    tagRefreshKey: number;
    onTagToggle: () => void;
    isClientScope?: boolean;
    isReadOnly?: boolean; // NOVO PROP
    isAddressLoading?: boolean; // NOVO PROP
}

const TaggedFormField: React.FC<TaggedFormFieldProps> = ({ control, fieldName, label, placeholder, resourceId, disabled, isOptional = true, tagRefreshKey, onTagToggle, isClientScope = false, isReadOnly = false, isAddressLoading = false }) => {
    
    const fieldMap = isClientScope 
        ? CAMPOS_CLIENTE_MAPA.find(m => m.field === fieldName)
        : CAMPOS_USUARIO_MAPA.find(m => m.field === fieldName);
    
    // Determina se o campo deve ser desabilitado (além do disabled padrão)
    const finalDisabled = disabled || isReadOnly || isAddressLoading;
    
    // Se o campo não estiver mapeado para uma tag, renderiza o input normal
    if (!fieldMap || !resourceId) {
        return (
            <FormField control={control} name={fieldName} render={({ field }) => (
                <FormItem>
                    <FormLabel>{label} {isOptional && <span className="text-muted-foreground">(Opcional)</span>}</FormLabel>
                    <FormControl><Input placeholder={placeholder} {...field} value={(field.value as string) || ''} disabled={finalDisabled} /></FormControl>
                    <FormMessage />
                </FormItem>
            )} />
        );
    }
    
    const { isTagActive, loading, toggleTag } = useTagManager(resourceId, fieldMap as TagMetadata, tagRefreshKey);
    
    const handleToggle = async (checked: boolean) => {
        if (isReadOnly) return;
        await toggleTag(checked);
        onTagToggle(); // Chama o refetch do bulk manager no pai
    };

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
                            disabled={loading || disabled || isReadOnly} // Bloqueado se isReadOnly
                        />
                        <Label htmlFor={`tag-${fieldName}`} className={cn("text-xs font-normal flex items-center", isTagActive ? "text-primary" : "text-muted-foreground")}>
                            {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Tag className="w-3 h-3 mr-1" />}
                            Usar como Tag
                        </Label>
                    </div>
                </div>
                <FormControl><Input placeholder={placeholder} {...field} value={(field.value as string) || ''} disabled={finalDisabled} /></FormControl>
                <FormMessage />
            </FormItem>
        )} />
    );
};

export { TaggedFormField };