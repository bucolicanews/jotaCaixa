import React, { useState, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, AlertTriangle, CheckCircle2, Trash2, FileSignature } from 'lucide-react';
import { PlanoContas } from '@/types/plano-contas';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { formatCurrency } from '@/utils/formatters';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';

interface OldFKData {
    id: string;
    record_id: string;
    nome: string;
    tabela:
      | 'saldo_contas'
      | 'config_cr'
      | 'config_cp'
      | 'config_stripe_sintetica'
      | 'config_stripe_receber'
      | 'config_contrato_ativo'
      | 'config_contrato_receita'
      | 'lancamentos_conta'
      | 'lancamentos_resultado';
    old_conta_contabil_id: string;
    old_conta_contabil_nome: string;
    saldo_inicial?: number;
    tipo_registro?: string;
    is_conta_caixa_banco?: boolean;
    is_conta_patrimonial?: boolean;
    is_conta_resultado?: boolean;
}

interface MapearTodasFKsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    oldFKs: OldFKData[];
    newPlanoContas: PlanoContas[];
    proprietarioId: string;
    onSaveComplete: () => void;
}

const MapearTodasFKsDialog: React.FC<MapearTodasFKsDialogProps> = ({
    open,
    onOpenChange,
    oldFKs,
    newPlanoContas,
    proprietarioId,
    onSaveComplete,
}) => {
    const [loading, setLoading] = useState(false);
    const [mapping, setMapping] = useState<Record<string, string>>({});

    const newContasAnaliticas = useMemo(() => {
        return newPlanoContas
            .filter(c => c.Analitica === 'Sim')
            .map(c => ({ id: c.id, Conta: c.Conta, Descricao: c.Descricao }));
    }, [newPlanoContas]);

    const grupos = useMemo(() => {
        return oldFKs.reduce((acc, item) => {
            acc[item.tabela] = acc[item.tabela] || [];
            acc[item.tabela].push(item);
            return acc;
        }, {} as Record<string, OldFKData[]>);
    }, [oldFKs]);

    const stripeCount = (grupos.config_stripe_sintetica?.length || 0) + (grupos.config_stripe_receber?.length || 0);
    const contratoCount = (grupos.config_contrato_ativo?.length || 0) + (grupos.config_contrato_receita?.length || 0);
    const lancamentosCount = (grupos.lancamentos_conta?.length || 0) + (grupos.lancamentos_resultado?.length || 0);

    const isMappingComplete = oldFKs.every(s => mapping[s.id] && mapping[s.id].length > 0);

    const handleMapChange = useCallback((fkId: string, newContaCodigo: string) => {
        setMapping(prev => ({ ...prev, [fkId]: newContaCodigo }));
    }, []);

    const handleConfirmImport = async () => {
        if (!isMappingComplete) return;
        setLoading(true);

        try {
            // 1. Inserir o novo Plano e limpar referências antigas (Edge Function)
            const { data: manageRes, error: manageErr } = await supabase.functions.invoke('manage-plano-contas', {
                body: { proprietarioId, newPlanoContas },
            });
            
            if (manageErr || manageRes?.error) throw new Error(manageErr?.message || manageRes?.error);
            
            const mappingWithRealIds = manageRes.contaIdMap.reduce((acc: any, c: any) => {
                acc[c.Conta] = c.id;
                return acc;
            }, {});

            // 2. Preparar Payloads para Restauração
            const updatesSaldoContas: any[] = [];
            const updatesConfigCR: any[] = [];
            const updatesConfigCP: any[] = [];
            const updatesConfigStripe: any[] = [];
            const updatesConfigContrato: any[] = [];
            const updatesLancamentos: any[] = [];
            const updatesPlanoContasBooleans: any[] = [];

            oldFKs.forEach(fk => {
                const newContaCodigo = mapping[fk.id];
                const newContaId = mappingWithRealIds[newContaCodigo];
                if (!newContaId) return;

                // Salva marcações booleanas
                const bools: any = { id: newContaId };
                if (fk.is_conta_caixa_banco) bools.is_conta_caixa_banco = true;
                if (fk.is_conta_patrimonial) bools.is_conta_patrimonial = true;
                if (fk.is_conta_resultado) bools.is_conta_resultado = true;
                if (Object.keys(bools).length > 1) updatesPlanoContasBooleans.push(bools);

                // Mapeia por tabela
                if (fk.tabela === 'saldo_contas') updatesSaldoContas.push({ id: fk.record_id, conta_contabil_id: newContaId });
                else if (fk.tabela === 'config_cr') updatesConfigCR.push({ id: fk.record_id, conta_contabil_id: newContaId });
                else if (fk.tabela === 'config_cp') updatesConfigCP.push({ id: fk.record_id, conta_contabil_id: newContaId });
                else if (fk.tabela === 'config_stripe_sintetica') updatesConfigStripe.push({ id: fk.record_id, conta_sintetica_id: newContaId });
                else if (fk.tabela === 'config_stripe_receber') updatesConfigStripe.push({ id: fk.record_id, conta_receber_id: newContaId });
                else if (fk.tabela === 'config_contrato_ativo') updatesConfigContrato.push({ id: fk.record_id, id_conta_clientes_receber: newContaId });
                else if (fk.tabela === 'config_contrato_receita') updatesConfigContrato.push({ id: fk.record_id, id_conta_receita_contrato: newContaId });
                else if (fk.tabela === 'lancamentos_conta') updatesLancamentos.push({ field: 'conta_contabil_id', old_conta_contabil_id: fk.old_conta_contabil_id, new_conta_contabil_id: newContaId });
                else if (fk.tabela === 'lancamentos_resultado') updatesLancamentos.push({ field: 'conta_resultado_id', old_conta_contabil_id: fk.old_conta_contabil_id, new_conta_contabil_id: newContaId });
            });

            // 3. Executar Atualizações Finais (Edge Function)
            const { error: finalError } = await supabase.functions.invoke('update-plano-contas-fks', {
                body: { 
                    proprietarioId, 
                    updatesSaldoContas, 
                    updatesConfigCR, 
                    updatesConfigCP, 
                    updatesConfigStripe, 
                    updatesConfigContrato, 
                    updatesLancamentos, 
                    updatesPlanoContasBooleans 
                },
            });
            
            if (finalError) throw finalError;

            showSuccess(`Plano importado e referências restauradas com sucesso!`);
            onSaveComplete();
            onOpenChange(false);
        } catch (e: any) {
            showError("Falha na migração: " + e.message);
        } finally {
            setLoading(false);
        }
    };
    
    const renderTable = (title: string, data: OldFKData[], keyField: 'saldo_inicial' | 'tipo_registro' = 'saldo_inicial') => (
        <div className="overflow-x-auto border rounded-md mb-4">
            <h4 className="font-semibold p-3 bg-secondary text-sm">{title}</h4>
            <Table>
                <TableHeader><TableRow><TableHead>Vínculo</TableHead><TableHead>Conta Antiga</TableHead><TableHead className="text-right">{keyField === 'saldo_inicial' ? 'Saldo' : 'Identificador'}</TableHead><TableHead>Mapear Nova Conta</TableHead></TableRow></TableHeader>
                <TableBody>
                    {data.map(fk => (
                        <TableRow key={fk.id} className={cn(!mapping[fk.id] && "bg-red-500/5")}>
                            <TableCell className="text-xs font-medium">{fk.nome}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{fk.old_conta_contabil_nome}</TableCell>
                            <TableCell className="text-right text-xs font-mono">{keyField === 'saldo_inicial' ? formatCurrency(fk.saldo_inicial ?? 0) : fk.tipo_registro || '-'}</TableCell>
                            <TableCell>
                                <Select onValueChange={(v) => handleMapChange(fk.id, v)} value={mapping[fk.id] || ""}>
                                    <SelectTrigger className="h-8 text-[10px] min-w-[150px]"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                                    <SelectContent position="popper">
                                        {newContasAnaliticas.map(c => <SelectItem key={c.Conta} value={c.Conta} className="text-xs">{c.Conta} - {c.Descricao}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[95vw] max-h-[95vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-red-600"><AlertTriangle /> Mapeamento Necessário</DialogTitle>
                    <DialogDescription>As contas analíticas mudaram. Selecione as novas contas equivalentes para não perder dados de faturamento e históricos.</DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="saldo_contas" className="flex-1 flex flex-col overflow-hidden">
                    <div className="w-full overflow-x-auto bg-muted rounded-md p-1 mb-2 scrollbar-hide">
                        <TabsList className="flex w-max sm:w-full h-9">
                            <TabsTrigger value="saldo_contas" className="text-xs">Saldos ({grupos.saldo_contas?.length || 0})</TabsTrigger>
                            <TabsTrigger value="configs_cr" className="text-xs">CR ({grupos.config_cr?.length || 0})</TabsTrigger>
                            <TabsTrigger value="configs_cp" className="text-xs">CP ({grupos.config_cp?.length || 0})</TabsTrigger>
                            {contratoCount > 0 && <TabsTrigger value="configs_contrato" className="text-xs flex gap-1"><FileSignature className="h-3 w-3"/>Contratos ({contratoCount})</TabsTrigger>}
                            {stripeCount > 0 && <TabsTrigger value="configs_stripe" className="text-xs">Stripe ({stripeCount})</TabsTrigger>}
                            {lancamentosCount > 0 && <TabsTrigger value="lancamentos" className="text-xs">Lançamentos ({lancamentosCount})</TabsTrigger>}
                        </TabsList>
                    </div>
                    
                    <ScrollArea className="flex-1">
                        <TabsContent value="saldo_contas">{renderTable("Saldos de Caixa/Banco", grupos.saldo_contas || [])}</TabsContent>
                        <TabsContent value="configs_cr">{renderTable("Configurações de Receber", grupos.config_cr || [], 'tipo_registro')}</TabsContent>
                        <TabsContent value="configs_cp">{renderTable("Configurações de Pagar", grupos.config_cp || [], 'tipo_registro')}</TabsContent>
                        <TabsContent value="configs_contrato">
                            {grupos.config_contrato_ativo && renderTable("Contrato: Clientes a Receber", grupos.config_contrato_ativo, 'tipo_registro')}
                            {grupos.config_contrato_receita && renderTable("Contrato: Receita", grupos.config_contrato_receita, 'tipo_registro')}
                        </TabsContent>
                        <TabsContent value="configs_stripe">
                            {renderTable("Stripe (Sintética)", grupos.config_stripe_sintetica || [], 'tipo_registro')}
                            {renderTable("Stripe (Parcelas)", grupos.config_stripe_receber || [], 'tipo_registro')}
                        </TabsContent>
                        <TabsContent value="lancamentos">
                            {renderTable("Movimentações Históricas", [...(grupos.lancamentos_conta || []), ...(grupos.lancamentos_resultado || [])], 'tipo_registro')}
                        </TabsContent>
                    </ScrollArea>
                </Tabs>

                <div className="flex justify-between pt-4 border-t">
                    <Button onClick={() => onOpenChange(false)} variant="secondary" disabled={loading}>Cancelar</Button>
                    <Button onClick={handleConfirmImport} disabled={loading || !isMappingComplete}>
                        {loading ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                        Confirmar Migração de Dados
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default MapearTodasFKsDialog;