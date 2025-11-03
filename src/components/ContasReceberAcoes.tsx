import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateRange } from 'react-day-picker';
import { DateRangePicker } from '@/components/DateRangePicker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Printer, FileText, FileDown, Filter, Loader2 } from 'lucide-react';
import { ContaReceber, ParcelaDetalhada } from '@/types/contas-receber';
import { format } from 'date-fns';
import Papa from 'papaparse';
import { showError, showSuccess } from '@/utils/toast';
import { usePrint } from '@/hooks/use-print';
import ReactDOMServer from 'react-dom/server';
import ContasReceberPrint from './ContasReceberPrint';

// Definindo o tipo ContaReceberComProgresso localmente para resolver TS2339
interface ContaReceberComProgresso extends ContaReceber {
    parcelas_pagas?: number;
    parcelas_total?: number;
}

interface ContasReceberAcoesProps {
  activeTab: string;
  filtroGeral: string;
  setFiltroGeral: (value: string) => void;
  filtroPeriodo: DateRange | undefined;
  setFiltroPeriodo: (value: DateRange | undefined) => void;
  filtroStatus: string;
  setFiltroStatus: (value: string) => void;
  filtroOrigem: string;
  setFiltroOrigem: (value: string) => void;
  
  // Dados filtrados para exportação/impressão
  contasFiltradas: ContaReceberComProgresso[]; // Usando o tipo corrigido
  parcelasFiltradas: ParcelaDetalhada[];
  recebimentosFiltrados: any[]; // Usamos any para simplificar o tipo AdminRecebimento
  clienteNomeMap: Record<string, string>;
  isAdmin: boolean;
}

// Removendo formatCurrency (TS6133)
const formatDate = (dateString: string) => new Date(dateString + 'T00:00:00').toLocaleDateString('pt-BR');

const ContasReceberAcoes: React.FC<ContasReceberAcoesProps> = ({
  activeTab,
  filtroGeral,
  setFiltroGeral,
  filtroPeriodo,
  setFiltroPeriodo,
  filtroStatus,
  setFiltroStatus,
  filtroOrigem,
  setFiltroOrigem,
  contasFiltradas,
  parcelasFiltradas,
  recebimentosFiltrados,
  clienteNomeMap,
  isAdmin,
}) => {
  const { printContent } = usePrint();
  const [isExporting, setIsExporting] = useState(false);

  const getDataForExport = () => {
    let data: any[] = [];
    let filename = '';

    if (activeTab === 'parcela_sintetica') {
      filename = 'contas_a_receber_resumo';
      data = contasFiltradas.map(c => {
        const clienteNome = isAdmin ? clienteNomeMap[c.cliente_id] || 'N/A' : (c as any).clientes?.nome || 'N/A';
        return {
          'ID Conta': c.id,
          'Cliente': clienteNome,
          'Descrição': c.descricao,
          'Valor Total': c.valor_total,
          'Vencimento': formatDate(c.data_vencimento),
          'Status': c.status,
          'Origem': c.origem,
          'Pagas': c.parcelas_pagas,
          'Total': c.parcelas_total,
        };
      });
    } else if (activeTab === 'parcelas') {
      filename = 'contas_a_receber_detalhe';
      data = parcelasFiltradas.map(p => {
        const isMyLaunch = isAdmin;
        const contaReceber = isMyLaunch ? (p as any).admin_contas_receber : (p as any).contas_receber;
        const clienteId = isMyLaunch ? contaReceber?.cliente_id : contaReceber?.clientes?.id;
        const clienteNome = isMyLaunch ? clienteNomeMap[clienteId] || 'N/A' : contaReceber?.clientes?.nome || 'N/A';
        const descricao = contaReceber?.descricao || 'N/A';
        const origem = isMyLaunch ? contaReceber?.origem : (p as any).contas_receber?.origem;

        return {
          'ID Parcela': p.id,
          'Cliente': clienteNome,
          'Descrição': descricao,
          'Nº Parcela': p.numero_parcela,
          'Valor Parcela': p.valor_parcela,
          'Vlr Pago': p.valor_pago || 0,
          'Vencimento': formatDate(p.data_vencimento),
          'Data Pagamento': p.data_pagamento ? formatDate(p.data_pagamento) : '-', // NOVO CAMPO
          'Status': p.status,
          'Origem': origem,
        };
      });
    } else if (activeTab === 'recebimentos' && isAdmin) {
      filename = 'recebimentos_historico';
      data = recebimentosFiltrados.map(r => {
        const clienteNome = clienteNomeMap[r.cliente_id] || 'N/A';
        const descricao = r.admin_parcelas_receber?.admin_contas_receber?.descricao || 'N/A';
        const origem = r.admin_parcelas_receber?.admin_contas_receber?.origem || 'N/A';

        return {
          'ID Recebimento': r.id,
          'Data Recebimento': format(new Date(r.data_recebimento), 'dd/MM/yyyy HH:mm'),
          'Cliente': clienteNome,
          'Descrição': descricao,
          'Valor Recebido': r.valor_recebido,
          'Forma Pagamento': r.forma_pagamento,
          'Origem': origem,
        };
      });
    }
    return { data, filename };
  };

  const handleExport = (formatType: 'csv' | 'xlsx') => {
    setIsExporting(true);
    const { data, filename } = getDataForExport();

    if (data.length === 0) {
      showError('Nenhum dado para exportar com os filtros atuais.');
      setIsExporting(false);
      return;
    }

    if (formatType === 'csv') {
      const csv = Papa.unparse(data, { delimiter: ';', header: true });
      const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' }); // Adiciona BOM para UTF-8
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Correção do erro TS2349: format deve ser chamado com Date ou number, não String
      a.download = `${filename}_${format(new Date(), 'yyyyMMdd')}.csv`; 
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showSuccess('Dados exportados para CSV!');
    } else if (formatType === 'xlsx') {
      // Simulação de exportação XLSX (requer biblioteca externa)
      showError('A exportação para XLSX requer bibliotecas adicionais. Exportando para CSV.');
      handleExport('csv');
    }
    setIsExporting(false);
  };

  const handlePrint = () => {
    const { data, filename } = getDataForExport();
    if (data.length === 0) {
      showError('Nenhum dado para imprimir com os filtros atuais.');
      return;
    }

    const printComponent = (
        <ContasReceberPrint 
            data={data} 
            activeTab={activeTab} 
            filtroPeriodo={filtroPeriodo}
        />
    );

    const htmlContent = ReactDOMServer.renderToStaticMarkup(printComponent);
    printContent(htmlContent, `Relatório CR - ${filename}`);
  };

  return (
    <div className="flex flex-col md:flex-row gap-4 mt-4">
      <Input
        placeholder="Filtrar por cliente, descrição, valor..."
        value={filtroGeral}
        onChange={(e) => setFiltroGeral(e.target.value)}
        className="w-full md:max-w-xs"
      />
      <DateRangePicker
        date={filtroPeriodo}
        setDate={setFiltroPeriodo}
        className="w-full md:w-auto"
      />
      <Select value={filtroStatus} onValueChange={setFiltroStatus}>
        <SelectTrigger className="w-full md:w-[180px]">
          <SelectValue placeholder="Filtrar por Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todos">Todos os Status</SelectItem>
          <SelectItem value="pendente">Em Aberto / Parcial</SelectItem>
          <SelectItem value="paga">Quitadas</SelectItem>
          <SelectItem value="aberta">Abertas / Reprogramadas</SelectItem>
        </SelectContent>
      </Select>
      <Select value={filtroOrigem} onValueChange={setFiltroOrigem}>
        <SelectTrigger className="w-full md:w-[180px]">
          <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
          <SelectValue placeholder="Filtrar por Origem" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todos">Todas as Origens</SelectItem>
          <SelectItem value="manual">Manual</SelectItem>
          <SelectItem value="contrato">Contrato</SelectItem>
          <SelectItem value="plano">Plano (Recorrente)</SelectItem>
        </SelectContent>
      </Select>
      
      {/* Botões de Ação */}
      <div className="flex space-x-2 w-full md:w-auto">
        <Button 
          variant="outline" 
          size="icon" 
          onClick={handlePrint} 
          disabled={isExporting}
          title="Imprimir Relatório Filtrado"
        >
          <Printer className="w-4 h-4" />
        </Button>
        <Button 
          variant="outline" 
          size="icon" 
          onClick={() => handleExport('csv')} 
          disabled={isExporting}
          title="Exportar para CSV"
        >
          {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
        </Button>
        <Button 
          variant="outline" 
          size="icon" 
          onClick={() => handleExport('xlsx')} 
          disabled={isExporting}
          title="Exportar para XLSX (Simulado)"
        >
          <FileText className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};

export default ContasReceberAcoes;