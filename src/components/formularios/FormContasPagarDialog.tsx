import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ContaPagarComProgresso } from '@/types/contas-pagar';
import FormContasPagar from './FormContasPagar';

interface FormContasPagarDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    contaInicial: ContaPagarComProgresso | null;
    onSaveComplete: () => void;
}

const FormContasPagarDialog: React.FC<FormContasPagarDialogProps> = ({ open, onOpenChange, contaInicial, onSaveComplete }) => {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl max-h-[95vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{contaInicial ? 'Editar' : 'Novo'} Lançamento a Pagar</DialogTitle>
                </DialogHeader>
                <FormContasPagar
                    contaInicial={contaInicial}
                    onSaveComplete={onSaveComplete}
                />
            </DialogContent>
        </Dialog>
    );
};

export default FormContasPagarDialog;