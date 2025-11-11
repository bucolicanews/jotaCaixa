import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { PlanoContas } from '@/types/plano-contas';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

// Tipos para o mapeamento
interface ContaAntigaEmUso {
    oldId: string;
    oldConta: string;
    oldDescricao: string;
    newId: string | null; // ID da nova conta selecionada
    newConta: string | null; // Código da nova conta selecionada
    dependencies: number; // Número total de referências (saldo_contas + lancamentos)
}

interface MapeamentoPlanoContasDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    proprietarioId: string;
    contasParaInserir: Partial<PlanoContas>[];
    contasAntigasEmUso: { id: string, Conta: string, Descricao: string, dependencies: number }[];
    onMapeamentoCompleto: () => void;
}

const MapeamentoPlanoContasDialog: React.FC<MapeamentoPlanoContasDialogProps> = ({
    open,
    onOpenChange,
    proprietarioId,
    contasParaInserir,
    contasAntigasEmUso,
    onMapeamentoCompleto,
}) => {
    const [mapeamento, setMapeamento] = useState<ContaAntigaEmUso[]>([]);
    const [newContasMap, setNewContasMap] = useState<PlanoContas[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [step, setStep] = useState<'review' | 'insert' | 'update'>('review');

    // 1. Inicializa o mapeamento e a lista de novas contas
    useEffect(() => {
        if (open && contasAntigasEmUso.length > 0) {
            // Mapeia as contas antigas para o estado de mapeamento
            const initialMap: ContaAntigaEmUso[] = contasAntigasEmUso.map(c => ({
                oldId: c.id,
                oldConta: c.Conta,
                oldDescricao: c.Descricao,
                newId: null,
                newConta: null,
                dependencies: c.dependencies,
            }));
            setMapeamento(initialMap);
            setStep('review');
        }
    }, [open, contasAntigasEmUso]);
    
    // 2. Lógica de Inserção (Passo 1)
    const handleInsertNewContas = useCallback(async () => {
        setIsSubmitting(true);
        
        // IDs das contas antigas que serão deletadas
        const oldIdsToDelete = contasAntigasEmUso.map(c => c.id);

        try {
            // 1. Limpar referências em tabelas de configuração (CRÍTICO para evitar FK violation)
            console.log('LOG: Clearing FK references in configuration tables...');
            
            // a) configuracao_contas_pagar
            await supabase.from('configuracao_contas_pagar')
                .update({ conta_contabil_id: null })
                .eq('proprietario_id', proprietarioId)
                .in('conta_contabil_id', oldIdsToDelete);

            // b) configuracao_contas_receber
            await supabase.from('configuracao_contas_receber')
                .update({ conta_contabil_id: null })
                .eq('proprietario_id', proprietarioId)
                .in('conta_contabil_id', oldIdsToDelete);
                
            // c) configuracoes_stripe (conta_sintetica_id e conta_receber_id)
            await supabase.from('configuracoes_stripe')
                .update({ conta_sintetica_id: null, conta_receber_id: null })
                .eq('proprietario_id', proprietarioId)
                .or(`conta_sintetica_id.in.(${oldIdsToDelete.join(',')}),conta_receber_id.in.(${oldIdsToDelete.join(',')})`);
                
            // d) admin_contas_receber e admin_contas_pagar
            await supabase.from('admin_contas_receber')
                .update({ id_conta_contabil: null })
                .eq('admin_id', proprietarioId)
                .in('id_conta_contabil', oldIdsToDelete);
                
            await supabase.from('admin_contas_pagar')
                .update({ id_conta_contabil: null })
                .eq('admin_id', proprietarioId)
                .in('id_conta_contabil', oldIdsToDelete);
                
            // e) saldo_contas (CRÍTICO)
            await supabase.from('saldo_contas')
                .update({ conta_contabil_id: null })
                .eq('proprietario_id', proprietarioId)
                .in('conta_contabil_id', oldIdsToDelete);
                
            // f) lancamentos (CRÍTICO)
            await supabase.from('lancamentos')
                .update({ conta_contabil_id: null })
                .eq('proprietario_id', proprietarioId)
                .in('conta_contabil_id', oldIdsToDelete);
            
            // 2. Limpar contas existentes para o proprietário
            const { error: deleteError } = await supabase
                .from('plano_contas')
                .delete()
                .eq('proprietario_id', proprietarioId);

            if (deleteError) {
                throw new Error('Erro ao limpar contas existentes: ' + deleteError.message);
            }
            
            // 3. Inserir novos dados e obter os novos IDs
            const { data: newContas, error: insertError } = await supabase
                .from('plano_contas')
                .insert(contasParaInserir)
                .select('id, Conta, Descricao');

            if (insertError) throw insertError;
            
            let finalNewContas = newContas as PlanoContas[] || [];
            
            // Fallback: Se o select() retornar vazio (pode acontecer devido a RLS ou configuração)
            if (finalNewContas.length === 0 && contasParaInserir.length > 0) {
                console.warn("Insert returned empty data. Fetching all accounts as fallback.");
                const { data: fetchedData, error: fetchError } = await supabase
                    .from('plano_contas')
                    .select('id, Conta, Descricao')
                    .eq('proprietario_id', proprietarioId)
                    .order('Conta', { ascending: true });
                    
                if (fetchError) throw fetchError;
                finalNewContas = fetchedData as PlanoContas[];
            }
            
            setNewContasMap(finalNewContas);
            setStep('update'); // Avança para o passo de atualização
            showSuccess('Novas contas inseridas. Iniciando correlação...');

        } catch (error: any) {
            showError('Falha ao inserir novo Plano de Contas: ' + error.message);
            onOpenChange(false);
        } finally {
            setIsSubmitting(false);
        }
    }, [contasParaInserir, onOpenChange, proprietarioId, contasAntigasEmUso]);
    
    // 3. Lógica de Atualização (Passo 2)
    const handleUpdateReferences = useCallback(async () => {
        setIsSubmitting(true);
        
        const updatesSaldoContas: { id: string, conta_contabil_id: string }[] = [];
        const updatesLancamentos: { id: string, conta_contabil_id: string }[] = [];
        let totalUpdated = 0;

        try {
            for (const item of mapeamento) {
                if (item.newId) {
                    // 1. Buscar referências em saldo_contas que usavam o oldId
                    const { data: saldoContasInUse } = await supabase
                        .from('saldo_contas')
                        .select('id')
                        .eq('proprietario_id', proprietarioId)
                        .eq('conta_contabil_id', item.oldId);
                        
                    (saldoContasInUse || []).forEach(sc => {
                        updatesSaldoContas.push({ id: sc.id, conta_contabil_id: item.newId! });
                    });
                    
                    // 2. Buscar referências em lancamentos que usavam o oldId
                    const { data: lancamentosInUse } = await supabase
                        .from('lancamentos')
                        .select('id')
                        .eq('proprietario_id', proprietarioId)
                        .eq('conta_contabil_id', item.oldId);
                        
                    (lancamentosInUse || []).forEach(l => {
                        updatesLancamentos.push({ id: l.id, conta_contabil_id: item.newId! });
                    });
                    
                    // CORREÇÃO DO ERRO 2: Corrigido 'lancamentosInuse' para 'lancamentosInUse'
                    totalUpdated += (saldoContasInUse?.length || 0) + (lancamentosInUse?.length || 0);
                } else {
                    // Se não foi mapeado, setar para NULL (já foi feito no passo 1, mas repetimos para segurança)
                    
                    // Atualiza saldo_contas para NULL
                    await supabase
                        .from('saldo_contas')
                        .update({ conta_contabil_id: null })
                        .eq('proprietario_id', proprietarioId)
                        .eq('conta_contabil_id', item.oldId);
                        
                    // Atualiza lancamentos para NULL
                    await supabase
                        .from('lancamentos')
                        .update({ conta_contabil_id: null })
                        .eq('proprietario_id', proprietarioId)
                        .eq('conta_contabil_id', item.oldId);
                }
            }
            
            // 3. Executar updates em lote (apenas para os mapeados)
            if (updatesSaldoContas.length > 0) {
                await supabase.from('saldo_contas').upsert(updatesSaldoContas, { onConflict: 'id' });
            }
            if (updatesLancamentos.length > 0) {
                await supabase.from('lancamentos').upsert(updatesLancamentos, { onConflict: 'id' });
            }
            
            showSuccess(`Correlação concluída! ${totalUpdated} referências atualizadas.`);
            onMapeamentoCompleto();
            onOpenChange(false);

        } catch (error: any) {
            showError('Falha ao atualizar referências: ' + error.message);
        } finally {
            setIsSubmitting(false);
        }
    }, [mapeamento, proprietarioId, onMapeamentoCompleto, onOpenChange]);

    // 4. Handlers de UI
    const handleMapeamentoChange = (oldId: string, newId: string) => {
        const newConta = newContasMap.find(c => c.id === newId);
        
        setMapeamento(prev => prev.map(item => 
            item.oldId === oldId 
                ? { ...item, newId: newId, newConta: newConta?.Conta || null } 
                : item
        ));
    };
    
    const isMapeamentoCompleto = mapeamento.every(item => item.newId !== null);
    
    // Renderização Condicional
    
    if (step === 'review') {
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Revisão e Inserção do Novo Plano</DialogTitle>
                        <DialogDescription>
                            O novo plano de contas será inserido, substituindo o antigo. As contas abaixo estavam em uso e precisam ser correlacionadas.
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="p-3 bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-500 rounded-md text-sm text-yellow-700 dark:text-yellow-300">
                        <p className="font-semibold">Atenção:</p>
                        <p>Ao clicar em "Inserir Novo Plano", o plano antigo será deletado e as novas contas serão criadas. Em seguida, você fará a correlação.</p>
                    </div>
                    
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[30%]">Conta Antiga (Em Uso)</TableHead>
                                    <TableHead className="w-[10%] text-center">Referências</TableHead>
                                    <TableHead className="w-[60%]">Descrição</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {contasAntigasEmUso.map((item) => (
                                    <TableRow key={item.id}>
                                        <TableCell>
                                            <p className="font-semibold">{item.Conta}</p>
                                        </TableCell>
                                        <TableCell className="text-center font-bold text-sm">{item.dependencies}</TableCell>
                                        <TableCell className="text-sm text-muted-foreground">{item.Descricao}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                    
                    <div className="flex justify-between pt-4 border-t">
                        <Button onClick={() => onOpenChange(false)} variant="secondary" disabled={isSubmitting}>
                            Cancelar
                        </Button>
                        <Button 
                            onClick={handleInsertNewContas} 
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Inserir Novo Plano e Correlacionar'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        );
    }

    if (step === 'insert') {
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Processando Inserção...</DialogTitle>
                        {/* CORREÇÃO DO ERRO 1 e 3: Corrigido Dialoguração para DialogDescription */}
                        <DialogDescription>
                            Inserindo novas contas no Plano de Contas.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-center items-center h-40">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                </DialogContent>
            </Dialog>
        );
    }

    // Step 'update'
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Correlação de Contas Contábeis</DialogTitle>
                    <DialogDescription>
                        Mapeie as contas antigas (esquerda) para as novas contas (direita).
                    </DialogDescription>
                </DialogHeader>
                
                <div className="p-3 bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-500 rounded-md text-sm text-yellow-700 dark:text-yellow-300">
                    <p className="font-semibold">Atenção:</p>
                    <p>Se você não mapear uma conta, as referências antigas serão setadas para NULL nas tabelas financeiras.</p>
                </div>

                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[30%]">Conta Antiga (Em Uso)</TableHead>
                                <TableHead className="w-[10%] text-center">Referências</TableHead>
                                <TableHead className="w-[60%]">Mapear para Nova Conta</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {mapeamento.map((item) => (
                                <TableRow key={item.oldId} className={cn(!item.newId && 'bg-red-500/10')}>
                                    <TableCell>
                                        <p className="font-semibold">{item.oldConta}</p>
                                        <p className="text-xs text-muted-foreground">{item.oldDescricao}</p>
                                    </TableCell>
                                    <TableCell className="text-center font-bold text-sm">{item.dependencies}</TableCell>
                                    <TableCell>
                                        <Select 
                                            onValueChange={(newId) => handleMapeamentoChange(item.oldId, newId)}
                                            value={item.newId || undefined}
                                            disabled={isSubmitting}
                                        >
                                            <SelectTrigger className={cn(!item.newId && 'border-red-500')}>
                                                <SelectValue placeholder="Selecione a nova conta correspondente" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {newContasMap.map(c => (
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
                
                <div className="flex justify-between pt-4 border-t">
                    <Button onClick={() => onOpenChange(false)} variant="secondary" disabled={isSubmitting}>
                        Cancelar
                    </Button>
                    <Button 
                        onClick={handleUpdateReferences} 
                        disabled={isSubmitting || !isMapeamentoCompleto}
                    >
                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                        {isMapeamentoCompleto ? 'Confirmar Correlação e Finalizar' : 'Mapeie todas as contas'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default MapeamentoPlanoContasDialog;