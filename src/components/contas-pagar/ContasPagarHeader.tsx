import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Filter, Printer, DollarSign, Search } from 'lucide-react';
import { DateRangePicker } from '@/components/DateRangePicker';
import { DateRange } from 'react-day-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency } from '@/utils/formatters';
import { ContaPagar, ContaPagarComProgresso, ExtendedParcelaPagar } from '@/types/contas-pagar';
import { usePrint } from '@/hooks/use-print';
import ReactDOMServer from 'react-dom/server';
import ContasPagarPrint from './ContasPagarPrint';
import { showError } from '@/utils/toast';
import { format as formatDateFns } from 'date-fns';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

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
    // New props for printing
    contas: (ContaPagar | ContaPagarComProgresso)[];
    parcelas: ExtendedParcelaPagar[];
    pagamentos: any[];
    activeTab: string;
    // New props for filtering
    filtroTexto: string;
    setFiltroTexto: (text: string) => void;
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
    contas,
    parcelas,
    pagamentos,
    activeTab,
    filtroTexto,
    setFiltroTexto,
}) => {
    const { printContent } = usePrint();

    const getDataForPrint = () => {
        let data: any[] = [];
        let headers: string[] = [];

        if (activeTab === 'sintetico') {
            headers = ['ID Conta', 'Fornecedor', 'Descrição', 'Vencimento', 'Valor Total', 'Progresso', 'Status', 'Origem'];
            data = (contas as ContaPagarComProgresso[]).map(c => ({
                'ID Conta': c.id,
                'Fornecedor': c.fornecedor,
                'Descrição': c.descricao,
                'Vencimento': formatDateFns(new Date(c.data_vencimento + 'T00:00:00'), 'dd/MM/yyyy'),
                'Valor Total': c.valor_total,
                'Progresso': `${c.parcelas_pagas || 0}/${c.parcelas_total || 0}`,
                'Status': c.status,
                'Origem': c.origem,
            }));
        } else if (activeTab === 'parcelas') {
            headers = ['ID Parcela', 'ID Conta', 'Fornecedor', 'Descrição', 'Nº Parcela', 'Vencimento', 'Valor Parcela', 'Vlr Pago', 'Status'];
            data = parcelas.map(p => ({
                'ID Parcela': p.id,
                'ID Conta': p.conta_pagar_id,
                'Fornecedor': p.admin_contas_pagar?.fornecedor || 'N/A',
                'Descrição': p.admin_contas_pagar?.descricao || 'N/A',
                'Nº Parcela': p.numero_parcela,
                'Vencimento': formatDateFns(new Date(p.data_vencimento + 'T00:00:00'), 'dd/MM/yyyy'),
                'Valor Parcela': p.valor_parcela,
                'Vlr Pago': p.valor_pago || 0,
                'Status': p.status,
            }));
        } else if (activeTab === 'pagamentos') {
            headers = ['ID Pagamento', 'Data Pagamento', 'ID Conta', 'Fornecedor', 'Descrição', 'Valor Pago', 'Conta Origem'];
            data = pagamentos.map(p => ({
                'ID Pagamento': p.id,
                'Data Pagamento': formatDateFns(new Date(p.data_pagamento), 'dd/MM/yyyy HH:mm'),
                'ID Conta': p.admin_parcelas_pagar?.admin_contas_pagar?.id || 'N/A',
                'Fornecedor': p.admin_parcelas_pagar?.admin_contas_pagar?.fornecedor || 'N/A',
                'Descrição': p.admin_parcelas_pagar?.admin_contas_pagar?.descricao || 'N/A',
                'Valor Pago': p.valor_pago,
                'Conta Origem': p.saldo_contas?.nome || 'N/A',
            }));
        }
        return { data, headers };
    };

    const handlePrint = (orientation: 'portrait' | 'landscape') => {
        const { data } = getDataForPrint();
        if (data.length === 0) {
            showError('Nenhum dado para imprimir.');
            return;
        }
        
        const printComponent = (
            <ContasPagarPrint 
                data={data} 
                activeTab={activeTab} 
                filtroPeriodo={filtroPeriodo} 
            />
        );

        const htmlContent = ReactDOMServer.renderToStaticMarkup(printComponent);
        printContent(htmlContent, `Relatório CP - ${activeTab}`, orientation);
    };

    return (
        <>
            <Card>
                <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between space-y-4 md:space-y-0 pb-2">
                    <CardTitle className="text-lg flex items-center"><Filter className="w-4 h-4 mr-2" /> Filtros e Ações</CardTitle>
                    <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
                        <div className="relative w-full sm:w-[200px]">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar ID, Fornecedor, Descrição..."
                                value={filtroTexto}
                                onChange={(e) => setFiltroTexto(e.target.value)}
                                className="pl-10"
                            />
                        </div>
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
                        
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" className="w-full sm:w-auto">
                                    <Printer className="w-4 h-4 mr-2" /> Imprimir
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handlePrint('portrait')}>
                                    Imprimir (Retrato)
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handlePrint('landscape')}>
                                    Imprimir (Paisagem)
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        
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