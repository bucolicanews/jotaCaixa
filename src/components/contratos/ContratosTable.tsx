import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Edit, Trash2, Eye, Lock, Unlock, Loader2 } from 'lucide-react';
import { ContratoGerado } from '@/types/contratos';
import { format, parseISO } from 'date-fns';
// import { cn } from '@/lib/utils'; // REMOVIDO

type ContratoComCliente = ContratoGerado & { tbl_empresas_clientes: { nome: string } | null }; // RENOMEADO
type ContratoStatus = ContratoGerado['status'];

interface ContratosTableProps {
    list: ContratoComCliente[];
    isSupervisao: boolean;
    empresaId: string | null;
    carregando: boolean;
    
    // Handlers
    handleOpenAcoes: (contrato: ContratoGerado) => void;
    handleEditContract: (contrato: ContratoGerado) => void;
    handleDeleteContract: (contrato: ContratoGerado) => Promise<void>;
    handleBlockContract: (contrato: ContratoGerado) => Promise<void>;
    handleReactivateContract: (contrato: ContratoGerado) => Promise<void>;
}

const getStatusBadge = (status: ContratoStatus) => {
    switch (status) {
        case 'pendente_assinatura': return <Badge variant="warning">Pendente Assinatura</Badge>;
        case 'ativo': return <Badge variant="default">Ativo</Badge>;
        case 'cancelado': return <Badge variant="destructive">Cancelado</Badge>;
        case 'bloqueado': return <Badge variant="destructive">Bloqueado</Badge>;
        case 'concluido': return <Badge variant="success">Concluído</Badge>;
        case 'rascunho': return <Badge variant="secondary">Rascunho</Badge>;
        default: return <Badge variant="secondary">{status}</Badge>;
    }
};

const ContratosTable: React.FC<ContratosTableProps> = ({
    list,
    isSupervisao,
    empresaId,
    carregando,
    handleOpenAcoes,
    handleEditContract,
    handleDeleteContract,
    handleBlockContract,
    handleReactivateContract,
}) => {
    
    if (carregando) {
        return (
            <div className="flex justify-center items-center h-32">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="overflow-x-auto">
            <Table>
                <TableHeader><TableRow>
                    {isSupervisao && <TableHead>Empresa</TableHead>}
                    <TableHead>Cliente</TableHead><TableHead>Valor</TableHead><TableHead>Data Início</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                    {list.length === 0 ? (
                        <TableRow><TableCell colSpan={isSupervisao ? 6 : 5} className="text-center py-4 text-muted-foreground">Nenhum contrato encontrado.</TableCell></TableRow>
                    ) : (
                        list.map(c => {
                            const canEdit = c.status === 'rascunho' || c.status === 'pendente_assinatura';
                            const isMyContract = c.proprietario_id === empresaId;
                            const isCanceledOrBlocked = c.status === 'cancelado' || c.status === 'bloqueado';
                            
                            return (
                                <TableRow key={c.id}>
                                    {isSupervisao && <TableCell className="text-sm text-muted-foreground">{c.tbl_empresas_clientes?.nome || 'N/A'}</TableCell>}
                                    <TableCell className="font-medium">{c.tbl_empresas_clientes?.nome || 'N/A'}</TableCell>
                                    <TableCell>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c.valor_total)}</TableCell>
                                    <TableCell>{format(parseISO(c.data_inicio), 'dd/MM/yyyy')}</TableCell>
                                    <TableCell>{getStatusBadge(c.status)}</TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end space-x-2">
                                            {canEdit && isMyContract && (
                                                <Button 
                                                    variant="ghost" 
                                                    size="icon" 
                                                    onClick={() => handleEditContract(c)}
                                                    title="Editar Contrato"
                                                >
                                                    <Edit className="w-4 h-4" />
                                                </Button>
                                            )}
                                            
                                            {/* Botão de Bloqueio/Desbloqueio */}
                                            {isMyContract && (
                                                isCanceledOrBlocked ? (
                                                    <Button 
                                                        variant="default" 
                                                        size="icon" 
                                                        onClick={() => handleReactivateContract(c)}
                                                        title="Desbloquear Contrato (Reativa Parcelas)"
                                                    >
                                                        <Unlock className="w-4 h-4" />
                                                    </Button>
                                                ) : (
                                                    <Button 
                                                        variant="destructive" 
                                                        size="icon" 
                                                        onClick={() => handleBlockContract(c)}
                                                        title="Bloquear Contrato (Bloqueia Parcelas)"
                                                    >
                                                        <Lock className="w-4 h-4" />
                                                    </Button>
                                                )
                                            )}
                                            
                                            {/* Botão de Excluir (Aparece se for rascunho ou cancelado/bloqueado) */}
                                            {(canEdit || isCanceledOrBlocked) && isMyContract && (
                                                <Button 
                                                    variant="ghost" 
                                                    size="icon" 
                                                    onClick={() => handleDeleteContract(c)}
                                                    title="Excluir Contrato"
                                                >
                                                    <Trash2 className="w-4 h-4 text-red-500" />
                                                </Button>
                                            )}
                                            
                                            <Button variant="outline" size="sm" onClick={() => handleOpenAcoes(c)}>
                                                <Eye className="w-4 h-4 mr-2" /> Ver Ações
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            );
                        })
                    )}
                </TableBody>
            </Table>
        </div>
    );
};

export default ContratosTable;