import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import FormLancamentoGeral, { LancamentoGeral } from './FormLancamentoGeral';

interface FormLancamentoGeralDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    lancamentoInicial: LancamentoGeral;
    onSaveComplete: () => void;
}

const FormLancamentoGeralDialog: React.FC<FormLancamentoGeralDialogProps> = ({ open, onOpenChange, lancamentoInicial, onSaveComplete }) => {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px] max-h-[95vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Editar Lançamento</DialogTitle>
                </DialogHeader>
                <FormLancamentoGeral
                    lancamentoInicial={lancamentoInicial}
                    onSaveComplete={onSaveComplete}
                />
            </DialogContent>
        </Dialog>
    );
};

export default FormLancamentoGeralDialog;