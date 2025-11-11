import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Link as LinkIcon, CheckCircle2, AlertTriangle } from 'lucide-react';
import { SaldoContaDetalhada } from '@/types/saldo-conta';
import { PlanoContas } from '@/types/plano-contas';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { cn } from '@/lib/utils';

interface MapeamentoRapidoSaldoContasDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    contasSaldo: SaldoContaDetalhada[];
    contasContabeis: PlanoContas[];
    proprietarioId: string;
    onSaveComplete: () => void;
}

interface MapeamentoItem {
    id: string;
    nome: string;
    contaContabilAtual: string | null;
    tipoSaldo: string;
    newContaContabilId: string | null;
    isDirty: boolean;
}

const MapeamentoRapidoSaldoContasDialog: React.FC<MapeamentoRapidoSaldoContasDialogProps> = ({
    open,
    onOpenChange,
    contasSaldo,
    contasContabeis,
    onSaveComplete,
}) => {
    const [mapeamento, setMapeamento] = useState<MapeamentoItem[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Filtra contas que precisam de mapeamento (conta_contabil_id é NULL)
    const contasPendentes = useMemo(() => {
        return contasSaldo.filter(c => !c.conta_contabil_id);
    }, [contasSaldo]);

    // Filtra as contas contábeis disponíveis para o mapeamento (apenas as marcadas como Caixa/Banco)
    const contasContabeisFiltradas = useMemo(() => {
        return contasContabeis.filter(c => c.is_conta_caixa_banco);
    }, [contasContabeis]);

    // Inicializa o estado de mapeamento
    useEffect(() => {
        if (open) {
            const initialMap: MapeamentoItem[] = contasPendentes.map(c => ({
                id: c.id,
                nome: c.nome,
                contaContabilAtual: c.plano_contas?.Conta || null,
                tipoSaldo: c.tipo_saldo,
                newContaContabilId: null,
                isDirty: false,
            }));
            setMapeamento(initialMap);
        }
    }, [open, contasPendentes]);

    const handleSelectChange = (id: string, newContaId: string) => {
        setMapeamento(prev => prev.map(item => 
            item.id === id 
                ? { ...item, newContaContabilId: newContaId, isDirty: true } 
                : item
        ));
    };
    
    const handleSaveAll = async () => {
        const updates = mapeamento
            .filter(item => item.isDirty && item.newContaContabilId)
            .map(item => ({
                id: item.id,
                conta_contabil_id: item.newContaContabilId,
                atualizado_em: new Date().toISOString(),
            }));

        if (updates.length === 0) {
            showError('Nenhuma alteração para salvar.');
            return;
        }

        setIsSubmitting(true);
        
        try {
            const { error } = await supabase
                .from('saldo_contas')
                .upsert(updates, { onConflict: 'id' });

            if (error) throw error;

            showSuccess(`${updates.length} contas mapeadas com sucesso!`);
            onSaveComplete();
            onOpenChange(false);
        } catch (error: any) {
            showError('Falha ao salvar mapeamento: ' + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const isReadyToSave = mapeamento.some(item => item.isDirty && item.newContaContabilId);
    
    const hasContasContabeisDisponiveis = contasContabeisFiltradas.length > 0;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center">
                        <LinkIcon className="w-5 h-5 mr-2" /> Mapeamento Rápido de Contas Contábeis
                    </DialogTitle>
                    <DialogDescription>
                        Associe as contas de saldo/caixa que perderam o vínculo com o Plano de Contas.
                    </DialogDescription>
                </DialogHeader>
                
                {contasPendentes.length === 0 ? (
                    <div className="p-6 text-center text-green-600">
                        <CheckCircle2 className="w-8 h-8 mx-auto mb-2" />
                        Todas as contas de saldo estão mapeadas!
                    </div>
                ) : (
                    <>
                        {!hasContasContabeisDisponiveis && (
                            <div className="p-3 bg-red-100 dark:bg-red-900/20 border border-red-500 rounded-md text-sm text-red-700 dark:text-red-300 flex items-start">
                                <AlertTriangle className="w-5 h-5 mr-2 flex-shrink-0" />
                                <p>Nenhuma conta contábil analítica está marcada como "Conta Caixa/Banco" no seu Plano de Contas. Marque as contas em <a href="/plano-contas" className="underline font-semibold">Plano de Contas</a> para poder mapear.</p>
                            </div>
                        )}
                        
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[200px]">Conta de Saldo</TableHead>
                                        <TableHead className="w-[100px]">Natureza</TableHead>
                                        <TableHead>Conta Contábil de Destino</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {mapeamento.map((item) => (
                                        <TableRow key={item.id} className={cn(item.isDirty && 'bg-yellow-500/10')}>
                                            <TableCell className="font-medium">{item.nome}</TableCell>
                                            <TableCell className="text-sm">{item.tipoSaldo}</TableCell>
                                            <TableCell>
                                                <Select 
                                                    onValueChange={(newId) => handleSelectChange(item.id, newId)}
                                                    value={item.newContaContabilId || undefined}
                                                    disabled={isSubmitting || !hasContasContabeisDisponiveis}
                                                >
                                                    <SelectTrigger className={cn(!item.newContaContabilId && 'border-red-500')}>
                                                        <SelectValue placeholder="Selecione a conta analítica (Caixa/Banco)" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {contasContabeisFiltradas.map(c => (
                                                            <SelectItem key={c.id} value={c.id}>
                                                                {c.Conta} - {c.Descricao}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        
                        <div className="flex justify-end space-x-2 pt-4 border-t">
                            <Button onClick={() => onOpenChange(false)} variant="secondary" disabled={isSubmitting}>
                                Fechar
                            </Button>
                            <Button 
                                onClick={handleSaveAll} 
                                disabled={isSubmitting || !isReadyToSave || !hasContasContabeisDisponiveis}
                            >
                                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                                Salvar Mapeamentos
                            </Button>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
};

export default MapeamentoRapidoSaldoContasDialog;