import React, { useState } from 'react';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Edit, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { PlanoContas } from '@/types/plano-contas';
import EditableCell from '@/components/contabilidade/EditableCell';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Mapeamento de cores para os níveis hierárquicos
const NIVEL_COLORS: Record<number, string> = {
    1: 'bg-blue-500/10 hover:bg-blue-500/20',
    2: 'bg-green-500/10 hover:bg-green-500/20',
    3: 'bg-yellow-500/10 hover:bg-yellow-500/20',
    4: 'bg-red-500/10 hover:bg-red-500/20',
    5: 'bg-purple-500/10 hover:bg-purple-500/20',
};

interface NovaContaInicial {
    Conta: string;
    Analitica: 'Sim' | 'Não';
}

interface PlanoContasTableProps {
    contas: PlanoContas[];
    carregando: boolean;
    mascaraAtiva: string | null;
    
    // Handlers passados do pai
    handleEdit: (conta: PlanoContas) => void;
    handleDelete: (id: string) => Promise<void>;
    handleInlineSaveSuccess: () => void;
    
    // Handlers para criação hierárquica
    setContaSelecionada: (conta: PlanoContas | null) => void;
    setNovaContaInicial: (data: NovaContaInicial | null) => void;
    setDialogAberto: (open: boolean) => void;
}

const PlanoContasTable: React.FC<PlanoContasTableProps> = ({
    contas,
    carregando,
    mascaraAtiva,
    handleEdit,
    handleDelete,
    handleInlineSaveSuccess,
    setContaSelecionada,
    setNovaContaInicial,
    setDialogAberto,
}) => {
    const [contaClicada, setContaClicada] = useState<PlanoContas | null>(null);
    const [popoverOpen, setPopoverOpen] = useState(false);

    const handleRowClick = (conta: PlanoContas) => {
        setContaClicada(conta);
        setPopoverOpen(true);
    };

    const handleOpenNewConta = (nivel: 'acima' | 'abaixo') => {
        if (!contaClicada) return;
        
        const parts = contaClicada.Conta.split('.').filter(p => p.length > 0);
        const nivelAtual = parts.length;
        let novoCodigo = '';
        let novaAnalitica: 'Sim' | 'Não' = 'Não';
        
        const maskParts = mascaraAtiva?.split('.') || [];
        
        if (nivel === 'abaixo') {
            const proximoNivel = nivelAtual; 
            const paddingLength = maskParts[proximoNivel]?.length || 4; 
            const novoSegmento = String(1).padStart(paddingLength, '0');
            
            novoCodigo = contaClicada.Conta + '.' + novoSegmento;
            novaAnalitica = 'Sim'; 
            
        } else {
            const codigoPai = parts.slice(0, nivelAtual - 1).join('.');
            const segmentoAtual = parts[nivelAtual - 1];
            const paddingLength = segmentoAtual.length;
            
            const contasNoMesmoNivel = contas.filter(c => {
                const cParts = c.Conta.split('.').filter(p => p.length > 0);
                return cParts.length === nivelAtual && c.Conta.startsWith(codigoPai);
            });
            
            const maxSegmento = contasNoMesmoNivel.reduce((max, c) => {
                const cParts = c.Conta.split('.').filter(p => p.length > 0);
                return Math.max(max, parseInt(cParts[nivelAtual - 1], 10));
            }, parseInt(segmentoAtual, 10));
            
            const novoSegmentoNumerico = maxSegmento + 1;
            const novoSegmentoFormatado = String(novoSegmentoNumerico).padStart(paddingLength, '0');
            
            if (nivelAtual === 1) {
                novoCodigo = novoSegmentoFormatado;
            } else {
                novoCodigo = `${codigoPai}.${novoSegmentoFormatado}`;
            }
            
            novaAnalitica = 'Não'; 
        }
        
        setContaSelecionada(null); 
        setNovaContaInicial({ Conta: novoCodigo, Analitica: novaAnalitica }); 
        setDialogAberto(true);
        setPopoverOpen(false);
    };

    return (
        <Card>
            <CardTitle className="text-xl p-6 pb-0">Contas Cadastradas ({contas.length})</CardTitle>
            <CardContent>
                {/* CORREÇÃO: O div que define a rolagem vertical e horizontal */}
                <div className="relative overflow-x-auto overflow-y-auto max-h-[60vh]"> 
                    <Table>
                        <TableHeader className="sticky top-0 bg-background/95 backdrop-blur-sm z-20 shadow-sm">
                            <TableRow>
                                <TableHead className="w-[150px]">Conta</TableHead>
                                <TableHead className="w-[100px]">Cód. Reduzido</TableHead>
                                <TableHead>Descrição</TableHead>
                                <TableHead className="w-[100px] text-center">Analítica</TableHead>
                                <TableHead className="w-[100px] text-center">Conta Caixa/Banco</TableHead>
                                <TableHead className="w-[100px] text-center">Conta Patrimonial</TableHead>
                                <TableHead className="w-[100px] text-center">Conta de Resultado</TableHead>
                                <TableHead className="w-[100px] text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {carregando ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="text-center py-8">
                                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                                    </TableCell>
                                </TableRow>
                            ) : contas.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="text-center py-4 text-muted-foreground">
                                        Nenhuma conta encontrada com os filtros aplicados.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                contas.map((conta) => {
                                    // Calcula o nível da conta (número de segmentos)
                                    const nivel = conta.Conta.split('.').filter(p => p.length > 0).length;
                                    const nivelClass = NIVEL_COLORS[nivel] || 'hover:bg-secondary/50';
                                    
                                    // Aplica indentação
                                    const paddingLeft = (nivel - 1) * 10;
                                    
                                    // Define a cor de fundo da linha
                                    const rowClassName = cn(
                                        nivelClass,
                                        contaClicada?.id === conta.id && popoverOpen && "bg-secondary/50"
                                    );

                                    return (
                                        <Popover open={contaClicada?.id === conta.id && popoverOpen} onOpenChange={setPopoverOpen} key={conta.id}>
                                            <PopoverTrigger asChild>
                                                <TableRow 
                                                    onClick={() => handleRowClick(conta)}
                                                    className={cn("cursor-pointer", rowClassName)}
                                                >
                                                    <TableCell className="font-mono text-sm" style={{ paddingLeft: `${paddingLeft + 16}px` }}>
                                                        <EditableCell
                                                            id={conta.id}
                                                            initialValue={conta.Conta}
                                                            fieldName="Conta"
                                                            onSaveSuccess={handleInlineSaveSuccess}
                                                            isEditable={true}
                                                            className="font-mono text-sm"
                                                        />
                                                    </TableCell>
                                                    <TableCell className="text-sm">
                                                        <EditableCell
                                                            id={conta.id}
                                                            initialValue={conta.codigo_reduzido}
                                                            fieldName="codigo_reduzido"
                                                            onSaveSuccess={handleInlineSaveSuccess}
                                                            isEditable={true}
                                                            className="text-sm"
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        <EditableCell
                                                            id={conta.id}
                                                            initialValue={conta.Descricao}
                                                            fieldName="Descricao"
                                                            onSaveSuccess={handleInlineSaveSuccess}
                                                            isEditable={true}
                                                        />
                                                    </TableCell>
                                                    
                                                    {/* Analítica (Select) */}
                                                    <TableCell className="text-center">
                                                        <EditableCell
                                                            id={conta.id}
                                                            initialValue={conta.Analitica}
                                                            fieldName="Analitica"
                                                            onSaveSuccess={handleInlineSaveSuccess}
                                                            isEditable={true}
                                                            type="select"
                                                            options={["Sim", "Não"]}
                                                        />
                                                    </TableCell>
                                                    
                                                    {/* Conta Caixa/Banco (Boolean) */}
                                                    <TableCell className="text-center">
                                                        {conta.Analitica === 'Sim' ? (
                                                            <EditableCell
                                                                id={conta.id}
                                                                initialValue={conta.is_conta_caixa_banco}
                                                                fieldName="is_conta_caixa_banco"
                                                                onSaveSuccess={handleInlineSaveSuccess}
                                                                isEditable={true}
                                                                type="boolean"
                                                            />
                                                        ) : (
                                                            '-'
                                                        )}
                                                    </TableCell>
                                                    
                                                    {/* Conta Patrimonial (Boolean) */}
                                                    <TableCell className="text-center">
                                                        {conta.Analitica === 'Sim' ? (
                                                            <EditableCell
                                                                id={conta.id}
                                                                initialValue={conta.is_conta_patrimonial}
                                                                fieldName="is_conta_patrimonial"
                                                                onSaveSuccess={handleInlineSaveSuccess}
                                                                isEditable={true}
                                                                type="boolean"
                                                            />
                                                        ) : (
                                                            '-'
                                                        )}
                                                    </TableCell>
                                                    
                                                    {/* Conta de Resultado (Boolean) */}
                                                    <TableCell className="text-center">
                                                        {conta.Analitica === 'Sim' ? (
                                                            <EditableCell
                                                                id={conta.id}
                                                                initialValue={conta.is_conta_resultado}
                                                                fieldName="is_conta_resultado"
                                                                onSaveSuccess={handleInlineSaveSuccess}
                                                                isEditable={true}
                                                                type="boolean"
                                                            />
                                                        ) : (
                                                            '-'
                                                        )}
                                                    </TableCell>
                                                    
                                                    <TableCell className="text-right">
                                                        <div className="flex justify-end space-x-2">
                                                            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleEdit(conta); }}>
                                                                <Edit className="w-4 h-4" />
                                                            </Button>
                                                            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleDelete(conta.id); }}>
                                                                <Trash2 className="w-4 h-4 text-red-500" />
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-2 flex flex-col space-y-1" align="end">
                                                <Button variant="ghost" size="sm" onClick={() => handleOpenNewConta('abaixo')}>
                                                    <ArrowDown className="w-4 h-4 mr-2" /> Criar Conta Nível Abaixo
                                                </Button>
                                                <Button variant="ghost" size="sm" onClick={() => handleOpenNewConta('acima')}>
                                                    <ArrowUp className="w-4 h-4 mr-2" /> Criar Conta Nível Acima
                                                </Button>
                                            </PopoverContent>
                                        </Popover>
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

export default PlanoContasTable;