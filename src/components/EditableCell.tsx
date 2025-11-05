import React, { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { PlanoContas } from '@/types/plano-contas';

interface EditableCellProps {
  id: string; // ID da conta
  initialValue: string | number | null | undefined;
  fieldName: keyof PlanoContas; // Nome do campo a ser atualizado (Conta, Descricao, codigo_reduzido)
  onSaveSuccess: () => void;
  className?: string;
  isEditable: boolean; // Se a célula pode ser editada (ex: Conta e Analitica não devem ser editáveis)
}

const EditableCell: React.FC<EditableCellProps> = ({
  id,
  initialValue,
  fieldName,
  onSaveSuccess,
  className,
  isEditable,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(String(initialValue || ''));
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Foca no input quando o modo de edição é ativado
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleSave = async () => {
    if (!isEditable || loading) return;
    
    const trimmedValue = value.trim();
    
    // Se o valor não mudou, apenas sai do modo de edição
    if (trimmedValue === String(initialValue || '')) {
        setIsEditing(false);
        return;
    }
    
    if (fieldName === 'Descricao' && trimmedValue.length < 1) {
        showError('A descrição não pode ser vazia.');
        return;
    }

    setLoading(true);
    
    const payload = {
        [fieldName]: trimmedValue || null, // Salva como null se estiver vazio (para campos opcionais)
        updated_at: new Date().toISOString(), // Atualiza o timestamp
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setValue(String(initialValue || ''));
      setIsEditing(false);
    }
  };
  
  const displayValue = String(initialValue || '-');

  if (isEditing) {
    return (
      <div className="flex items-center space-x-1">
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={handleSave} // Salva ao perder o foco
          onKeyDown={handleKeyDown}
          className="h-8 p-2 text-sm flex-1 min-w-[100px]"
          disabled={loading}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleSave}
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
            setValue(String(initialValue || ''));
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