import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { History, Eye, Trash2, Loader2 } from 'lucide-react';
import { ConciliacaoHistorico } from '@/types/conciliacao';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

interface HistoricoTabProps {
  historico: ConciliacaoHistorico[];
  onViewDetails: (historico: ConciliacaoHistorico) => void;
  onDeleteAll: () => void; // Novo prop
  isDeleting: boolean; // Novo prop
}

const formatTimestamp = (dateString: string) => format(new Date(dateString), 'dd/MM/yyyy HH:mm', { locale: ptBR });

const HistoricoTab: React.FC<HistoricoTabProps> = ({ historico, onViewDetails, onDeleteAll, isDeleting }) => {
  return (
    <Card className="col-span-1 md:col-span-3">
        <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center"><History className="w-5 h-5 mr-2" /> Histórico de Conciliações</CardTitle>
            <AlertDialog>
                <AlertDialogTrigger asChild>
                    <Button 
                        variant="destructive" 
                        size="sm" 
                        disabled={historico.length === 0 || isDeleting}
                    >
                        {isDeleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                        Limpar Histórico ({historico.length})
                    </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Tem certeza que deseja limpar o histórico?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta ação é irreversível e removerá todos os {historico.length} registros de conciliação. Os lançamentos já salvos na conta bancária NÃO serão removidos.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={onDeleteAll} disabled={isDeleting}>
                            {isDeleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : 'Confirmar Limpeza'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </CardHeader>
        <CardContent>
            <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Data Conciliação</TableHead>
                            <TableHead>Conta Bancária</TableHead>
                            <TableHead>Nome do Arquivo</TableHead>
                            <TableHead className="text-right">Transações Salvas</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {historico.length === 0 ? (
                            <TableRow><TableCell colSpan={5} className="text-center h-24">Nenhum histórico encontrado.</TableCell></TableRow>
                        ) : (
                            historico.map(h => (
                                <TableRow key={h.id}>
                                    <TableCell>{formatTimestamp(h.criado_em)}</TableCell>
                                    <TableCell className="font-medium">{h.saldo_contas?.nome || 'N/A'}</TableCell>
                                    <TableCell className="font-mono text-sm">{h.nome_arquivo}</TableCell>
                                    <TableCell className="text-right">{h.extrato_json?.length || 0}</TableCell>
                                    <TableCell className="text-right">
                                        <Button 
                                            variant="outline" 
                                            size="sm" 
                                            onClick={() => onViewDetails(h)}
                                        >
                                            <Eye className="w-4 h-4 mr-2" /> Detalhes
                                        </Button>
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

export default HistoricoTab;