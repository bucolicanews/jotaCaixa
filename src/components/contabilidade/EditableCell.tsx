import React, { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { PlanoContas } from '@/types/plano-contas';
import { Checkbox } from '../ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

interface EditableCellProps {
  id: string; // ID da conta
  initialValue: string | number | boolean | null | undefined; // Suporta booleano
  fieldName: keyof PlanoContas; // Nome do campo a ser atualizado
  onSaveSuccess: () => void;
  className?: string;
  isEditable: boolean; // Se a célula pode ser editada
  
  // Novos props para tipos de input
  type?: 'text' | 'boolean' | 'select';
  options?: string[]; // Apenas para type='select'
}

const EditableCell: React.FC<EditableCellProps> = ({
  id,
  initialValue,
  fieldName,
  onSaveSuccess,
  className,
  isEditable,
  type = 'text',
  options = [],
}) => {
  const isBoolean = type === 'boolean';
  const isSelect = type === 'select';
  
  const initialValueString = String(initialValue || '');
  const initialBooleanValue = isBoolean ? !!initialValue : false;
  
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState<string | boolean>(isBoolean ? initialBooleanValue : initialValueString);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sincroniza o estado interno com o valor inicial quando o modo de edição é ativado
  useEffect(() => {
    if (isEditing) {
        setValue(isBoolean ? initialBooleanValue : initialValueString);
        if (inputRef.current) {
            inputRef.current.focus();
        }
    }
  }, [isEditing, initialValueString, initialBooleanValue, isBoolean]);

  const handleSave = async (newValue?: string | boolean) => {
    if (!isEditable || loading) return;
    
    let finalValue: string | number | boolean | null;
    
    if (isBoolean) {
        finalValue = newValue !== undefined ? newValue : (value as boolean);
    } else {
        const currentValue = newValue !== undefined ? (newValue as string) : (value as string);
        const trimmedValue = currentValue.trim();
        
        // Se o valor não mudou, apenas sai do modo de edição
        if (trimmedValue === initialValueString) {
            setIsEditing(false);
            return;
        }
        
        if (fieldName === 'Descricao' && trimmedValue.length < 1) {
            showError('A descrição não pode ser vazia.');
            setLoading(false);
            return;
        }
        finalValue = trimmedValue || null;
    }

    setLoading(true);
    
    const payload = {
        [fieldName]: finalValue,
        atualizado_em: new Date().toISOString(),
    };

    try {
      const { error } = await supabase
        .from('plano_contas')
        .update(payload)
        .eq('id', id);

      if (error) throw error;

      showSuccess('Conta atualizada!');
      setIsEditing(false);
      onSaveSuccess();
    } catch (error: any) {
      console.error('Erro ao salvar edição inline:', error);
      showError('Falha ao salvar: ' + error.message);
    } finally {
      setLoading(false);
    }
  };
  
  // Lógica para Checkbox
  if (isBoolean) {
      const checked = !!initialValue;
      
      const handleToggle = async (newChecked: boolean) => {
          if (!isEditable) return;
          await handleSave(newChecked);
      };
      
      return (
          <div className="flex justify-center items-center h-full">
              <Checkbox 
                  checked={checked} 
                  onCheckedChange={handleToggle} 
                  disabled={loading || !isEditable}
              />
              {loading && <Loader2 className="h-4 w-4 animate-spin ml-2 text-primary" />}
          </div>
      );
  }
  
  // Lógica para Select
  if (isSelect) {
      return (
          <div className="flex items-center space-x-1">
              <Select 
                  value={initialValueString} 
                  onValueChange={handleSave} 
                  disabled={loading || !isEditable}
              >
                  <SelectTrigger className="h-8 text-sm flex-1 min-w-[80px]">
                      <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                      {options.map(opt => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                  </SelectContent>
              </Select>
              {loading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
          </div>
      );
  }

  // Lógica para Input (Texto/Número)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setValue(initialValueString);
      setIsEditing(false);
    }
  };
  
  const displayValue = initialValueString || '-';

  if (isEditing) {
    return (
      <div className="flex items-center space-x-1">
        <Input
          ref={inputRef}
          value={value as string}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => handleSave()} // Salva ao perder o foco
          onKeyDown={handleKeyDown}
          className="h-8 p-2 text-sm flex-1 min-w-[100px]"
          disabled={loading}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => handleSave()}
          disabled={loading}
          className="h-8 w-8 text-green-600 hover:text-green-700"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => {
            setValue(initialValueString);
            setIsEditing(false);
          }}
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
        "p-2 min-h-[32px] flex items-center",
        isEditable ? "cursor-pointer hover:bg-secondary/50 rounded-md" : "cursor-default",
        className
      )}
      onClick={() => isEditable && setIsEditing(true)}
    >
      {displayValue}
    </div>
  );
};

export default EditableCell;