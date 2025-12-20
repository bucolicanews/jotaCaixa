import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import FormPlanoContas from './FormPlanoContas';
import { PlanoContas } from '@/types/plano-contas';

interface FormPlanoContasDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    contaInicial?: Partial<PlanoContas> | null;
    proprietarioId: string;
    onSaveComplete: () => void;
}

const FormPlanoContasDialog: React.FC<FormPlanoContasDialogProps> = ({ open, onOpenChange, contaInicial, proprietarioId, onSaveComplete }) => {
    const isEditing = !!contaInicial?.id;
    
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px] max-h-[95vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{isEditing ? 'Editar Conta' : 'Nova Conta'}</DialogTitle>
                </DialogHeader>
                <FormPlanoContas 
                    proprietarioId={proprietarioId}
                    contaInicial={contaInicial}
                    onSaveComplete={onSaveComplete}
                />
            </DialogContent>
        </Dialog>
    );
};

export default FormPlanoContasDialog;