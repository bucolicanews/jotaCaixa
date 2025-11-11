import React from 'react';
import { PlanoContas } from '@/types/plano-contas';
import { Loader2, Edit, Trash2, ArrowUp, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import EditableCell from './EditableCell';
import EditableSelectCell from '@/components/contabilidade/EditableSelectCell'; // Usando alias @/

// Mapeamento de cores para os níveis hierárquicos
const NIVEL_COLORS: Record<number, string> = {
    1: 'bg-blue-500/10 hover:bg-blue-500/20',
    2: 'bg-green-500/10 hover:bg-green-500/20',
    3: 'bg-yellow-500/10 hover:bg-yellow-500/20',
    4: 'bg-red-500/10 hover:bg-red-500/20',
    5: 'bg-purple-500/10 hover:bg-purple-500/20',
};

// Componentes utilitários de Tabela (Movidos para cá para modularidade)
const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  function TableRow({ className, children, ...props }, ref) {
    return (
      <tr
        ref={ref}
        className={cn("border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted", className)}
        {...props}
      >
        {children}
      </tr>
    );
  }
);

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  function TableHead({ className, children, ...props }, ref) {
    return (
      <th
        ref={ref}
        className={cn("h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0", className)}
        {...props}
      >
        {children}
      </th>
    );
  }
);

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  function TableCell({ className, children, ...props }, ref) {
    return (
      <td
        ref={ref}
        className={cn("p-4 align-middle [&:has([role=checkbox])]:pr-0", className)}
        {...props}
      >
        {children}
      </td>
    );
  }
);

interface PlanoContasTableProps {
    contas: PlanoContas[];
    carregandoContas: boolean;
    handleContaClick: (conta: PlanoContas) => void;
    handleEdit: (conta: PlanoContas) => void;
    handleDelete: (id: string) => Promise<void>;
    handleInlineSaveSuccess: () => void;
    
    // Props do Popover
    contaClicada: PlanoContas | null;
    popoverOpen: boolean;
    setPopoverOpen: (open: boolean) => void;
    handleNovaContaAbaixo: (contaPai: PlanoContas) => void;
    handleNovaContaNivel: (contaIrma: PlanoContas) => void;
}

const PlanoContasTable: React.FC<PlanoContasTableProps> = ({
    contas,
    carregandoContas,
    handleContaClick,
    handleEdit,
    handleDelete,
    handleInlineSaveSuccess,
    contaClicada,
    popoverOpen,
    setPopoverOpen,
    handleNovaContaAbaixo,
    handleNovaContaNivel,
}) => {
    if (carregandoContas) {
        return (
            <div className="flex justify-center items-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (contas.length === 0) {
        return (
            <p className="text-center text-gray-500 mt-8">
                Nenhuma conta encontrada. Comece importando ou cadastrando uma nova.
            </p>
        );
    }

    return (
        <>
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead>
                        <TableRow className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10">
                            <TableHead className="w-[150px]">Conta</TableHead>
                            <TableHead className="w-[100px] text-center">Reduzido</TableHead>
                            <TableHead>Descrição</TableHead>
                            <TableHead className="w-[100px] text-center">Analítica</TableHead>
                            <TableHead className="w-[100px] text-center">Ações</TableHead>
                        </TableRow>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {contas.map((conta) => {
                            const nivel = conta.Conta.split('.').length;
                            const isContaPai = conta.Analitica === 'Não';
                            
                            return (
                                <TableRow 
                                    key={conta.id} 
                                    className={cn(
                                        NIVEL_COLORS[nivel] || 'hover:bg-gray-50/50',
                                        isContaPai && 'font-semibold'
                                    )}
                                >
                                    <TableCell 
                                        className={cn(
                                            "font-mono cursor-pointer",
                                            isContaPai && "text-primary hover:underline"
                                        )}
                                        onClick={() => handleContaClick(conta)}
                                    >
                                        {conta.Conta}
                                    </TableCell>
                                    
                                    <TableCell className="text-center">
                                        <EditableCell
                                            id={conta.id}
                                            initialValue={conta.codigo_reduzido}
                                            fieldName="codigo_reduzido"
                                            onSaveSuccess={handleInlineSaveSuccess}
                                            isEditable={true} 
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
                                    
                                    <TableCell className="text-center">
                                        <EditableSelectCell
                                            id={conta.id}
                                            initialValue={conta.Analitica as 'Sim' | 'Não'}
                                            fieldName="Analitica"
                                            onSaveSuccess={handleInlineSaveSuccess}
                                            isEditable={true} 
                                        />
                                    </TableCell>
                                    
                                    <TableCell className="text-center">
                                        <div className="flex justify-center space-x-2">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleEdit(conta)}
                                                title="Editar Conta"
                                            >
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleDelete(conta.id)}
                                                title="Excluir Conta"
                                                className="text-red-500 hover:text-red-700"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            
            {/* Popover para Ações Hierárquicas */}
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                <PopoverTrigger asChild>
                    {/* Trigger invisível, ativado via estado */}
                    <Button variant="ghost" className="hidden" />
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2" align="start" side="right">
                    <p className="text-sm font-semibold mb-2">Ações para {contaClicada?.Conta}</p>
                    <div className="flex flex-col space-y-1">
                        <Button 
                            variant="ghost" 
                            className="justify-start"
                            onClick={() => contaClicada && handleNovaContaAbaixo(contaClicada)}
                        >
                            <ArrowRight className="h-4 w-4 mr-2" /> Adicionar Conta Abaixo
                        </Button>
                        <Button 
                            variant="ghost" 
                            className="justify-start"
                            onClick={() => contaClicada && handleNovaContaNivel(contaClicada)}
                        >
                            <ArrowUp className="h-4 w-4 mr-2" /> Adicionar Conta no Mesmo Nível
                        </Button>
                    </div>
                </PopoverContent>
            </Popover>
        </>
    );
};

export default PlanoContasTable;