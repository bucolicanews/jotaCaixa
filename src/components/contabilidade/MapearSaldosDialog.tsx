import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { PlanoContas } from '@/types/plano-contas';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { formatCurrency } from '@/utils/formatters';
import { cn } from '@/lib/utils';

interface OldSaldoData {
    id: string; // saldo_contas.id
    nome: string; // saldo_contas.nome
    saldo_inicial: number;
    old_conta_contabil_id: string;
    old_conta_contabil_nome: string; // PlanoContas.Descricao
}

interface MapearSaldosDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    oldSaldos: OldSaldoData[];
    newPlanoContas: PlanoContas[];
    proprietarioId: string;
    onSaveComplete: () => void;
}

const MapearSaldosDialog: React.FC<MapearSaldosDialogProps> = ({
    open,
    onOpenChange,
    oldSaldos,
    newPlanoContas,
    proprietarioId,
    onSaveComplete,
}) => {
    const [loading, setLoading] = useState(false);
    const [mapping, setMapping] = useState<Record<string, string>>({}); // { old_conta_id: new_conta_id }
    
    // Mapeia apenas as novas contas analíticas que podem ser de saldo/patrimonial
    const newContasAnaliticas = useMemo(() => {
        return newPlanoContas.filter(c => c.Analitica === 'Sim');
    }, [newPlanoContas]);

    // Verifica se todas as contas antigas foram mapeadas
    const isMappingComplete = oldSaldos.every(s => mapping[s.old_conta_contabil_id]);

    const handleMapChange = (oldContaId: string, newContaId: string) => {
        setMapping(prev => ({ ...prev, [oldContaId]: newContaId }));
    };
    
    const handleClose = (forceClose: boolean = false) => {
        if (loading) return;
        if (!forceClose && !isMappingComplete) {
            if (!window.confirm('O mapeamento não está completo. Se você fechar, a importação será cancelada. Deseja continuar?')) {
                return;
            }
        }
        setMapping({});
        onOpenChange(false);
    };

    const handleConfirmImport = async () => {
        if (!isMappingComplete) {
            showError('Mapeie todas as contas de saldo antes de prosseguir.');
            return;
        }
        
        setLoading(true);
        
        try {
            // 1. Setar todas as FKs para NULL (para evitar a violação)
            // Nota: Fazemos isso antes de deletar o plano de contas antigo.
            await supabase.from('saldo_contas').update({ conta_contabil_id: null }).eq('proprietario_id', proprietarioId);
            await supabase.from('lancamentos').update({ conta_contabil_id: null }).eq('proprietario_id', proprietarioId);
            await supabase.from('configuracao_contas_receber').update({ conta_contabil_id: null }).eq('proprietario_id', proprietarioId);
            await supabase.from('configuracao_contas_pagar').update({ conta_contabil_id: null }).eq('proprietario_id', proprietarioId);
            await supabase.from('configuracoes_stripe').update({ conta_sintetica_id: null, conta_receber_id: null }).eq('proprietario_id', proprietarioId);
            
            // 2. Limpar contas existentes para o proprietário
            const { error: deleteError } = await supabase
                .from('plano_contas')
                .delete()
                .eq('proprietario_id', proprietarioId);

            if (deleteError) {
                // Se a exclusão falhar aqui, é um erro crítico (provavelmente uma FK que esquecemos)
                throw new Error('Erro crítico ao limpar plano de contas antigo: ' + deleteError.message);
            }

            // 3. Inserir novos dados
            const { error: insertError, data: insertedContas } = await supabase
                .from('plano_contas')
                .insert(newPlanoContas)
                .select('id, Conta');

            if (insertError) {
                throw new Error('Erro ao inserir novo plano de contas: ' + insertError.message);
            }
            
            // 4. Mapear IDs antigos para novos IDs
            const newContaMap = (insertedContas as PlanoContas[]).reduce((acc, c) => {
                acc[c.Conta] = c.id;
                return acc;
            }, {} as Record<string, string>);
            
            // 5. Atualizar as referências em saldo_contas
            const updatesSaldoContas = oldSaldos.map(s => {
                const newContaId = mapping[s.old_conta_contabil_id];
                const newConta = newPlanoContas.find(c => c.id === newContaId);
                
                if (!newConta) {
                    console.error(`Nova conta ID ${newContaId} não encontrada no novo plano.`);
                    return null;
                }
                
                const newContaContabilId = newContaMap[newConta.Conta];
                
                if (!newContaContabilId) {
                    console.error(`Novo código de conta ${newConta.Conta} não encontrado após inserção.`);
                    return null;
                }
                
                return {
                    id: s.id,
                    conta_contabil_id: newContaContabilId,
                };
            }).filter(u => u !== null);
            
            if (updatesSaldoContas.length > 0) {
                const { error: updateError } = await supabase
                    .from('saldo_contas')
                    .upsert(updatesSaldoContas, { onConflict: 'id' });
                    
                if (updateError) {
                    throw new Error('Erro ao atualizar referências em saldo_contas: ' + updateError.message);
                }
            }

            showSuccess(`Plano de Contas importado e ${updatesSaldoContas.length} saldos remapeados com sucesso!`);
            onSaveComplete();
            handleClose(true);

        } catch (error: any) {
            console.error('Erro na transação de importação:', error);
            showError('Falha na importação e remapeamento: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-4xl max-h-[95vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center text-red-600">
                        <AlertTriangle className="w-6 h-6 mr-2" /> Mapeamento de Saldos Necessário
                    </DialogTitle>
                    <DialogDescription>
                        Existem {oldSaldos.length} contas de Saldo/Caixa vinculadas ao Plano de Contas antigo. Você deve mapeá-las para as contas correspondentes no novo Plano de Contas.
                    </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4">
                    <div className="p-3 bg-blue-100 dark:bg-blue-900/20 border border-blue-500 rounded-md text-sm">
                        <p className="font-semibold">Instruções:</p>
                        <p>Selecione a conta analítica do NOVO Plano de Contas que corresponde à conta antiga.</p>
                    </div>
                    
                    <div className="overflow-x-auto border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[25%]">Conta de Saldo/Caixa</TableHead>
                                    <TableHead className="w-[25%]">Conta Contábil Antiga</TableHead>
                                    <TableHead className="w-[15%] text-right">Saldo Inicial</TableHead>
                                    <TableHead className="w-[35%]">Mapear para Nova Conta Analítica</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {oldSaldos.map((saldo) => {
                                    const isMapped = !!mapping[saldo.old_conta_contabil_id];
                                    
                                    return (
                                        <TableRow key={saldo.id} className={cn(!isMapped && 'bg-red-500/10')}>
                                            <TableCell className="font-medium">{saldo.nome}</TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {saldo.old_conta_contabil_nome}
                                            </TableCell>
                                            <TableCell className="text-right font-semibold">
                                                {formatCurrency(saldo.saldo_inicial)}
                                            </TableCell>
                                            <TableCell>
                                                <Select 
                                                    onValueChange={(newContaId) => handleMapChange(saldo.old_conta_contabil_id, newContaId)}
                                                    value={mapping[saldo.old_conta_contabil_id] || undefined}
                                                    disabled={loading}
                                                >
                                                    <SelectTrigger className={cn("h-8 text-xs", !isMapped && 'border-red-500')}>
                                                        <SelectValue placeholder="Selecione a nova conta analítica" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {newContasAnaliticas.map(c => (
                                                            <SelectItem key={c.id} value={c.id}>
                                                                {c.Conta} - {c.Descricao}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </div>

                <div className="flex justify-between pt-4 border-t">
                    <Button onClick={() => handleClose(true)} variant="secondary" disabled={loading}>
                        Cancelar Importação
                    </Button>
                    <Button 
                        onClick={handleConfirmImport} 
                        disabled={loading || !isMappingComplete}
                        className={cn(!isMappingComplete && 'bg-gray-400')}
                    >
                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                        Confirmar Mapeamento e Importar
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default MapearSaldosDialog;