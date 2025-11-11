import React from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';

interface EditableSelectCellProps {
    id: string;
    initialValue: 'Sim' | 'Não';
    fieldName: string;
    onSaveSuccess: () => void;
    isEditable: boolean;
}

const EditableSelectCell: React.FC<EditableSelectCellProps> = ({
    id,
    initialValue,
    fieldName,
    onSaveSuccess,
    isEditable,
}) => {
    // Lógica de edição inline simplificada
    const handleSave = async (newValue: 'Sim' | 'Não') => {
        if (newValue === initialValue) return;

        try {
            const { error } = await supabase
                .from('plano_contas')
                .update({ [fieldName]: newValue })
                .eq('id', id);

            if (error) throw error;
            showSuccess('Campo atualizado com sucesso.');
            onSaveSuccess();
        } catch (error: any) {
            console.error('Erro ao salvar:', error);
            showError('Falha ao atualizar: ' + error.message);
        }
    };

    return (
        <select
            value={initialValue}
            onChange={(e) => handleSave(e.target.value as 'Sim' | 'Não')}
            disabled={!isEditable}
            className="bg-transparent border-none focus:ring-0 text-center w-full"
        >
            <option value="Sim">Sim</option>
            <option value="Não">Não</option>
        </select>
    );
};

export default EditableSelectCell;