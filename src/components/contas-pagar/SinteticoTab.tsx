import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Edit, Trash2, Eye } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { ContaPagar, ContaPagarComProgresso } from '@/types/contas-pagar';

// Definindo o tipo ContaStatus para incluir os status de parcela para uso no getBadgeVariant
type ContaStatus = 'pendente' | 'pago' | 'atrasado' | 'cancelada' | 'aberta' | 'parcial' | 'reprogramada';

interface SinteticoTabProps {
    loading: boolean;
    contas: (ContaPagar | ContaPagarComProgresso)[];
    isSupervisao: boolean;
    handleOpenDetalhes: (conta: ContaPagarComProgresso) => void;
    handleOpenForm: (conta: ContaPagarComProgresso) => void;
    handleDelete: (id: string) => void;
    formatarData: (date: string) => string;
    formatCurrency: (value: number) => string;
    getBadgeVariant: (status: ContaStatus, dataVencimento: string) => 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning';
}

const SinteticoTab: React.FC<SinteticoTabProps> = ({
    loading,
    contas,
    isSupervisao,
    handleOpenDetalhes,
    handleOpenForm,
    handleDelete,
    formatarData,
    formatCurrency,
    getBadgeVariant,
}) => {
    return (
        <Card>
            <CardHeader><CardTitle>Lançamentos Sintéticos</CardTitle></CardHeader>
            <CardContent>
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Vencimento</TableHead>
                                {isSupervisao && <TableHead>ID {isSupervisao ? 'Admin' : 'Empresa'}</TableHead>}
                                <TableHead>Fornecedor</TableHead>
                                <TableHead>Descrição</TableHead>
                                <TableHead className="text-right">Valor Total</TableHead>
                                <TableHead>Progresso</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={isSupervisao ? 8 : 7} className="text-center">Carregando...</TableCell></TableRow>
                            ) : contas.length === 0 ? (
                                <TableRow><TableCell colSpan={isSupervisao ? 8 : 7} className="text-center">Nenhuma conta a pagar encontrada no período.</TableCell></TableRow>
                            ) : (
                                contas.map((conta) => (
                                    <TableRow key={conta.id}>
                                        <TableCell>{formatarData(conta.data_vencimento)}</TableCell>
                                        {isSupervisao && <TableCell className="text-sm text-muted-foreground">{(conta as unknown as ContaPagarComProgresso).admin_id || 'Admin'}</TableCell>}
                                        <TableCell className="font-medium">{conta.fornecedor}</TableCell>
                                        <TableCell>{isSupervisao ? (conta as ContaPagarComProgresso).descricao : ((conta as any).descricao || 'N/A')}</TableCell>
                                        <TableCell className="text-right font-semibold">{formatCurrency((conta as any).valor_total || (conta as ContaPagar).valor || 0)}</TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {`${(conta as ContaPagarComProgresso).parcelas_pagas || 0} / ${(conta as ContaPagarComProgresso).parcelas_total || 0}`}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={getBadgeVariant(conta.status as ContaStatus, conta.data_vencimento)}>
                                                {conta.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right space-x-2">
                                            <Button variant="outline" size="sm" onClick={() => handleOpenDetalhes(conta as ContaPagarComProgresso)}>
                                                <Eye className="w-4 h-4" />
                                            </Button>
                                            <Button variant="outline" size="sm" onClick={() => handleOpenForm(conta as ContaPagarComProgresso)}>
                                                <Edit className="w-4 h-4" />
                                            </Button>
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="destructive" size="sm"><Trash2 className="w-4 h-4" /></Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
                                                        <AlertDialogDescription>Esta ação não pode ser desfeita. Isso excluirá permanentemente o lançamento.</AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleDelete(conta.id)}>Excluir</AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
};

export default SinteticoTab;