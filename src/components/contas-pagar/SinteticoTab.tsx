import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Edit, Trash2, Eye } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { ContaPagar, ContaPagarComProgresso } from '@/types/contas-pagar';
import { supabase } from '@/integrations/supabase/client';

type ContaStatus = 'pendente' | 'pago' | 'atrasado' | 'cancelada' | 'aberta' | 'parcial' | 'reprogramada';

interface PlanoContasResumo {
    id: string;
    Conta: string;
    Descricao: string;
}

interface SinteticoTabProps {
    loading: boolean;
    contas: (ContaPagar | ContaPagarComProgresso)[];
    isSupervisao: boolean;
    proprietarioId: string | null;
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
    proprietarioId,
    handleOpenDetalhes,
    handleOpenForm,
    handleDelete,
    formatarData,
    formatCurrency,
    getBadgeVariant,
}) => {
    const [planoContasMap, setPlanoContasMap] = useState<Record<string, PlanoContasResumo>>({});

    const carregarPlanoContas = useCallback(async () => {
        if (contas.length === 0) return;
        const ids = [...new Set(contas.flatMap(c => [
            (c as any).id_conta_patrimonial,
            (c as any).id_conta_resultado,
        ]).filter(Boolean))];
        if (ids.length === 0) return;

        const { data } = await supabase
            .from('plano_contas')
            .select('id, "Conta", "Descricao"')
            .in('id', ids);

        const map: Record<string, PlanoContasResumo> = {};
        (data || []).forEach((c: any) => { map[c.id] = c; });
        setPlanoContasMap(map);
    }, [contas]);

    useEffect(() => {
        carregarPlanoContas();
    }, [carregarPlanoContas]);

    const colSpan = isSupervisao ? 9 : 8;

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
                                <TableHead>Contábil</TableHead>
                                <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={colSpan} className="text-center">Carregando...</TableCell></TableRow>
                            ) : contas.length === 0 ? (
                                <TableRow><TableCell colSpan={colSpan} className="text-center">Nenhuma conta a pagar encontrada no período.</TableCell></TableRow>
                            ) : (
                                contas.map((conta) => {
                                    const contaComProgresso = conta as ContaPagarComProgresso;
                                    const parcelasPagas = contaComProgresso.parcelas_pagas || 0;
                                    const podeEditarOuExcluir = parcelasPagas === 0;
                                    const patrimonialId = (conta as any).id_conta_patrimonial;
                                    const resultadoId = (conta as any).id_conta_resultado;
                                    const contaPatrimonial = patrimonialId ? planoContasMap[patrimonialId] : null;
                                    const contaResultado = resultadoId ? planoContasMap[resultadoId] : null;

                                    return (
                                        <TableRow key={conta.id}>
                                            <TableCell>{formatarData(conta.data_vencimento)}</TableCell>
                                            {isSupervisao && <TableCell className="text-sm text-muted-foreground">{contaComProgresso.admin_id || 'Admin'}</TableCell>}
                                            <TableCell className="font-medium">{conta.fornecedor}</TableCell>
                                            <TableCell>{isSupervisao ? contaComProgresso.descricao : ((conta as any).descricao || 'N/A')}</TableCell>
                                            <TableCell className="text-right font-semibold">{formatCurrency((conta as any).valor_total || contaComProgresso.valor || 0)}</TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {`${parcelasPagas} / ${contaComProgresso.parcelas_total || 0}`}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={getBadgeVariant(conta.status as ContaStatus, conta.data_vencimento)}>
                                                    {conta.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                {(contaResultado || contaPatrimonial) ? (
                                                    <div className="flex flex-col gap-0.5 min-w-[160px]">
                                                        {contaResultado && (
                                                            <span className="text-xs text-muted-foreground leading-tight">
                                                                <span className="font-semibold text-blue-600">D</span>
                                                                {' '}{contaResultado.Conta} {contaResultado.Descricao}
                                                            </span>
                                                        )}
                                                        {contaPatrimonial && (
                                                            <span className="text-xs text-muted-foreground leading-tight">
                                                                <span className="font-semibold text-orange-600">C</span>
                                                                {' '}{contaPatrimonial.Conta} {contaPatrimonial.Descricao}
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-muted-foreground text-sm">-</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right space-x-2">
                                                <Button variant="outline" size="sm" onClick={() => handleOpenDetalhes(contaComProgresso)}>
                                                    <Eye className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleOpenForm(contaComProgresso)}
                                                    title="Editar lançamento"
                                                >
                                                    <Edit className="w-4 h-4" />
                                                </Button>
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button
                                                            variant="destructive"
                                                            size="sm"
                                                            disabled={!podeEditarOuExcluir}
                                                            title={!podeEditarOuExcluir ? "Não é possível excluir lançamentos com parcelas já pagas." : "Excluir lançamento"}
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
                                                            <AlertDialogDescription>Esta ação não pode ser desfeita. Isso excluirá permanentemente o lançamento e todas as parcelas não pagas vinculadas.</AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                            <AlertDialogAction onClick={() => handleDelete(conta.id)}>Excluir</AlertDialogAction>
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

export default SinteticoTab;
