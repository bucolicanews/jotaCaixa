import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DateRange } from 'react-day-picker';
import { DateRangePicker } from '@/components/DateRangePicker';
import { Printer, FileDown, Filter, Loader2 } from 'lucide-react';
import { ContaReceber, ParcelaDetalhada } from '@/types/contas-receber';
import { format, isPast, isToday, parseISO } from 'date-fns';
import Papa from 'papaparse';
import { showError, showSuccess } from '@/utils/toast';
import { usePrint } from '@/hooks/use-print';
import ReactDOMServer from 'react-dom/server';
import ContasReceberPrint from './ContasReceberPrint';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

// Definindo o tipo ContaReceberComProgresso localmente
interface ContaReceberComProgresso extends ContaReceber {
    parcelas_pagas?: number;
    parcelas_total?: number;
}

// Tipo para a parcela detalhada com data_pagamento
interface ExtendedParcelaDetalhada extends ParcelaDetalhada {
    data_pagamento?: string | null;
}

type FiltroOrigem = 'todos' | 'contrato' | 'assinatura_recorrente' | 'manual';

interface ContasReceberAcoesProps {
  activeTab: string;
  filtroPeriodo: DateRange | undefined;
  setFiltroPeriodo: (date: DateRange | undefined) => void;
  
  // Dados filtrados para exportação/impressão
  contasFiltradas: ContaReceberComProgresso[];
  parcelasFiltradas: ExtendedParcelaDetalhada[];
  recebimentosFiltrados: any[];
  clienteNomeMap: Record<string, string>;
  isAdmin: boolean;
  
  // FILTROS
  filtroStatus: 'todos' | 'quitado' | 'nao_quitado';
  setFiltroStatus: (status: 'todos' | 'quitado' | 'nao_quitado') => void;
  filtroOrigem: FiltroOrigem;
  setFiltroOrigem: (origem: FiltroOrigem) => void;
}

const formatDate = (dateString: string) => new Date(dateString + 'T00:00:00').toLocaleDateString('pt-BR');
const formatTimestamp = (dateString: string) => new Date(dateString).toLocaleDateString('pt-BR') + ' ' + new Date(dateString).toLocaleTimeString('pt-BR');
const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);


const ContasReceberAcoes: React.FC<ContasReceberAcoesProps> = ({
  activeTab,
  filtroPeriodo,
  setFiltroPeriodo,
  contasFiltradas,
  parcelasFiltradas,
  recebimentosFiltrados,
  clienteNomeMap,
  filtroStatus,
  setFiltroStatus,
  filtroOrigem,
  setFiltroOrigem,
}) => {
  const [exportLoading, setExportLoading] = useState(false);
  const { printContent } = usePrint();

  const getDataForExport = () => {
    let data: any[] = [];
    let headers: string[] = [];

    if (activeTab === 'parcela_sintetica') {
      headers = ['ID Conta', 'Cliente', 'Descrição', 'Vencimento', 'Valor Total', 'Progresso', 'Status', 'Origem'];
      data = contasFiltradas.map(c => {
        // Correção: Usar operador de coalescência nula (?? 0)
        const total = c.parcelas_total ?? 0;
        const pagas = c.parcelas_pagas ?? 0;
        
        const isQuitada = total > 0 && pagas === total;
        let displayStatus: string;
        
        if (isQuitada) {
            displayStatus = 'quitada';
        } else {
            const vencimento = parseISO(c.data_vencimento + 'T00:00:00');
            if (isPast(vencimento) && !isToday(vencimento)) {
                displayStatus = 'atrasada';
            } else if (isToday(vencimento)) {
                displayStatus = 'vence hoje';
            } else {
                displayStatus = 'aberta';
            }
        }
        
        return {
            'ID Conta': c.id,
            'Cliente': c.clientes?.nome || 'N/A',
            'Descrição': c.descricao,
            'Vencimento': formatDate(c.data_vencimento),
            'Valor Total': c.valor_total, // Mantém como número para cálculo de total
            'Progresso': `${pagas}/${total}`,
            'Status': displayStatus,
            'Origem': c.origem,
        };
      });
    } else if (activeTab === 'parcelas') {
      headers = ['ID Parcela', 'Cliente', 'Descrição', 'Nº Parcela', 'Vencimento', 'Valor Parcela', 'Vlr Pago', 'Data Pagamento', 'Status'];
      data = parcelasFiltradas.map(p => ({
        'ID Parcela': p.id,
        'Cliente': p.contas_receber?.clientes?.nome || 'N/A',
        'Descrição': p.contas_receber?.descricao || 'N/A',
        'Nº Parcela': p.numero_parcela,
        'Vencimento': formatDate(p.data_vencimento),
        'Valor Parcela': p.valor_parcela,
        'Vlr Pago': p.valor_pago || 0,
        'Data Pagamento': p.data_pagamento ? formatDate(p.data_pagamento) : '-',
        'Status': p.status,
      }));
    } else if (activeTab === 'recebimentos') {
      headers = ['ID Recebimento', 'Data Recebimento', 'Cliente', 'Descrição', 'Valor Recebido', 'Forma Pagamento', 'Conta/Caixa', 'Origem'];
      data = recebimentosFiltrados.map(r => ({
        'ID Recebimento': r.id,
        'Data Recebimento': formatTimestamp(r.data_recebimento),
        'Cliente': clienteNomeMap[r.cliente_id] || 'N/A',
        'Descrição': r.admin_parcelas_receber?.admin_contas_receber?.descricao || 'N/A',
        'Valor Recebido': r.valor_recebido,
        'Forma Pagamento': r.forma_pagamento,
        'Conta/Caixa': r.saldo_contas?.nome || 'N/A', // NOVO CAMPO
        'Origem': r.admin_parcelas_receber?.admin_contas_receber?.origem || 'manual',
      }));
    }
    
    // Formata valores monetários para exportação (sem R$)
    data = data.map(row => {
        const newRow = { ...row };
        for (const key in newRow) {
            if (typeof newRow[key] === 'number' && (key.includes('Valor') || key.includes('Vlr'))) {
                newRow[key] = newRow[key].toFixed(2).replace('.', ',');
            }
        }
        return newRow;
    });

    return { data, headers };
  };

  const handleExportCSV = () => {
    setExportLoading(true);
    try {
      const { data, headers } = getDataForExport();
      
      if (data.length === 0) {
        showError('Nenhum dado para exportar.');
        return;
      }

      const csv = Papa.unparse(data, {
        header: true,
        columns: headers,
        delimiter: ';',
      });

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `contas_receber_${activeTab}_${format(new Date(), 'yyyyMMdd')}.csv`);
      link.click();
      
      showSuccess('Exportação CSV concluída!');
    } catch (error) {
      console.error('Erro ao exportar CSV:', error);
      showError('Falha ao exportar dados.');
    } finally {
      setExportLoading(false);
    }
  };
  
  const handlePrint = () => {
    const { data } = getDataForExport();
    
    if (data.length === 0) {
        showError('Nenhum dado para imprimir.');
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
    printContent(htmlContent, `Relatório CR - ${activeTab}`);
  };

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between space-y-4 md:space-y-0 pb-2">
        <CardTitle className="text-lg flex items-center">
          <Filter className="w-4 h-4 mr-2" /> Filtros e Ações
        </CardTitle>
        <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
          
          {/* FILTRO DE ORIGEM */}
          <Select value={filtroOrigem} onValueChange={setFiltroOrigem}>
              <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Filtrar Origem" />
              </SelectTrigger>
              <SelectContent>
                  <SelectItem value="todos">Todas as Origens</SelectItem>
                  <SelectItem value="contrato">Contrato</SelectItem>
                  <SelectItem value="assinatura_recorrente">Assinatura</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
          </Select>
          {/* FIM FILTRO DE ORIGEM */}
          
          {/* FILTRO DE STATUS */}
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Filtrar Status" />
              </SelectTrigger>
              <SelectContent>
                  <SelectItem value="todos">Todos os Status</SelectItem>
                  <SelectItem value="quitado">Quitado</SelectItem>
                  <SelectItem value="nao_quitado">Não Quitado</SelectItem>
              </SelectContent>
          </Select>
          {/* FIM FILTRO DE STATUS */}
          
          <DateRangePicker
            date={filtroPeriodo}
            setDate={setFiltroPeriodo}
          />
          <Button onClick={handlePrint} variant="outline" className="w-full sm:w-auto">
            <Printer className="w-4 h-4 mr-2" /> Imprimir
          </Button>
          <Button onClick={handleExportCSV} variant="secondary" className="w-full sm:w-auto" disabled={exportLoading}>
            {exportLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="w-4 h-4 mr-2" />}
            Exportar CSV
          </Button>
        </div>
      </CardHeader>
    </Card>
  );
};

export default ContasReceberAcoes;