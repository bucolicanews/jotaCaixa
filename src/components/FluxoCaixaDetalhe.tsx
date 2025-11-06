import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, ArrowUpCircle, ArrowDownCircle, Filter, Search, Banknote, Wallet, Landmark, Printer } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { formatCurrency, formatarData } from '@/utils/formatters';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDebounce } from '@/hooks/use-debounce';
import { SaldoContaDetalhada } from '@/types/saldo-conta';
import { DateRangePicker } from './DateRangePicker';
import { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { Button } from './ui/button';
import { usePrint } from '@/hooks/use-print';
import ReactDOMServer from 'react-dom/server';
import FluxoCaixaPrint from './FluxoCaixaPrint';

interface Lancamento {
  id: string;
  data_movimentacao: string;
  descricao: string;
  valor: number;
  tipo: 'Entrada' | 'Saida';
  conta_bancaria_id: string;
  conta_contabil_id: string;
  conciliado: boolean;
  origem: string;
  documento: string | null;
  
  // Relações
  saldo_contas: { nome: string } | null;
}

interface FluxoCaixaDetalheProps {
  empresaId: string;
  contas: SaldoContaDetalhada[];
  totalSaldo: number;
}

const FluxoCaixaDetalhe: React.FC<FluxoCaixaDetalheProps> = ({ empresaId, contas, totalSaldo }) => {
  const { printContent } = usePrint();
  
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [loadingLancamentos, setLoadingLancamentos] = useState(true);
  
  // Filtros
  const [filtroContaId, setFiltroContaId] = useState('todos');
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [filtroTexto, setFiltroTexto] = useState('');
  const filtroTextoDebounced = useDebounce(filtroTexto, 500);
  const [filtroPeriodo, setFiltroPeriodo] = useState<DateRange | undefined>(undefined);

  const fetchLancamentos = useCallback(async () => {
    setLoadingLancamentos(true);
    
    // 1. Determinar as contas a serem consideradas
    const contasFiltradasIds = filtroContaId === 'todos' 
        ? contas.map(c => c.id) 
        : [filtroContaId];
        
    if (contasFiltradasIds.length === 0) {
        setLancamentos([]);
        setLoadingLancamentos(false);
        return;
    }
    
    // 2. Buscar Lançamentos DENTRO do Período
    let query = supabase
      .from('lancamentos')
      .select(`
        *,
        saldo_contas:conta_bancaria_id ( nome )
      `)
      .eq('empresa_id', empresaId)
      .in('conta_bancaria_id', contasFiltradasIds) // Filtra por contas selecionadas
      .order('data_movimentacao', { ascending: false });
      
    if (filtroTipo !== 'todos') {
        query = query.eq('tipo', filtroTipo);
    }
    if (filtroTextoDebounced) {
        query = query.ilike('descricao', `%${filtroTextoDebounced}%`);
    }
    
    // Filtro de data para os lançamentos (apenas se houver data de início)
    if (filtroPeriodo?.from) {
        query = query.gte('data_movimentacao', format(filtroPeriodo.from, 'yyyy-MM-dd'));
    }
    if (filtroPeriodo?.to) {
        query = query.lte('data_movimentacao', format(filtroPeriodo.to, 'yyyy-MM-dd'));
    }

    const { data, error } = await query;

    if (error) {
      showError('Erro ao carregar lançamentos: ' + error.message);
      setLancamentos([]);
    } else {
      const mappedData = (data as any[]).map(l => ({
          ...l,
          saldo_contas: l.saldo_contas, 
          plano_contas: null,
      })) as Lancamento[];
      
      setLancamentos(mappedData);
    }
    setLoadingLancamentos(false);
  }, [empresaId, filtroContaId, filtroTipo, filtroTextoDebounced, filtroPeriodo, contas]);

  useEffect(() => {
    fetchLancamentos();
  }, [fetchLancamentos]);
  
  const totalEntradas = lancamentos.filter(l => l.tipo === 'Entrada').reduce((sum, l) => sum + l.valor, 0);
  const totalSaidas = lancamentos.filter(l => l.tipo === 'Saida').reduce((sum, l) => sum + l.valor, 0);
  
  // Lógica Condicional para o Saldo Final/Variação
  let saldoFinalOuVariacao = 0;
  let tituloSaldoFinal = '';
  let saldoInicialConta = 0;
  
  const isContaFiltrada = filtroContaId !== 'todos';
  
  if (isContaFiltrada) {
      // 1. Se uma conta específica está filtrada, encontramos o saldo inicial dela
      const contaSelecionada = contas.find(c => c.id === filtroContaId);
      saldoInicialConta = contaSelecionada ? contaSelecionada.saldo_inicial : 0;
      
      // 2. Calculamos o Saldo Final da Conta (Saldo Inicial + Entradas - Saídas)
      saldoFinalOuVariacao = saldoInicialConta + totalEntradas - totalSaidas;
      tituloSaldoFinal = 'Saldo Final da Conta';
      
  } else {
      // 3. Se todas as contas estão filtradas, mostramos a Variação Líquida do Período
      saldoFinalOuVariacao = totalEntradas - totalSaidas;
      tituloSaldoFinal = 'Variação Líquida do Período';
  }
  
  const handlePrint = () => {
    if (lancamentos.length === 0) {
        showError('Nenhum lançamento para imprimir.');
        return;
    }
    
    const printComponent = (
        <FluxoCaixaPrint
            empresaId={empresaId}
            lancamentos={lancamentos}
            totalEntradas={totalEntradas}
            totalSaidas={totalSaidas}
            saldoFinalOuVariacao={saldoFinalOuVariacao}
            tituloSaldoFinal={tituloSaldoFinal}
            filtroPeriodo={filtroPeriodo}
            saldoInicialConta={saldoInicialConta}
        />
    );

    const htmlContent = ReactDOMServer.renderToStaticMarkup(printComponent);
    printContent(htmlContent, `Relatório Fluxo de Caixa - ${format(new Date(), 'yyyyMMdd')}`);
  };

  return (
    <div className="space-y-6">
      
      {/* Resumo de Saldos */}
      <Card>
        <CardHeader><CardTitle className="text-xl flex items-center"><Banknote className="w-5 h-5 mr-2" /> Resumo de Saldo</CardTitle></CardHeader>
        <CardContent>
            {/* Grid ajustado para 5 colunas no desktop */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                
                {/* Saldo Total (Sempre visível) */}
                <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
                    <h4 className="text-sm font-medium text-muted-foreground flex items-center"><Wallet className="w-4 h-4 mr-2" /> Saldo Total (Contas)</h4>
                    <p className={cn("text-xl font-bold mt-1", totalSaldo >= 0 ? 'text-green-600' : 'text-red-600')}>{formatCurrency(totalSaldo)}</p>
                </div>
                
                {/* Saldo Inicial (Apenas se conta filtrada) */}
                {isContaFiltrada && (
                    <div className="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                        <h4 className="text-sm font-medium text-blue-700 dark:text-blue-300 flex items-center"><Landmark className="w-4 h-4 mr-2" /> Saldo Inicial (Conta)</h4>
                        <p className={cn("text-xl font-bold mt-1", saldoInicialConta >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400')}>{formatCurrency(saldoInicialConta)}</p>
                    </div>
                )}
                
                {/* Entradas no Período */}
                <div className="p-3 bg-green-100 dark:bg-green-900/20 rounded-lg">
                    <h4 className="text-sm font-medium text-green-700 dark:text-green-300 flex items-center"><ArrowUpCircle className="w-4 h-4 mr-2" /> Entradas no Período</h4>
                    <p className="text-xl font-bold text-green-600 dark:text-green-400 mt-1">{formatCurrency(totalEntradas)}</p>
                </div>
                
                {/* Saídas no Período */}
                <div className="p-3 bg-red-100 dark:bg-red-900/20 rounded-lg">
                    <h4 className="text-sm font-medium text-red-700 dark:text-red-300 flex items-center"><ArrowDownCircle className="w-4 h-4 mr-2" /> Saídas no Período</h4>
                    <p className="text-xl font-bold text-red-600 dark:text-red-400 mt-1">{formatCurrency(totalSaidas)}</p>
                </div>
                
                {/* Saldo Final / Variação Líquida (Ocupa o restante da linha) */}
                <div className={cn("p-3 rounded-lg", saldoFinalOuVariacao >= 0 ? "bg-blue-100 dark:bg-blue-900/20" : "bg-red-100 dark:bg-red-900/20", isContaFiltrada ? "md:col-span-1" : "md:col-span-2")}>
                    <h4 className="text-sm font-medium text-muted-foreground flex items-center"><Landmark className="w-4 h-4 mr-2" /> {tituloSaldoFinal}</h4>
                    <p className={cn("text-xl font-bold mt-1", saldoFinalOuVariacao >= 0 ? "text-blue-600 dark:text-blue-400" : "text-red-600 dark:text-red-400")}>{formatCurrency(saldoFinalOuVariacao)}</p>
                </div>
            </div>
        </CardContent>
      </Card>
      
      {/* Filtros de Lançamentos */}
      <Card>
        <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between space-y-4 md:space-y-0 pb-2">
            <CardTitle className="text-lg flex items-center"><Filter className="w-4 h-4 mr-2" /> Filtros de Lançamentos</CardTitle>
            <Button onClick={handlePrint} variant="outline" disabled={loadingLancamentos || lancamentos.length === 0}>
                <Printer className="w-4 h-4 mr-2" /> Imprimir Relatório
            </Button>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-4">
            <div className="relative w-full sm:w-[300px]">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Buscar por descrição ou documento..."
                    value={filtroTexto}
                    onChange={(e) => setFiltroTexto(e.target.value)}
                    className="pl-10"
                />
            </div>
            
            <Select value={filtroContaId} onValueChange={setFiltroContaId}>
                <SelectTrigger className="w-full sm:w-[200px]">
                    <SelectValue placeholder="Filtrar por Conta" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="todos">Todas as Contas</SelectItem>
                    {contas.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            
            <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                <SelectTrigger className="w-full sm:w-[150px]">
                    <SelectValue placeholder="Filtrar por Tipo" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="todos">Todos os Tipos</SelectItem>
                    <SelectItem value="Entrada">Entrada</SelectItem>
                    <SelectItem value="Saida">Saída</SelectItem>
                </SelectContent>
            </Select>
            
            <DateRangePicker date={filtroPeriodo} setDate={setFiltroPeriodo} />
        </CardContent>
      </Card>

      {/* Tabela de Lançamentos */}
      <Card>
        <CardHeader><CardTitle className="text-xl">Histórico de Lançamentos ({lancamentos.length})</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[150px]">Data</TableHead>
                  <TableHead className="w-[150px]">Conta/Caixa</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="w-[100px] text-center">Tipo</TableHead>
                  <TableHead className="w-[120px] text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingLancamentos ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
                ) : lancamentos.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-4 text-muted-foreground">Nenhum lançamento encontrado com os filtros aplicados.</TableCell></TableRow>
                ) : (
                  lancamentos.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-sm">{formatarData(l.data_movimentacao)}</TableCell>
                      <TableCell className="font-medium text-sm">{l.saldo_contas?.nome || 'N/A'}</TableCell>
                      <TableCell className="text-sm">{l.descricao}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={l.tipo === 'Entrada' ? 'success' : 'destructive'} className="flex items-center justify-center">
                          {l.tipo === 'Entrada' ? <ArrowUpCircle className="w-3 h-3 mr-1" /> : <ArrowDownCircle className="w-3 h-3 mr-1" />}
                          {l.tipo}
                        </Badge>
                      </TableCell>
                      <TableCell className={cn("text-right font-semibold", l.tipo === 'Entrada' ? 'text-green-600' : 'text-red-600')}>
                        {formatCurrency(l.valor)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default FluxoCaixaDetalhe;