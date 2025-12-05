import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ListChecks, Edit, Trash2 } from 'lucide-react';
import { isToday, isPast, parseISO } from 'date-fns';
import { ContaReceberComProgresso } from '@/types/contas-receber';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

// Tipos importados do ContasReceber.tsx
// Removido: type ParcelaStatus = 'aberta' | 'parcial' | 'paga' | 'reprogramada' | 'cancelada' | 'bloqueada';
type BadgeVariant = 'success' | 'warning' | 'secondary' | 'destructive' | 'default' | 'info';

interface TabelaSinteticaProps {
    contasFiltradas: ContaReceberComProgresso[];
    handleOpenParcelas: (conta: ContaReceberComProgresso) => void;
    handleEdit: (conta: ContaReceberComProgresso) => void;
    handleDelete: (contaId: string) => void;
    formatCurrency: (value: number) => string;
    formatDate: (dateString: string) => string;
}

const TabelaSintetica: React.FC<TabelaSinteticaProps> = ({
    contasFiltradas,
    handleOpenParcelas,
    handleEdit,
    handleDelete,
    formatCurrency,
    formatDate,
}) => {
    
    // Recriando a lógica de status localmente
    const getStatusInfo = (conta: ContaReceberComProgresso) => {
        const total = conta.parcelas_total ?? 0;
        const pagas = conta.parcelas_pagas ?? 0;
        const isQuitada = total > 0 && pagas === total;
        let displayStatus: string;
        let statusVariant: BadgeVariant;

        if (isQuitada) {
            displayStatus = 'quitada';
            statusVariant = 'success';
        } else {
            const vencimento = parseISO(conta.data_vencimento + 'T00:00:00');
            if (isPast(vencimento) && !isToday(vencimento)) {
                statusVariant = 'destructive';
                displayStatus = 'atrasada';
            } else if (isToday(vencimento)) {
                statusVariant = 'warning';
                displayStatus = 'vence hoje';
            } else {
                statusVariant = 'secondary';
                displayStatus = 'aberta';
            }
        }
        return { displayStatus, statusVariant };
    };
    
    return (
        <Card>
            <CardHeader><CardTitle>Lançamentos Sintéticos ({contasFiltradas.length})</CardTitle></CardHeader>
            <CardContent>
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[120px]">Ações</TableHead>
                                <TableHead className="w-[100px]">ID Conta</TableHead>
                                <TableHead>Cliente</TableHead>
                                <TableHead>Descrição</TableHead>
                                <TableHead>Vencimento</TableHead>
                                <TableHead>Valor Total</TableHead>
                                <TableHead>Progresso</TableHead>
                                <TableHead className="hidden sm:table-cell">Status</TableHead>
                                <TableHead className="hidden sm:table-cell">Origem</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {contasFiltradas.length === 0 ? (
                                <TableRow><TableCell colSpan={9} className="text-center h-24">Nenhuma conta a receber encontrada no período.</TableCell></TableRow>
                            ) : (
                                contasFiltradas.map((conta) => {
                                    
                                    const { displayStatus, statusVariant } = getStatusInfo(conta);
                                    const total = conta.parcelas_total ?? 0;
                                    const pagas = conta.parcelas_pagas ?? 0;
                                    const progresso = total ? `${pagas}/${total}` : 'N/A';
                                    
                                    const origemDisplay = conta.origem === 'assinatura_recorrente' ? 'Assinatura' : (conta.origem === 'contrato' ? 'Contrato' : 'Manual');

                                    return (
                                        <TableRow key={conta.id}>
                                            <TableCell className="text-left min-w-[120px]">
                                                <div className="flex space-x-1">
                                                    <Button variant="ghost" size="icon" onClick={() => handleOpenParcelas(conta)} title="Ver Parcelas"><ListChecks className="h-4 w-4" /></Button>
                                                    <Button variant="ghost" size="icon" onClick={() => handleEdit(conta)} title="Editar Lançamento"><Edit className="h-4 w-4" /></Button>
                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <Button variant="ghost" size="icon" title="Excluir Lançamento"><Trash2 className="w-4 h-4 text-red-500" /></Button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
                                                                <AlertDialogDescription>
                                                                    Esta ação não pode ser desfeita. Isso excluirá permanentemente esta conta a receber.
                                                                </AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                                <AlertDialogAction onClick={() => handleDelete(conta.id)}>Excluir</AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                </div>
                                            </TableCell>
                                            <TableCell className="font-mono text-xs text-muted-foreground truncate max-w-[100px]" title={conta.id}>{conta.id.substring(0, 8)}...</TableCell>
                                            <TableCell className="font-medium">{conta.clientes?.nome || 'N/A'}</TableCell>
                                            <TableCell>{conta.descricao}</TableCell>
                                            <TableCell>{formatDate(conta.data_vencimento)}</TableCell>
                                            <TableCell className="font-semibold">{formatCurrency(conta.valor_total)}</TableCell>
                                            <TableCell className="text-sm text-muted-foreground">{progresso}</TableCell>
                                            <TableCell className="hidden sm:table-cell">
                                                <Badge variant={statusVariant}>{displayStatus}</Badge>
                                            </TableCell>
                                            <TableCell className="hidden sm:table-cell">
                                                <Badge variant="secondary">{origemDisplay}</Badge>
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

export default TabelaSintetica;