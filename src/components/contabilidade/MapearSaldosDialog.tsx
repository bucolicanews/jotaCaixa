import React, { useState, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, AlertTriangle, CheckCircle2, Trash2 } from 'lucide-react';
import { PlanoContas } from '@/types/plano-contas';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { formatCurrency } from '@/utils/formatters';
import { cn } from '@/lib/utils';

interface OldSaldoData {
    id: string;
    nome: string;
    saldo_inicial: number;
    old_conta_contabil_id: string;
    old_conta_contabil_nome: string;
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
    const [mapping, setMapping] = useState<Record<string, string>>({});

    // Filtra somente contas analíticas e normaliza o ID para string
    const newContasAnaliticas = useMemo(() => {
        return newPlanoContas
            .filter(c => c.Analitica === 'Sim')
            .map(c => ({
                ...c,
                id: c.id?.toString() ?? "" // Garante que o ID é uma string válida
            }));
    }, [newPlanoContas]);

    const isMappingComplete = oldSaldos.every(s => mapping[s.id]);

    // Corrigido: Recebe o ID como string (val) e armazena no mapping
    const handleMapChange = useCallback((saldoContaId: string, newContaId: string) => {
        setMapping(prev => ({ ...prev, [saldoContaId]: newContaId }));
    }, []);

    const handleClearSelection = useCallback((saldoContaId: string) => {
        setMapping(prev => {
            const newMapping = { ...prev };
            delete newMapping[saldoContaId];
            return newMapping;
        });
    }, []);

    const handleClose = (forceClose: boolean = false) => {
        if (loading) return;

        if (!forceClose && !isMappingComplete) {
            const confirma = window.confirm(
                "O mapeamento não está completo. Se você fechar, a importação será cancelada. Deseja continuar?"
            );
            if (!confirma) return;
        }

        setMapping({});
        onOpenChange(false);
    };

    const handleConfirmImport = async () => {
        if (!isMappingComplete) {
            showError("Mapeie todas as contas antes de continuar.");
            return;
        }

        setLoading(true);

        try {
            // 1. Setar todas as FKs para NULL (para evitar a violação)
            await supabase.from('saldo_contas').update({ conta_contabil_id: null }).eq('proprietario_id', proprietarioId);
            await supabase.from('lancamentos').update({ conta_contabil_id: null }).eq('proprietario_id', proprietarioId);
            await supabase.from('configuracao_contas_receber').update({ conta_contabil_id: null }).eq('proprietario_id', proprietarioId);
            await supabase.from('configuracao_contas_pagar').update({ conta_contabil_id: null }).eq('proprietario_id', proprietarioId);
            await supabase.from('configuracoes_stripe').update({ conta_sintetica_id: null, conta_receber_id: null }).eq('proprietario_id', proprietarioId);

            // 2. Limpar contas existentes para o proprietário
            const { error: delErr } = await supabase
                .from('plano_contas')
                .delete()
                .eq('proprietario_id', proprietarioId);

            if (delErr) throw new Error("Erro ao limpar plano de contas: " + delErr.message);

            // 3. Inserir novos dados
            const { error: insertErr } = await supabase
                .from('plano_contas')
                .insert(newPlanoContas);

            if (insertErr) throw new Error("Erro ao inserir plano novo: " + insertErr.message);

            // 4. Atualizar as referências em saldo_contas
            const updatesSaldoContas = oldSaldos.map(s => ({
                id: s.id,
                conta_contabil_id: mapping[s.id]
            }));

            const { error: updateError } = await supabase
                .from('saldo_contas')
                .upsert(updatesSaldoContas, { onConflict: 'id' });

            if (updateError) throw new Error("Erro ao atualizar saldo_contas: " + updateError.message);

            showSuccess(`Plano importado e ${updatesSaldoContas.length} saldos remapeados!`);
            onSaveComplete();
            handleClose(true);

        } catch (e: any) {
            console.error(e);
            showError("Erro ao importar: " + e.message);
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
                        Existem {oldSaldos.length} contas de saldo vinculadas ao plano antigo. Faça o mapeamento para prosseguir.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="p-3 bg-blue-100 dark:bg-blue-900/20 border border-blue-500 rounded-md text-sm">
                        <p className="font-semibold">Instruções:</p>
                        <p>Selecione a conta analítica correspondente no novo Plano de Contas.</p>
                    </div>

                    <div className="overflow-x-auto border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[25%]">Conta de Saldo/Caixa</TableHead>
                                    <TableHead className="w-[25%]">Conta Antiga</TableHead>
                                    <TableHead className="w-[15%] text-right">Saldo Inicial</TableHead>
                                    <TableHead className="w-[35%]">Mapear para Nova Conta</TableHead>
                                </TableRow>
                            </TableHeader>

                            <TableBody>
                                {oldSaldos.map(saldo => {
                                    const isMapped = !!mapping[saldo.id];

                                    return (
                                        <TableRow key={saldo.id} className={cn(!isMapped && "bg-red-500/10")}>
                                            <TableCell>{saldo.nome}</TableCell>

                                            <TableCell className="text-sm text-muted-foreground">
                                                {saldo.old_conta_contabil_nome}
                                            </TableCell>

                                            <TableCell className="text-right font-semibold">
                                                {formatCurrency(saldo.saldo_inicial)}
                                            </TableCell>

                                            <TableCell>
                                                <div className="flex items-center space-x-2">

                                                    <Select
                                                        onValueChange={(id) => handleMapChange(saldo.id, id)}
                                                        value={mapping[saldo.id] ?? ""} // Garante que o valor é string ou ""
                                                        disabled={loading}
                                                    >
                                                        <SelectTrigger
                                                            className={cn("h-8 text-xs flex-1", !isMapped && "border-red-500")}
                                                        >
                                                            <SelectValue placeholder="Selecione a nova conta analítica" />
                                                        </SelectTrigger>

                                                        <SelectContent position="popper" side="bottom">
                                                            {newContasAnaliticas.map(c => (
                                                                <SelectItem
                                                                    key={`item-${c.id}-${c.Conta}`}
                                                                    value={c.id} // O valor já é string normalizada
                                                                >
                                                                    {c.Conta} - {c.Descricao}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>

                                                    {isMapped && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => handleClearSelection(saldo.id)}
                                                            className="h-8 w-8 text-red-500 hover:text-red-700"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    )}
                                                </div>
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
                        className={cn(!isMappingComplete && "bg-gray-400")}
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