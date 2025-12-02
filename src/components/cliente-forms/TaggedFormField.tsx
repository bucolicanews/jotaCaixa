import React from 'react';
import { Control } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Loader2, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTagManager } from '@/hooks/use-tag-manager';
import { CAMPOS_CLIENTE_MAPA } from '@/config/contrato-campos-mapeaveis';

interface TaggedFormFieldProps {
    control: Control<any>;
    fieldName: string;
    label: string;
    placeholder: string;
    clienteId: string | undefined;
    disabled: boolean;
    isOptional?: boolean;
    tagRefreshKey: number;
    onTagToggle?: () => void; // NOVO PROP: Opcional, pois nem sempre será usado (ex: FormCliente)
}

const TaggedFormField: React.FC<TaggedFormFieldProps> = ({ control, fieldName, label, placeholder, clienteId, disabled, isOptional = true, tagRefreshKey, onTagToggle }) => {
    const fieldMap = CAMPOS_CLIENTE_MAPA.find(m => m.field === fieldName);
    
    // Se o campo não estiver mapeado para uma tag, renderiza o input normal
    if (!fieldMap || !clienteId) {
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
    
    const { isTagActive, loading, toggleTag } = useTagManager(clienteId, fieldMap, tagRefreshKey);

    const handleToggle = async (checked: boolean) => {
        await toggleTag(checked);
        if (onTagToggle) {
            onTagToggle();
        }
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

export { TaggedFormField };