import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { DollarSign } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ExtendedParcelaPagar } from '@/types/contas-pagar';

// Definindo o tipo ContaStatus para incluir os status de parcela para uso no getBadgeVariant
type ContaStatus = 'pendente' | 'pago' | 'atrasado' | 'cancelada' | 'aberta' | 'parcial' | 'reprogramada';

interface ParcelasTabProps {
    loading: boolean;
    parcelas: ExtendedParcelaPagar[];
    totalParcelas: number;
    handleOpenPagamento: (parcela: ExtendedParcelaPagar, fornecedor: string) => void;
    formatarData: (date: string) => string;
    formatCurrency: (value: number) => string;
    formatarOrigem: (origem: string) => string;
    getBadgeVariant: (status: ContaStatus, dataVencimento: string) => 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning';
}

const ParcelasTab: React.FC<ParcelasTabProps> = ({
    loading,
    parcelas,
    totalParcelas,
    handleOpenPagamento,
    formatarData,
    formatCurrency,
    formatarOrigem,
    getBadgeVariant,
}) => {
    return (
        <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="border-l-4 border-secondary">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Total Parcelas</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold">{formatCurrency(totalParcelas)}</div></CardContent>
                </Card>
                {/* Outros cards de resumo de parcelas */}
            </div>
            
            <Card>
                <CardHeader><CardTitle>Parcelas a Pagar</CardTitle></CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Vencimento</TableHead>
                                    <TableHead>Fornecedor</TableHead>
                                    <TableHead>Descrição</TableHead>
                                    <TableHead className="text-right">Valor Parcela</TableHead>
                                    <TableHead className="text-right">Valor Pago</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Origem</TableHead>
                                    <TableHead className="text-right">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow><TableCell colSpan={8} className="text-center">Carregando...</TableCell></TableRow>
                                ) : parcelas.length === 0 ? (
                                    <TableRow><TableCell colSpan={8} className="text-center">Nenhuma parcela encontrada no período.</TableCell></TableRow>
                                ) : (
                                    parcelas.map((p) => {
                                        const statusVariant = getBadgeVariant(p.status as ContaStatus, p.data_vencimento);
                                        const isPaga = p.status === 'paga';
                                        const fornecedor = p.admin_contas_pagar?.fornecedor || 'N/A';
                                        
                                        return (
                                            <TableRow key={p.id}>
                                                <TableCell>{formatarData(p.data_vencimento)}</TableCell>
                                                <TableCell>{fornecedor}</TableCell>
                                                <TableCell>{p.admin_contas_pagar?.descricao || 'N/A'}</TableCell>
                                                <TableCell className="text-right">{formatCurrency(p.valor_parcela)}</TableCell>
                                                <TableCell className="text-right">{formatCurrency(p.valor_pago || 0)}</TableCell>
                                                <TableCell><Badge variant={statusVariant}>{p.status}</Badge></TableCell>
                                                <TableCell>{formatarOrigem(p.admin_contas_pagar?.origem || 'manual')}</TableCell>
                                                <TableCell className="text-right">
                                                    {!isPaga && (
                                                        <Button size="sm" onClick={() => handleOpenPagamento(p, fornecedor)}>
                                                            <DollarSign className="w-4 h-4 mr-2" /> Pagar
                                                        </Button>
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
        </div>
    );
};

export default ParcelasTab;