import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Search, Filter, Printer, PlusCircle, FileSignature } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Link } from 'react-router-dom';
import { usePrint } from '@/hooks/use-print';
import { ContratoGerado } from '@/types/contratos';
import ContratosPrint from './ContratosPrint';
import ReactDOMServer from 'react-dom/server';
import { showError } from '@/utils/toast';
import { ContratoStatus, Ordenacao } from '@/hooks/use-contratos'; // IMPORTADO
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { format as formatDateFns } from 'date-fns';

interface ContratosHeaderProps {
    contratosParaExibir: ContratoGerado[];
    isSupervisao: boolean;
    canCreateContract: boolean;
    
    // Filters/Sorting Props
    filtroTexto: string;
    setFiltroTexto: (text: string) => void;
    filtroStatus: ContratoStatus; // Tipo corrigido
    setFiltroStatus: (status: ContratoStatus) => void; // Tipo corrigido
    ordenacao: Ordenacao; // Tipo corrigido
    setOrdenacao: (order: Ordenacao) => void; // Tipo corrigido
    activeContratoTab: string;
}

const ContratosHeader: React.FC<ContratosHeaderProps> = ({
    contratosParaExibir,
    isSupervisao,
    canCreateContract,
    filtroTexto,
    setFiltroTexto,
    filtroStatus,
    setFiltroStatus,
    ordenacao,
    setOrdenacao,
    activeContratoTab,
}) => {
    const { printContent } = usePrint();

    const getDataForPrint = () => {
        // Lógica de getDataForPrint (mantida)
        if (contratosParaExibir.length === 0) return { data: [], headers: [] };
        
        const headers = ['Cliente', 'Empresa Proprietária', 'Valor Total', 'Data Início', 'Status', 'Link Assinatura'];
        const data = contratosParaExibir.map(c => ({
            'Cliente': (c as any).clientes?.nome || 'N/A',
            'Empresa Proprietária': c.proprietario_id || 'Admin',
            'Valor Total': c.valor_total,
            'Data Início': formatDateFns(new Date(c.data_inicio), 'dd/MM/yyyy'),
            'Status': c.status,
            'Link Assinatura': c.link_assinatura_externo || `Contrato ID: ${c.id}`,
        }));
        
        return { data, headers };
    };

    const handlePrint = (orientation: 'portrait' | 'landscape') => {
        const { data } = getDataForPrint();
        if (data.length === 0) {
            showError('Nenhum dado para imprimir.');
            return;
        }
        
        const tituloRelatorio = activeContratoTab.replace('_', ' ').toUpperCase();
        
        const printComponent = (
            <ContratosPrint
                data={contratosParaExibir}
                titulo={`Relatório de Contratos - ${tituloRelatorio}`}
                isSupervisao={isSupervisao}
            />
        );

        const htmlContent = ReactDOMServer.renderToStaticMarkup(printComponent);
        printContent(htmlContent, `Relatório Contratos - ${tituloRelatorio}`, orientation);
    };

    return (
        <>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <h1 className="text-2xl md:text-3xl font-bold flex items-center">
                    <FileSignature className="w-6 h-6 mr-2" /> Gerenciamento de Contratos
                </h1>
                <div className="flex space-x-2 w-full sm:w-auto">
                    <Link to="/contratos/novo">
                        <Button className="w-full sm:w-auto" disabled={!canCreateContract || isSupervisao}>
                            <PlusCircle className="w-4 h-4 mr-2" />
                            Novo Contrato
                        </Button>
                    </Link>
                </div>
            </div>

            <Card className="mb-6">
                <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center"><Filter className="w-4 h-4 mr-2" /> Filtros e Ações</CardTitle>
                </CardHeader>
                <CardContent>
                    {/* Ajustado para flex-col em mobile e flex-row em md:flex-row */}
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="relative w-full md:w-[300px]">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar por cliente, conteúdo ou ID..."
                                value={filtroTexto}
                                onChange={(e) => setFiltroTexto(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        
                        <Select 
                            value={filtroStatus} 
                            onValueChange={setFiltroStatus} // Agora aceita ContratoStatus
                        >
                            <SelectTrigger className="w-full md:w-[180px]">
                                <SelectValue placeholder="Filtrar Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="todos">Todos os Status</SelectItem>
                                <SelectItem value="pendente_assinatura">Pendente Assinatura</SelectItem>
                                <SelectItem value="ativo">Ativo</SelectItem>
                                <SelectItem value="bloqueado">Bloqueado</SelectItem>
                                <SelectItem value="cancelado">Cancelado</SelectItem>
                                <SelectItem value="concluido">Concluído</SelectItem>
                                <SelectItem value="rascunho">Rascunho</SelectItem>
                            </SelectContent>
                        </Select>
                        
                        <Select 
                            value={ordenacao} 
                            onValueChange={setOrdenacao} // Agora aceita Ordenacao
                        >
                            <SelectTrigger className="w-full md:w-[200px]">
                                <SelectValue placeholder="Ordenar por" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="criado_em_desc">Data Criação (Mais Recente)</SelectItem>
                                <SelectItem value="vencimento_asc">Data Início (Mais Antigo)</SelectItem>
                                <SelectItem value="cliente_asc">Nome do Cliente (A-Z)</SelectItem>
                            </SelectContent>
                        </Select>
                        
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" className="w-full md:w-auto">
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
                    </div>
                </CardContent>
            </Card>
        </>
    );
};

export default ContratosHeader;