import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { PlanoContas } from '@/types/plano-contas';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface MapeamentoManualPlanoContasDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    contaParaDeletar: PlanoContas | null;
    contasDisponiveis: PlanoContas[];
    onSubmit: (newContaId: string | null) => Promise<void>;
    isSubmitting: boolean;
}

const MapeamentoManualPlanoContasDialog: React.FC<MapeamentoManualPlanoContasDialogProps> = ({
    open,
    onOpenChange,
    contaParaDeletar,
    contasDisponiveis,
    onSubmit,
    isSubmitting,
}) => {
    const [newContaId, setNewContaId] = useState<string | null>(null);
    
    useEffect(() => {
        if (open) {
            setNewContaId(null);
        }
    }, [open]);

    const handleSelectChange = (id: string) => {
        // Se o valor for 'null' string, converte para null
        setNewContaId(id === 'null' ? null : id);
    };
    
    const handleConfirm = () => {
        onSubmit(newContaId);
    };
    
    // O usuário deve selecionar uma conta OU selecionar NULL
    const isReadyToSubmit = newContaId !== null || newContaId === null;

    if (!contaParaDeletar) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Mapeamento Obrigatório</DialogTitle>
                    <DialogDescription>
                        A conta <span className="font-mono font-bold text-red-600">{contaParaDeletar.Conta}</span> está em uso e não pode ser deletada diretamente.
                    </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-4">
                    <div className="p-3 bg-red-100 dark:bg-red-900/20 border border-red-500 rounded-md text-sm text-red-700 dark:text-red-300 flex items-start">
                        <AlertTriangle className="w-5 h-5 mr-2 flex-shrink-0" />
                        <p>Selecione uma nova conta contábil para transferir todas as referências (saldos, lançamentos e configurações) antes de deletar.</p>
                    </div>
                    
                    <h4 className="font-semibold">Conta a ser Deletada:</h4>
                    <p className="font-mono text-sm">{contaParaDeletar.Conta} - {contaParaDeletar.Descricao}</p>
                    
                    <h4 className="font-semibold pt-2 border-t">Mapear Referências para:</h4>
                    <Select onValueChange={handleSelectChange} value={newContaId || 'null'} disabled={isSubmitting}>
                        <SelectTrigger className={cn(newContaId === null && 'border-red-500')}>
                            <SelectValue placeholder="Selecione a conta de destino" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="null">
                                <span className="text-red-500">NENHUM (Setar referências para NULL)</span>
                            </SelectItem>
                            {contasDisponiveis.map(c => (
                                <SelectItem key={c.id} value={c.id}>
                                    {c.Conta} - {c.Descricao}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <Button 
                    onClick={handleConfirm} 
                    disabled={isSubmitting || !isReadyToSubmit}
                    className="w-full"
                >
                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                    Confirmar Mapeamento e Deletar
                </Button>
            </DialogContent>
        </Dialog>
    );
};

export default MapeamentoManualPlanoContasDialog;