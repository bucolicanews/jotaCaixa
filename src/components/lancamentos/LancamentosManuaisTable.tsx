import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Filter, Search, Trash2, Edit } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { Lancamento } from '@/types/lancamento';
import { formatCurrency, formatarData } from '@/utils/formatters';
import { Input } from '@/components/ui/input';
import { useDebounce } from '@/hooks/use-debounce';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

interface LancamentoDetalhado extends Lancamento {
    plano_contas: { Conta: string, Descricao: string } | null;
    historicos: { codigo: string | null, descricao: string } | null;
}

const LancamentosManuaisTable: React.FC = () => {
    const { usuario } = useSessao();
    const [lancamentos, setLancamentos] = useState<LancamentoDetalhado[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDeleting, setIsDeleting] = useState(false);
    const [filtroTexto, setFiltroTexto] = useState('');
    const filtroTextoDebounced = useDebounce(filtroTexto, 500);

    const ownerId = usuario?.id;

    const fetchLancamentos = useCallback(async () => {
        if (!ownerId) return;
        setLoading(true);

        let query = supabase
            .from('lancamentos')
            .select(`
                *,
                plano_contas:conta_contabil_id ( Conta, Descricao ),
                historicos:historico_id ( codigo, descricao )
            `)
            .eq('proprietario_id', ownerId)
            .eq('origem', 'lancamento_manual')
            .order('data_movimentacao', { ascending: false });
            
        if (filtroTextoDebounced) {
            const termo = `%${filtroTextoDebounced}%`;
            query = query.or(`descricao.ilike.${termo},plano_contas.Descricao.ilike.${termo},historicos.descricao.ilike.${termo}`);
        }

        const { data, error } = await query;

        if (error) {
            showError('Erro ao carregar lançamentos manuais: ' + error.message);
            setLancamentos([]);
        } else {
            setLancamentos(data as LancamentoDetalhado[]);
        }
        setLoading(false);
    }, [ownerId, filtroTextoDebounced]);

    useEffect(() => {
        fetchLancamentos();
    }, [fetchLancamentos]);
    
    const handleDelete = async (id: string) => {
        if (!window.confirm('Tem certeza que deseja excluir este lançamento manual?')) return;
        
        setIsDeleting(true);
        try {
            // 1. Encontrar o lançamento a ser deletado para obter o ID do par
            const launchToDelete = lancamentos.find(l => l.id === id);
            const pairedId = launchToDelete?.conta_resultado_id;
            
            const idsToDelete = [id];
            if (pairedId) {
                idsToDelete.push(pairedId);
            }
            
            // 2. Deletar ambos os lançamentos (Débito e Crédito)
            const { error } = await supabase
                .from('lancamentos')
                .delete()
                .in('id', idsToDelete); // Deleta ambos os IDs
                
            if (error) throw error;
            
            showSuccess('Lançamento excluído com sucesso.');
            fetchLancamentos();
        } catch (error: any) {
            showError('Falha ao excluir lançamento: ' + error.message);
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-xl">Histórico de Lançamentos Manuais ({lancamentos.length})</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
                    <div className="relative w-full sm:w-auto flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar por descrição ou conta contábil..."
                            value={filtroTexto}
                            onChange={(e) => setFiltroTexto(e.target.value)}
                            className="pl-10 max-w-sm"
                        />
                    </div>
                </div>
                
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[100px]">Data</TableHead>
                                <TableHead className="w-[80px]">Tipo</TableHead>
                                <TableHead className="w-[120px] text-right">Valor</TableHead>
                                <TableHead className="min-w-[200px]">Descrição</TableHead>
                                <TableHead className="min-w-[150px]">Conta Contábil</TableHead>
                                <TableHead className="min-w-[150px]">Histórico</TableHead>
                                <TableHead className="w-[100px] text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={7} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
                            ) : lancamentos.length === 0 ? (
                                <TableRow><TableCell colSpan={7} className="text-center py-4 text-muted-foreground">Nenhum lançamento manual encontrado.</TableCell></TableRow>
                            ) : (
                                lancamentos.map((l) => {
                                    const isDebito = l.tipo === 'Entrada';
                                    const contaDisplay = l.plano_contas ? `${l.plano_contas.Conta} - ${l.plano_contas.Descricao}` : 'N/A';
                                    const historicoDisplay = l.historicos ? `${l.historicos.codigo ? `[${l.historicos.codigo}] ` : ''}${l.historicos.descricao}` : 'N/A';
                                    
                                    return (
                                        <TableRow key={l.id}>
                                            <TableCell className="text-sm">{formatarData(l.data_movimentacao)}</TableCell>
                                            <TableCell>
                                                <Badge variant={isDebito ? 'destructive' : 'success'}>
                                                    {isDebito ? 'Débito' : 'Crédito'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className={cn("text-right font-semibold", isDebito ? 'text-red-600' : 'text-green-600')}>
                                                {formatCurrency(l.valor)}
                                            </TableCell>
                                            <TableCell className="text-sm">{l.descricao}</TableCell>
                                            <TableCell className="text-xs text-muted-foreground">{contaDisplay}</TableCell>
                                            <TableCell className="text-xs text-muted-foreground">{historicoDisplay}</TableCell>
                                            <TableCell className="text-right space-x-2">
                                                <Button variant="ghost" size="icon" onClick={() => alert('Edição não implementada.')} disabled>
                                                    <Edit className="w-4 h-4" />
                                                </Button>
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="ghost" size="icon" disabled={isDeleting}>
                                                            <Trash2 className="w-4 h-4 text-red-500" />
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Excluir Lançamento?</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                Esta ação removerá permanentemente este lançamento contábil.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
                                                            <AlertDialogAction onClick={() => handleDelete(l.id)} disabled={isDeleting}>
                                                                {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Excluir'}
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
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

export default LancamentosManuaisTable;