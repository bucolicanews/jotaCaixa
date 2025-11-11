import React, { useState, useRef, useEffect } from 'react';
import { Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { PlanoContas } from '@/types/plano-contas';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

interface EditableSelectCellProps {
  id: string; // ID da conta
  initialValue: 'Sim' | 'Não';
  fieldName: keyof PlanoContas; // Deve ser 'Analitica'
  onSaveSuccess: () => void;
  isEditable: boolean; // Se a célula pode ser editada
}

const EditableSelectCell: React.FC<EditableSelectCellProps> = ({
  id,
  initialValue,
  fieldName,
  onSaveSuccess,
  isEditable,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(initialValue);
  const [loading, setLoading] = useState(false);
  const selectRef = useRef<HTMLButtonElement>(null);

  // Foca no select quando o modo de edição é ativado
  useEffect(() => {
    if (isEditing && selectRef.current) {
      // Simula um clique para abrir o dropdown imediatamente
      selectRef.current.click();
    }
  }, [isEditing]);

  const handleSave = async (newValue: 'Sim' | 'Não') => {
    if (!isEditable || loading) return;
    
    // Se o valor não mudou, apenas sai do modo de edição
    if (newValue === initialValue) {
        setIsEditing(false);
        return;
    }

    setLoading(true);
    
    const payload = {
        [fieldName]: newValue,
        atualizado_em: new Date().toISOString(),
    };

    try {
      const { error } = await supabase
        .from('plano_contas')
        .update(payload)
        .eq('id', id);

      if (error) throw error;

      showSuccess('Conta atualizada!');
      setValue(newValue);
      setIsEditing(false);
      onSaveSuccess();
    } catch (error: any) {
      console.error('Erro ao salvar edição inline:', error);
      showError('Falha ao salvar: ' + error.message);
    } finally {
      setLoading(false);
    }
  };
  
  const handleCancel = () => {
    setValue(initialValue);
    setIsEditing(false);
  };

  if (!isEditable) {
    return (
      <div className="p-2 min-h-[32px] flex items-center justify-center cursor-default">
        {initialValue}
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className="flex items-center space-x-1">
        <Select 
            value={value} 
            onValueChange={(newValue: 'Sim' | 'Não') => handleSave(newValue)}
            disabled={loading}
        >
            <SelectTrigger ref={selectRef} className="h-8 p-2 text-sm flex-1 min-w-[100px]">
                <SelectValue placeholder={value} />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="Sim">Sim</SelectItem>
                <SelectItem value="Não">Não</SelectItem>
            </SelectContent>
        </Select>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleCancel}
          disabled={loading}
          className="h-8 w-8 text-red-600 hover:text-red-700"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "p-2 min-h-[32px] flex items-center justify-center cursor-pointer hover:bg-secondary/50 rounded-md"
      )}
      onClick={() => setIsEditing(true)}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : initialValue}
    </div>
  );
};

export default EditableSelectCell;