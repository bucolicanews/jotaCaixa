import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { History, Eye } from 'lucide-react';
import { ConciliacaoHistorico } from '@/types/conciliacao';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface HistoricoTabProps {
  historico: ConciliacaoHistorico[];
  onViewDetails: (historico: ConciliacaoHistorico) => void;
}

const formatTimestamp = (dateString: string) => format(new Date(dateString), 'dd/MM/yyyy HH:mm', { locale: ptBR });

const HistoricoTab: React.FC<HistoricoTabProps> = ({ historico, onViewDetails }) => {
  return (
    <Card className="col-span-1 md:col-span-3">
        <CardHeader>
            <CardTitle className="flex items-center"><History className="w-5 h-5 mr-2" /> Histórico de Conciliações</CardTitle>
            <CardDescription>Registros de extratos importados e conciliados.</CardDescription>
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