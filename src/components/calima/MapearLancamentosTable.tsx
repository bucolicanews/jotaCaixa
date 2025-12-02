import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Loader2, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { formatCurrency, formatarData } from '@/utils/formatters';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlanoContas } from '@/types/plano-contas';
import { Historico } from '@/types/historico';
import { cn } from '@/lib/utils';

// Tipo para os dados de entrada (o que vem do Supabase)
interface InputLancamento {
    id: string;
    data_movimentacao: string;
    descricao: string;
    valor: number;
    tipo: 'Entrada' | 'Saida';
    conta_contabil_id: string | null;
    historico_id: string | null;
}

// Tipo para o estado interno (inclui campos temporários para edição)
interface MapeamentoState extends InputLancamento {
    temp_conta_contabil_id: string | null;
    temp_historico_id: string | null;
    is_dirty: boolean;
}

interface MapearLancamentosTableProps {
    empresaId: string;
    lancamentosIniciais: InputLancamento[]; // Usa o tipo de entrada
    contasContabeis: PlanoContas[];
    historicos: Historico[];
    onSaveComplete: () => void;
}

const MapearLancamentosTable: React.FC<MapearLancamentosTableProps> = ({ 
    lancamentosIniciais, 
    contasContabeis, 
    historicos, 
    onSaveComplete 
}) => {
    const [lancamentos, setLancamentos] = useState<MapeamentoState[]>([]); // Usa o tipo de estado
    const [isSaving, setIsSaving] = useState(false); // CORREÇÃO: Adiciona o estado isSaving

    useEffect(() => {
        // Inicializa o estado local com os dados iniciais
        const mapped = lancamentosIniciais.map(l => ({
            ...l,
            temp_conta_contabil_id: l.conta_contabil_id,
            temp_historico_id: l.historico_id,
            is_dirty: false,
        })) as MapeamentoState[]; // Cast para garantir o tipo correto
        setLancamentos(mapped);
    }, [lancamentosIniciais]);

    const handleUpdateField = (index: number, field: 'temp_conta_contabil_id' | 'temp_historico_id', value: string | null) => {
        setLancamentos(prev => prev.map((l, i) => 
            i === index ? { ...l, [field]: value, is_dirty: true } : l
        ));
    };
    
    const handleSaveAll = async () => {
        const dirtyLancamentos = lancamentos.filter(l => l.is_dirty);
        
        if (dirtyLancamentos.length === 0) {
            showError('Nenhuma alteração para salvar.');
            return;
        }
        
        setIsSaving(true);
        
        try {
            const updates = dirtyLancamentos.map(l => ({
                id: l.id,
                conta_contabil_id: l.temp_conta_contabil_id,
                historico_id: l.temp_historico_id,
                atualizado_em: new Date().toISOString(),
            }));
            
            // O Supabase permite updates em lote
            const { error } = await supabase
                .from('lancamentos')
                .upsert(updates, { onConflict: 'id' });
                
            if (error) throw error;
            
            showSuccess(`${dirtyLancamentos.length} lançamentos mapeados com sucesso!`);
            onSaveComplete(); // Recarrega a lista principal
            
        } catch (error: any) {
            console.error('Erro ao salvar mapeamento:', error);
            showError('Falha ao salvar mapeamento: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };
    
    const totalDirty = lancamentos.filter(l => l.is_dirty).length;
    // Usa os campos originais para calcular o total mapeado (após o fetch)
    const totalMapeados = lancamentos.filter(l => l.conta_contabil_id && l.historico_id).length;
    const totalNaoMapeados = lancamentos.length - totalMapeados;

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-xl">Lançamentos Pendentes ({lancamentos.length})</CardTitle>
                <Button 
                    onClick={handleSaveAll} 
                    disabled={isSaving || totalDirty === 0}
                >
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Salvar Mapeamentos ({totalDirty})
                </Button>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-3 gap-4 mb-4">
                    <Card className="p-3 border-l-4 border-blue-500"><p className="text-sm font-medium">Total Pendente</p><p className="text-xl font-bold">{totalNaoMapeados}</p></Card>
                    <Card className="p-3 border-l-4 border-green-500"><p className="text-sm font-medium">Total Mapeado</p><p className="text-xl font-bold">{totalMapeados}</p></Card>
                    <Card className="p-3 border-l-4 border-yellow-500"><p className="text-sm font-medium">Alterações Salvas</p><p className="text-xl font-bold">{totalDirty}</p></Card>
                </div>
                
                <div className="overflow-x-auto max-h-[60vh] border rounded-md">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[100px]">Data</TableHead>
                                <TableHead className="w-[80px]">Tipo</TableHead>
                                <TableHead className="w-[120px] text-right">Valor</TableHead>
                                <TableHead className="min-w-[200px]">Descrição</TableHead>
                                <TableHead className="min-w-[200px]">Conta Contábil</TableHead>
                                <TableHead className="min-w-[200px]">Histórico</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {lancamentos.length === 0 ? (
                                <TableRow><TableCell colSpan={6} className="text-center h-24">Nenhum lançamento pendente encontrado.</TableCell></TableRow>
                            ) : (
                                lancamentos.map((l, i) => {
                                    const isMapeado = l.temp_conta_contabil_id && l.temp_historico_id;
                                    
                                    return (
                                        <TableRow key={l.id} className={cn(l.is_dirty && 'bg-yellow-500/10', isMapeado && !l.is_dirty && 'bg-green-500/10')}>
                                            <TableCell className="text-sm">{formatarData(l.data_movimentacao)}</TableCell>
                                            <TableCell className={cn("font-semibold text-sm", l.tipo === 'Entrada' ? 'text-green-600' : 'text-red-600')}>{l.tipo}</TableCell>
                                            <TableCell className="text-right font-semibold">{formatCurrency(l.valor)}</TableCell>
                                            <TableCell className="text-sm">{l.descricao}</TableCell>
                                            
                                            {/* Coluna Conta Contábil */}
                                            <TableCell>
                                                <Select 
                                                    value={l.temp_conta_contabil_id || undefined} 
                                                    onValueChange={(v) => handleUpdateField(i, 'temp_conta_contabil_id', v)}
                                                    disabled={isSaving}
                                                >
                                                    <SelectTrigger className={cn("h-8 text-xs", !l.temp_conta_contabil_id && 'border-red-500')}>
                                                        <SelectValue placeholder="Selecione a Conta Resultado" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {contasContabeis.map(c => (
                                                            <SelectItem key={c.id} value={c.id}>
                                                                {c.Conta} - {c.Descricao}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>
                                            
                                            {/* Coluna Histórico */}
                                            <TableCell>
                                                <Select 
                                                    value={l.temp_historico_id || undefined} 
                                                    onValueChange={(v) => handleUpdateField(i, 'temp_historico_id', v)}
                                                    disabled={isSaving}
                                                >
                                                    <SelectTrigger className={cn("h-8 text-xs", !l.temp_historico_id && 'border-red-500')}>
                                                        <SelectValue placeholder="Selecione o Histórico" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {historicos.map(h => (
                                                            <SelectItem key={h.id} value={h.id}>
                                                                {h.codigo && `[${h.codigo}] `}{h.descricao}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
};

export default MapearLancamentosTable;