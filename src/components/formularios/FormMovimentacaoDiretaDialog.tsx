import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import FormMovimentacaoDireta, { LancamentoPrimario } from './FormMovimentacaoDireta';

interface FormMovimentacaoDiretaDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    lancamentoInicial?: LancamentoPrimario | null;
    onSaveComplete: () => void;
}

const FormMovimentacaoDiretaDialog: React.FC<FormMovimentacaoDiretaDialogProps> = ({ open, onOpenChange, lancamentoInicial, onSaveComplete }) => {
    const isEditing = !!lancamentoInicial;
    
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px] max-h-[95vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{isEditing ? 'Editar' : 'Nova'} Movimentação Direta</DialogTitle>
                    <DialogDescription>
                        {isEditing ? 'Ajuste os valores e contas da movimentação.' : 'Registre entradas (reforço) ou saídas (sangria) de caixa/banco com partida dobrada.'}
                    </DialogDescription>
                </DialogHeader>
                <FormMovimentacaoDireta
                    lancamentoInicial={lancamentoInicial}
                    onSaveComplete={onSaveComplete}
                />
            </DialogContent>
        </Dialog>
    );
};

export default FormMovimentacaoDiretaDialog;