import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ContaReceber } from '@/types/contas-receber';

interface RegistrarContaReceberDialogProps {
    contaInicial: ContaReceber | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSaveComplete: () => void;
}

const RegistrarContaReceberDialog: React.FC<RegistrarContaReceberDialogProps> = ({ contaInicial, open, onOpenChange, onSaveComplete }) => {
    // Implementação placeholder
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>{contaInicial ? 'Editar Conta a Receber' : 'Registrar Nova Conta a Receber'}</DialogTitle>
                </DialogHeader>
                <div className="py-4">
                    <p>Formulário de registro/edição de contas a receber será implementado aqui.</p>
                    <button onClick={onSaveComplete} className="mt-4 p-2 bg-blue-500 text-white rounded">
                        Salvar (Placeholder)
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default RegistrarContaReceberDialog;