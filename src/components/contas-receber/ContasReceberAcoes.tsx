import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DateRange } from 'react-day-picker';
import { DateRangePicker } from '@/components/DateRangePicker';
import { Printer, FileDown, Filter, Loader2, Search } from 'lucide-react';
import { format, isPast, isToday, parseISO } from 'date-fns';
import Papa from 'papaparse';
import { showError, showSuccess } from '@/utils/toast';
import { usePrint } from '@/hooks/use-print';
import ReactDOMServer from 'react-dom/server';
import ContasReceberPrint from './ContasReceberPrint';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { formatarData } from '@/utils/formatters';
import { Input } from '@/components/ui/input';
import { ExtendedParcelaDetalhada, ContaReceberComProgresso, AdminRecebimento } from '@/types/contas-receber'; // Importação corrigida
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { useOwnerBranding } from '@/hooks/use-owner-branding'; // NOVO IMPORT

type FiltroOrigem = 'todos' | 'contrato' | 'assinatura_recorrente' | 'manual';

interface ContasReceberAcoesProps {
  activeTab: string;
  filtroPeriodo: DateRange | undefined;
  setFiltroPeriodo: (date: DateRange | undefined) => void;
  
  // Dados filtrados para exportação/impressão
  contasFiltradas: ContaReceberComProgresso[];
  parcelasFiltradas: ExtendedParcelaDetalhada[];
  recebimentosFiltrados: AdminRecebimento[];
  clienteNomeMap: Record<string, string>;
  isAdmin: boolean;
  
  // FILTROS
  filtroStatus: 'todos' | 'quitado' | 'nao_quitado';
  setFiltroStatus: (status: 'todos' | 'quitado' | 'nao_quitado') => void;
  filtroOrigem: FiltroOrigem;
  setFiltroOrigem: (origem: FiltroOrigem) => void;
  filtroTexto: string; // NOVO PROP
  setFiltroTexto: (text: string) => void; // NOVO PROP
}

const formatTimestamp = (dateString: string) => new Date(dateString).toLocaleDateString('pt-BR') + ' ' + new Date(dateString).toLocaleTimeString('pt-BR');

const ContasReceberAcoes: React.FC<ContasReceberAcoesProps> = ({
  activeTab,
  filtroPeriodo,
  setFiltroPeriodo,
  contasFiltradas,
  parcelasFiltradas,
  recebimentosFiltrados,
  clienteNomeMap,
  isAdmin,
  filtroStatus,
  setFiltroStatus,
  filtroOrigem,
  setFiltroOrigem,
  filtroTexto,
  setFiltroTexto,
}) => {
  const [exportLoading, setExportLoading] = useState(false);
  const { printContent } = usePrint();
  const { logoUrl, ownerName } = useOwnerBranding(); // USANDO HOOK DE BRANDING

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
            'Vencimento': formatarData(c.data_vencimento),
            'Valor Total': c.valor_total, // Mantém como número para cálculo de total
            'Progresso': `${pagas}/${total}`,
            'Status': displayStatus,
            'Origem': c.origem,
        };
      });
    } else if (activeTab === 'parcelas') {
      headers = ['ID Parcela', 'ID Conta', 'Cliente', 'Descrição', 'Nº Parcela', 'Vencimento', 'Valor Parcela', 'Vlr Pago', 'Data Pagamento', 'Status'];
      data = parcelasFiltradas.map(p => ({
        'ID Parcela': p.id,
        'ID Conta': p.contas_receber?.id || 'N/A',
        'Cliente': p.contas_receber?.clientes?.nome || 'N/A',
        'Descrição': p.contas_receber?.descricao || 'N/A',
        'Nº Parcela': p.numero_parcela,
        'Vencimento': formatarData(p.data_vencimento),
        'Valor Parcela': p.valor_parcela,
        'Vlr Pago': p.valor_pago || 0,
        'Data Pagamento': p.data_pagamento ? formatarData(p.data_pagamento) : '-',
        'Status': p.status,
      }));
    } else if (activeTab === 'recebimentos') {
      headers = ['ID Recebimento', 'Data Recebimento', 'ID Conta', 'Cliente', 'Descrição', 'Valor Recebido', 'Forma Pagamento', 'Conta/Caixa', 'Origem'];
      data = recebimentosFiltrados.map(r => ({
        'ID Recebimento': r.id,
        'Data Recebimento': formatTimestamp(r.data_recebimento),
        'ID Conta': r.admin_parcelas_receber?.admin_contas_receber?.id || 'N/A',
        'Cliente': clienteNomeMap[r.cliente_id] || 'N/A',
        'Descrição': r.admin_parcelas_receber?.admin_contas_receber?.descricao || 'N/A',
        'Valor Recebido': r.valor_recebido,
        'Forma Pagamento': r.forma_pagamento,
        'Conta/Caixa': r.saldo_contas?.nome || 'N/A', // CORRIGIDO: Acesso direto a saldo_contas
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
  
  const handlePrint = (orientation: 'portrait' | 'landscape') => {
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
            logoUrl={logoUrl} // PASSANDO LOGO
            ownerName={ownerName} // PASSANDO NOME
        />
    );

    const htmlContent = ReactDOMServer.renderToStaticMarkup(printComponent);
    printContent(htmlContent, `Relatório CR - ${activeTab}`, orientation);
  };

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between space-y-4 md:space-y-0 pb-2">
        <CardTitle className="text-lg flex items-center">
          <Filter className="w-4 h-4 mr-2" /> Filtros e Ações
        </CardTitle>
        <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
          
          {/* FILTRO DE TEXTO */}
          <div className="relative w-full sm:w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                  placeholder="Buscar ID, Cliente, Descrição..."
                  value={filtroTexto}
                  onChange={(e) => setFiltroTexto(e.target.value)}
                  className="pl-10"
              />
          </div>
          {/* FIM FILTRO DE TEXTO */}
          
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