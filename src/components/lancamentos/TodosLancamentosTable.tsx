import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Filter, Search, Printer, Trash2, Edit } from 'lucide-react';
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
import { usePrint } from '@/hooks/use-print';
import ReactDOMServer from 'react-dom/server';
import LancamentosPrint from './LancamentosPrint';
import { useOwnerBranding } from '@/hooks/use-owner-branding';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../ui/alert-dialog';

interface LancamentoDetalhado extends Lancamento {
    plano_contas: { Conta: string, Descricao: string } | null;
    historicos: { codigo: string | null, descricao: string } | null;
    saldo_contas: { nome: string } | null;
}

const TodosLancamentosTable: React.FC = () => {
    const { usuario } = useSessao();
    const { printContent } = usePrint();
    const { logoUrl, ownerName } = useOwnerBranding();
    
    const [lancamentos, setLancamentos] = useState<LancamentoDetalhado[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDeleting, setIsDeleting] = useState(false);
    const [filtroTexto, setFiltroTexto] = useState('');
    const [filtroOrigem, setFiltroOrigem] = useState('todos');
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
                historicos:historico_id ( codigo, descricao ),
                saldo_contas:conta_bancaria_id ( nome )
            `)
            .eq('proprietario_id', ownerId)
            .order('data_movimentacao', { ascending: false });
            
        if (filtroOrigem !== 'todos') {
            query = query.eq('origem', filtroOrigem);
        }
            
        if (filtroTextoDebounced) {
            const termo = `%${filtroTextoDebounced}%`;
            query = query.or(`descricao.ilike.${termo},plano_contas.Descricao.ilike.${termo},historicos.descricao.ilike.${termo}`);
        }

        const { data, error } = await query;

        if (error) {
            showError('Erro ao carregar todos os lançamentos: ' + error.message);
            setLancamentos([]);
        } else {
            setLancamentos(data as LancamentoDetalhado[]);
        }
        setLoading(false);
    }, [ownerId, filtroTextoDebounced, filtroOrigem]);

    useEffect(() => {
        fetchLancamentos();
    }, [fetchLancamentos]);
    
    const getBadgeVariant = (tipo: 'Entrada' | 'Saida') => tipo === 'Entrada' ? 'destructive' : 'success';
    
    const getOrigemDisplay = (origem: string) => {
        switch (origem) {
            case 'lancamento_manual': return 'Manual';
            case 'Manual': return 'Manual';
            case 'conciliacao_extrato': return 'Conciliação';
            case 'lancamento_cr': return 'CR (Inicial)';
            case 'recebimento_manual': return 'CR (Recebimento)';
            case 'lancamento_cp': return 'CP (Inicial)';
            case 'pagamento_manual': return 'CP (Pagamento)';
            case 'assinatura_stripe': return 'Assinatura';
            case 'movimentacao_direta': return 'Mov. Direta';
            case 'estorno_direto': return 'Estorno';
            case 'movimentacao_direta_estornada': return 'Estornada';
            case 'recebimento_manual_estornada': return 'CR (Estornada)';
            case 'pagamento_manual_estornada': return 'CP (Estornada)';
            default: return origem;
        }
    };
    
    const handlePrint = () => {
        if (lancamentos.length === 0) {
            showError('Nenhum lançamento para imprimir.');
            return;
        }
        
        const printComponent = (
            <LancamentosPrint
                lancamentos={lancamentos}
                ownerName={ownerName}
                logoUrl={logoUrl}
            />
        );

        const htmlContent = ReactDOMServer.renderToStaticMarkup(printComponent);
        printContent(htmlContent, `Todos os Lançamentos - ${ownerName}`, 'landscape');
    };
    
    const handleDelete = async (lancamento: LancamentoDetalhado) => {
        const origem = lancamento.origem;
        
        if (origem !== 'lancamento_manual' && origem !== 'movimentacao_direta' && origem !== 'Manual') {
            showError(`Lançamentos de origem '${getOrigemDisplay(origem)}' devem ser excluídos no módulo de origem (Ex: Contas a Receber, Conciliação).`);
            return;
        }
        
        if (!window.confirm(`Tem certeza que deseja excluir este lançamento (${getOrigemDisplay(origem)})? Isso removerá o par de partidas dobradas.`)) return;
        
        setIsDeleting(true);
        try {
            const pairedId = lancamento.conta_resultado_id;
            
            const idsToDelete = [lancamento.id];
            if (pairedId) {
                idsToDelete.push(pairedId);
            }
            
            // 2. Deletar ambos os lançamentos (Débito e Crédito)
            const { error } = await supabase
                .from('lancamentos')
                .delete()
                .in('id', idsToDelete);
                
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
                <CardTitle className="text-xl">Todos os Lançamentos ({lancamentos.length})</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
                    <div className="relative w-full sm:w-auto flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar por descrição, conta ou histórico..."
                            value={filtroTexto}
                            onChange={(e) => setFiltroTexto(e.target.value)}
                            className="pl-10 max-w-sm"
                        />
                    </div>
                    <div className="flex space-x-2 w-full sm:w-auto">
                        <Select value={filtroOrigem} onValueChange={setFiltroOrigem}>
                            <SelectTrigger className="w-full sm:w-[200px]">
                                <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
                                <SelectValue placeholder="Filtrar por Origem" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="todos">Todas as Origens</SelectItem>
                                <SelectItem value="lancamento_manual">Manual</SelectItem>
                                <SelectItem value="conciliacao_extrato">Conciliação</SelectItem>
                                <SelectItem value="lancamento_cr">CR (Inicial)</SelectItem>
                                <SelectItem value="recebimento_manual">CR (Recebimento)</SelectItem>
                                <SelectItem value="lancamento_cp">CP (Inicial)</SelectItem>
                                <SelectItem value="pagamento_manual">CP (Pagamento)</SelectItem>
                                <SelectItem value="assinatura_stripe">Assinatura</SelectItem>
                                <SelectItem value="movimentacao_direta">Mov. Direta</SelectItem>
                                <SelectItem value="estorno_direto">Estorno</SelectItem>
                                <SelectItem value="movimentacao_direta_estornada">Estornada</SelectItem>
                                <SelectItem value="recebimento_manual_estornada">CR (Estornada)</SelectItem>
                                <SelectItem value="pagamento_manual_estornada">CP (Estornada)</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button onClick={handlePrint} variant="outline" disabled={lancamentos.length === 0}>
                            <Printer className="w-4 h-4 mr-2" /> Imprimir
                        </Button>
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
                                <TableHead className="w-[150px]">Conta Contábil</TableHead>
                                <TableHead className="w-[150px]">Origem</TableHead>
                                <TableHead className="w-[100px]">Conta Caixa</TableHead>
                                <TableHead className="w-[100px] text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={8} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
                            ) : lancamentos.length === 0 ? (
                                <TableRow><TableCell colSpan={8} className="text-center py-4 text-muted-foreground">Nenhum lançamento encontrado.</TableCell></TableRow>
                            ) : (
                                lancamentos.map((l) => {
                                    const isDebito = l.tipo === 'Entrada';
                                    const contaDisplay = l.plano_contas ? `${l.plano_contas.Conta} - ${l.plano_contas.Descricao}` : 'N/A';
                                    const origemDisplay = getOrigemDisplay(l.origem);
                                    
                                    const canDelete = l.origem === 'lancamento_manual' || l.origem === 'movimentacao_direta' || l.origem === 'Manual';
                                    
                                    return (
                                        <TableRow key={l.id} className={cn(l.origem === 'estorno_direto' && 'bg-red-500/10', l.origem.endsWith('_estornada') && 'opacity-50')}>
                                            <TableCell className="text-sm">{formatarData(l.data_movimentacao)}</TableCell>
                                            <TableCell>
                                                <Badge variant={getBadgeVariant(l.tipo)}>
                                                    {isDebito ? 'Débito' : 'Crédito'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className={cn("text-right font-semibold", isDebito ? 'text-red-600' : 'text-green-600')}>
                                                {formatCurrency(l.valor)}
                                            </TableCell>
                                            <TableCell className="text-sm">{l.descricao}</TableCell>
                                            <TableCell className="text-xs text-muted-foreground">{contaDisplay}</TableCell>
                                            <TableCell className="text-xs text-muted-foreground">{origemDisplay}</TableCell>
                                            <TableCell className="text-xs text-muted-foreground">{l.saldo_contas?.nome || '-'}</TableCell>
                                            <TableCell className="text-right space-x-2">
                                                <Button variant="ghost" size="icon" onClick={() => alert('Edição não implementada.')} disabled>
                                                    <Edit className="w-4 h-4" />
                                                </Button>
                                                {canDelete && (
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
                                                                    Esta ação removerá permanentemente este lançamento e seu par de partida dobrada.
                                                                </AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
                                                                <AlertDialogAction onClick={() => handleDelete(l)} disabled={isDeleting}>
                                                                    {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Excluir'}
                                                                </AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                )}
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

export default TodosLancamentosTable;