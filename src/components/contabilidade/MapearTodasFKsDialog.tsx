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

// Tipos de dados que precisam de remapeamento
interface OldFKData {
    id: string;
    record_id: string;
    nome: string; // Nome da conta/config
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
    saldo_inicial?: number; // Apenas para saldo_contas
    tipo_registro?: string; // Apenas para configs CR/CP
    
    // Campos booleanos da conta antiga (para herança) - CORREÇÃO TS2353
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
    // Mapeamento: { fkId: 'Conta.Codigo.Novo' }
    const [mapping, setMapping] = useState<Record<string, string>>({});

    // Filtra contas analíticas para o Select
    const newContasAnaliticas = useMemo(() => {
        return newPlanoContas
            .filter(c => c.Analitica === 'Sim')
            .map(c => ({
                Conta: c.Conta,
                Descricao: c.Descricao,
            }));
    }, [newPlanoContas]);

    // Agrupamento por tabela
    const grupos = useMemo(() => {
        return oldFKs.reduce((acc, item) => {
            const key = item.tabela;
            acc[key] = acc[key] || [];
            acc[key].push(item);
            return acc;
        }, {} as Record<OldFKData['tabela'], OldFKData[]>);
    }, [oldFKs]);

    const stripeCount =
        (grupos.config_stripe_sintetica?.length || 0) +
        (grupos.config_stripe_receber?.length || 0);

    const contratoCount =
        (grupos.config_contrato_ativo?.length || 0) +
        (grupos.config_contrato_receita?.length || 0);
        
    const lancamentosCount =
        (grupos.lancamentos_conta?.length || 0) +
        (grupos.lancamentos_resultado?.length || 0);

    const tabsCount = 4 + (stripeCount > 0 ? 1 : 0) + (lancamentosCount > 0 ? 1 : 0);
    const tabsGridColsClass =
        tabsCount === 4 ? "grid-cols-4" : tabsCount === 5 ? "grid-cols-5" : "grid-cols-6";

    const isMappingComplete = oldFKs.every(s => mapping[s.id] && mapping[s.id].length > 0);

    const handleMapChange = useCallback((fkId: string, newContaCodigo: string) => {
        setMapping(prev => ({ ...prev, [fkId]: newContaCodigo }));
    }, []);

    const handleClearSelection = useCallback((fkId: string) => {
        setMapping(prev => {
            const newMapping = { ...prev };
            delete newMapping[fkId];
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
            showError("Mapeie todas as referências antes de continuar.");
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
            await supabase.from('configuracao_contratos').update({ id_conta_clientes_receber: null, id_conta_receita_contrato: null }).eq('proprietario_id', proprietarioId); // NOVO: Contratos

            // 2. Chamar Edge Function para Excluir/Inserir o Plano de Contas
            const { data, error: invokeError } = await supabase.functions.invoke('manage-plano-contas', {
                body: { proprietarioId, newPlanoContas },
            });
            
            if (invokeError) throw invokeError;
            if (data?.error) throw new Error(data.error);
            
            // O Edge Function retorna o mapa de IDs do novo plano
            const contasInseridas = data.contaIdMap as { id: string, Conta: string }[];
            const contaIdMap = contasInseridas.reduce((acc, c) => {
                acc[c.Conta] = c.id;
                return acc;
            }, {} as Record<string, string>);

            // 3. Atualizar as referências em TODAS as tabelas e marcar os campos booleanos
            
            const updatesSaldoContas: any[] = [];
            const updatesConfigCR: any[] = [];
            const updatesConfigCP: any[] = [];
            const updatesConfigStripe: any[] = [];
            const updatesLancamentos: any[] = [];
            
            const configContratoMap: Record<string, any> = {};
            
            // Mapa para rastrear os booleanos que devem ser marcados na nova tabela PlanoContas
            const newContaBooleansMap: Record<string, Partial<PlanoContas>> = {};

            oldFKs.forEach(fk => {
                const newContaCodigo = mapping[fk.id];
                const newContaId = contaIdMap[newContaCodigo];
                
                if (!newContaId) return;

                // Inicializa o payload de booleanos para a nova conta, se ainda não existir
                newContaBooleansMap[newContaId] = newContaBooleansMap[newContaId] || { id: newContaId };

                // 3.1. Coletar atualizações de FK
                if (fk.tabela === 'saldo_contas') {
                    updatesSaldoContas.push({ id: fk.id, conta_contabil_id: newContaId });
                    
                    // Herança de booleanos (Caixa/Banco ou Patrimonial)
                    if (fk.is_conta_caixa_banco) newContaBooleansMap[newContaId].is_conta_caixa_banco = true;
                    if (fk.is_conta_patrimonial) newContaBooleansMap[newContaId].is_conta_patrimonial = true;
                    
                } else if (fk.tabela === 'config_cr') {
                    updatesConfigCR.push({ id: fk.id, conta_contabil_id: newContaId });
                    
                    // Herança de booleano (Resultado)
                    if (fk.is_conta_resultado) newContaBooleansMap[newContaId].is_conta_resultado = true;
                    
                } else if (fk.tabela === 'config_cp') {
                    updatesConfigCP.push({ id: fk.id, conta_contabil_id: newContaId });
                    
                    // Herança de booleano (Resultado)
                    if (fk.is_conta_resultado) newContaBooleansMap[newContaId].is_conta_resultado = true;
                    
                } else if (fk.tabela === 'config_stripe_sintetica') {
                    updatesConfigStripe.push({ id: fk.record_id, conta_sintetica_id: newContaId });
                    
                    // Herança de booleanos (Caixa/Banco ou Patrimonial)
                    if (fk.is_conta_caixa_banco) newContaBooleansMap[newContaId].is_conta_caixa_banco = true;
                    if (fk.is_conta_patrimonial) newContaBooleansMap[newContaId].is_conta_patrimonial = true;
                    
                } else if (fk.tabela === 'config_stripe_receber') {
                    updatesConfigStripe.push({ id: fk.record_id, conta_receber_id: newContaId });
                    
                    // Herança de booleanos (Caixa/Banco ou Patrimonial)
                    if (fk.is_conta_caixa_banco) newContaBooleansMap[newContaId].is_conta_caixa_banco = true;
                    if (fk.is_conta_patrimonial) newContaBooleansMap[newContaId].is_conta_patrimonial = true;
                } else if (fk.tabela === 'config_contrato_ativo') {
                    configContratoMap[fk.record_id] = { ...configContratoMap[fk.record_id], id: fk.record_id, proprietario_id: proprietarioId, id_conta_clientes_receber: newContaId };
                    if (fk.is_conta_patrimonial) newContaBooleansMap[newContaId].is_conta_patrimonial = true;
                } else if (fk.tabela === 'config_contrato_receita') {
                    configContratoMap[fk.record_id] = { ...configContratoMap[fk.record_id], id: fk.record_id, proprietario_id: proprietarioId, id_conta_receita_contrato: newContaId };
                    if (fk.is_conta_resultado) newContaBooleansMap[newContaId].is_conta_resultado = true;
                } else if (fk.tabela === 'lancamentos_conta') {
                    updatesLancamentos.push({
                        field: 'conta_contabil_id',
                        old_conta_contabil_id: fk.old_conta_contabil_id,
                        new_conta_contabil_id: newContaId,
                    });
                } else if (fk.tabela === 'lancamentos_resultado') {
                    updatesLancamentos.push({
                        field: 'conta_resultado_id',
                        old_conta_contabil_id: fk.old_conta_contabil_id,
                        new_conta_contabil_id: newContaId,
                    });
                }
            });

            const updatesConfigContrato = Object.values(configContratoMap);
            
            // 3.2. Coletar todos os payloads de booleanos
            const updatesPlanoContasBooleans = Object.values(newContaBooleansMap);
            
            // 3.3. Executar todas as atualizações (AGORA ENVIAMOS TUDO PARA A EDGE FUNCTION)
            const { error: finalUpdateError } = await supabase.functions.invoke('update-plano-contas-fks', {
                body: {
                    proprietarioId,
                    updatesSaldoContas,
                    updatesConfigCR,
                    updatesConfigCP,
                    updatesConfigStripe,
                    updatesConfigContrato,
                    updatesLancamentos,
                    updatesPlanoContasBooleans,
                },
            });
            
            if (finalUpdateError) throw finalUpdateError;

            showSuccess(`Plano importado e ${oldFKs.length} referências remapeadas!`);
            onSaveComplete();
            handleClose(true);

        } catch (e: any) {
            console.error(e);
            showError("Erro ao importar: " + e.message);
        } finally {
            setLoading(false);
        }
    };
    
    const renderTable = (title: string, data: OldFKData[], keyField: 'saldo_inicial' | 'tipo_registro' = 'saldo_inicial') => (
        <div className="overflow-x-auto border rounded-md mb-4">
            <h4 className="font-semibold p-3 bg-secondary">{title} ({data.length})</h4>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-[25%]">Nome/Descrição</TableHead>
                        <TableHead className="w-[25%]">Conta Antiga</TableHead>
                        <TableHead className="w-[15%] text-right">{keyField === 'saldo_inicial' ? 'Saldo Inicial' : 'Tipo Registro'}</TableHead>
                        <TableHead className="w-[35%]">Mapear para Nova Conta</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.map(fk => {
                        const isMapped = !!mapping[fk.id];
                        
                        // CORREÇÃO TS2339: Acessa saldo_inicial apenas se keyField for 'saldo_inicial'
                        const displayValue = keyField === 'saldo_inicial' 
                            ? formatCurrency(fk.saldo_inicial ?? 0) 
                            : fk.tipo_registro;

                        return (
                            <TableRow key={fk.id} className={cn(!isMapped && "bg-red-500/10")}>
                                <TableCell>{fk.nome}</TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                    {fk.old_conta_contabil_nome}
                                </TableCell>
                                <TableCell className="text-right font-semibold">
                                    {displayValue}
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center space-x-2">
                                        <Select
                                            onValueChange={(id) => handleMapChange(fk.id, id)}
                                            value={mapping[fk.id] ?? ""}
                                            disabled={loading}
                                        >
                                            <SelectTrigger className={cn("h-8 text-xs flex-1", !isMapped && "border-red-500")}>
                                                <SelectValue placeholder="Selecione a nova conta analítica" />
                                            </SelectTrigger>
                                            <SelectContent position="popper" side="bottom">
                                                {newContasAnaliticas.map(c => (
                                                    <SelectItem key={`item-${c.Conta}`} value={c.Conta}>
                                                        {c.Conta} - {c.Descricao}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        {isMapped && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleClearSelection(fk.id)}
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
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[90vw] max-h-[95vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center text-red-600">
                        <AlertTriangle className="w-6 h-6 mr-2" /> Mapeamento de Referências Contábeis
                    </DialogTitle>
                    <DialogDescription>
                        Seu Plano de Contas será substituído. Mapeie as referências antigas para as novas contas analíticas.
                    </DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="saldo_contas" className="flex-1 flex flex-col overflow-hidden">
                <TabsList className={cn("grid w-full", tabsGridColsClass)}>
                    <TabsTrigger value="saldo_contas">Saldos ({grupos.saldo_contas?.length || 0})</TabsTrigger>
                    <TabsTrigger value="configs_cr">CR Configs ({grupos.config_cr?.length || 0})</TabsTrigger>
                    <TabsTrigger value="configs_cp">CP Configs ({grupos.config_cp?.length || 0})</TabsTrigger>
                    {stripeCount > 0 && (
                        <TabsTrigger value="configs_stripe">
                            Stripe Configs ({stripeCount})
                        </TabsTrigger>
                    )}
                    <TabsTrigger value="configs_contrato" className="flex items-center">
                        <FileSignature className="w-4 h-4 mr-1" /> Contratos ({contratoCount})
                    </TabsTrigger>
                    {lancamentosCount > 0 && (
                        <TabsTrigger value="lancamentos">Lançamentos ({lancamentosCount})</TabsTrigger>
                    )}
                </TabsList>
                    
                    <ScrollArea className="flex-1 mt-4">
                        <TabsContent value="saldo_contas" className="mt-0">
                            {renderTable("Contas de Saldo/Caixa", grupos.saldo_contas || [])}
                        </TabsContent>
                        <TabsContent value="configs_cr" className="mt-0">
                            {renderTable("Configurações de Contas a Receber", grupos.config_cr || [], 'tipo_registro')}
                        </TabsContent>
                        <TabsContent value="configs_cp" className="mt-0">
                            {renderTable("Configurações de Contas a Pagar", grupos.config_cp || [], 'tipo_registro')}
                        </TabsContent>
                        {stripeCount > 0 && (
                            <TabsContent value="configs_stripe" className="mt-0 space-y-4">
                                {renderTable("Stripe - Conta Sintética", grupos.config_stripe_sintetica || [], 'tipo_registro')}
                                {renderTable("Stripe - Conta Receber", grupos.config_stripe_receber || [], 'tipo_registro')}
                            </TabsContent>
                        )}
                        <TabsContent value="configs_contrato" className="mt-0 space-y-4">
                            <div className="p-4 rounded-md border border-secondary/40 bg-secondary/60">
                                <div className="flex items-center space-x-2 text-sm font-semibold">
                                    <FileSignature className="w-4 h-4" />
                                    <span>Configurações de Contratos e Links</span>
                                </div>
                                <p className="text-xs text-muted-foreground">Mapeamento Contábil (Contratos)</p>
                            </div>
                            {renderTable("Contrato - Clientes a Receber (Ativo)", grupos.config_contrato_ativo || [], 'tipo_registro')}
                            {renderTable("Contrato - Receita (Resultado)", grupos.config_contrato_receita || [], 'tipo_registro')}
                        </TabsContent>
                        {lancamentosCount > 0 && (
                            <TabsContent value="lancamentos" className="mt-0 space-y-4">
                                {renderTable("Lançamentos - Conta Contábil", grupos.lancamentos_conta || [], 'tipo_registro')}
                                {renderTable("Lançamentos - Conta Resultado", grupos.lancamentos_resultado || [], 'tipo_registro')}
                            </TabsContent>
                        )}
                    </ScrollArea>
                </Tabs>

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

export default MapearTodasFKsDialog;
