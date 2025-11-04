import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Filter, Printer, DollarSign } from 'lucide-react';
import { DateRangePicker } from '@/components/DateRangePicker';
import { DateRange } from 'react-day-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency } from '@/utils/formatters';
import { ContaPagarComProgresso } from '@/types/contas-pagar';

interface ContasPagarHeaderProps {
    isSupervisao: boolean;
    filtroOrigem: string;
    setFiltroOrigem: (value: string) => void;
    filtroStatus: string;
    setFiltroStatus: (value: string) => void;
    filtroPeriodo: DateRange | undefined;
    setFiltroPeriodo: (range: DateRange | undefined) => void;
    handleOpenForm: (conta?: ContaPagarComProgresso | null) => void;
    totalSintetico: number;
}

const ContasPagarHeader: React.FC<ContasPagarHeaderProps> = ({
    isSupervisao,
    filtroOrigem,
    setFiltroOrigem,
    filtroStatus,
    setFiltroStatus,
    filtroPeriodo,
    setFiltroPeriodo,
    handleOpenForm,
    totalSintetico,
}) => {
    return (
        <>
            <Card>
                <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between space-y-4 md:space-y-0 pb-2">
                    <CardTitle className="text-lg flex items-center"><Filter className="w-4 h-4 mr-2" /> Filtros e Ações</CardTitle>
                    <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
                        {isSupervisao && (
                            <Select value={filtroOrigem} onValueChange={setFiltroOrigem}>
                                <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Filtrar Origem" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="todos">Todas as Origens</SelectItem>
                                    <SelectItem value="contrato">Contrato</SelectItem>
                                    <SelectItem value="assinatura_recorrente">Assinatura</SelectItem>
                                    <SelectItem value="manual">Manual</SelectItem>
                                </SelectContent>
                            </Select>
                        )}
                        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                            <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Filtrar Status" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="todos">Todos os Status</SelectItem>
                                <SelectItem value="quitado">Quitado</SelectItem>
                                <SelectItem value="nao_quitado">Não Quitado</SelectItem>
                            </SelectContent>
                        </Select>
                        <DateRangePicker date={filtroPeriodo} setDate={setFiltroPeriodo} />
                        <Button variant="outline" className="w-full sm:w-auto"><Printer className="w-4 h-4 mr-2" /> Imprimir</Button>
                        <Button onClick={() => handleOpenForm()} className="w-full sm:w-auto"><Plus className="w-4 h-4 mr-2" /> Novo Lançamento</Button>
                    </div>
                </CardHeader>
            </Card>
            
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="border-l-4 border-primary">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium flex items-center"><DollarSign className="w-4 h-4 mr-2" /> Total Sintético</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold">{formatCurrency(totalSintetico)}</div></CardContent>
                </Card>
                {/* Outros cards de resumo aqui */}
            </div>
        </>
    );
};

export default ContasPagarHeader;