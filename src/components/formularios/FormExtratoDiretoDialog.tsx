import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import FormExtratoDireto from './FormExtratoDireto';

interface FormExtratoDiretoDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSaveComplete: () => void;
}

const FormExtratoDiretoDialog: React.FC<FormExtratoDiretoDialogProps> = ({ open, onOpenChange, onSaveComplete }) => {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px] max-h-[95vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Nova Movimentação de Extrato</DialogTitle>
                    <DialogDescription>
                        Registre uma entrada ou saída diretamente no extrato bancário com partida dobrada automática.
                    </DialogDescription>
                </DialogHeader>
                <FormExtratoDireto
                    onSaveComplete={onSaveComplete}
                />
            </DialogContent>
        </Dialog>
    );
};

export default FormExtratoDiretoDialog;