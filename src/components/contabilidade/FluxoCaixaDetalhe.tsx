import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, ArrowUpCircle, ArrowDownCircle, Filter, Search, Banknote, Wallet, Landmark, Printer, Edit, Undo2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { formatCurrency, formatarData } from '@/utils/formatters';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDebounce } from '@/hooks/use-debounce';
import { SaldoContaDetalhada } from '@/types/saldo-conta';
import { DateRangePicker } from '@/components/DateRangePicker';
import { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { Button } from '../ui/button';
import { usePrint } from '@/hooks/use-print';
import ReactDOMServer from 'react-dom/server';
import FluxoCaixaPrint from './FluxoCaixaPrint';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import FormMovimentacaoDiretaDialog, { LancamentoPrimario } from '@/components/formularios/FormMovimentacaoDiretaDialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../ui/alert-dialog';

// Interface para o lançamento primário (ligado à conta bancária)
interface Lancamento extends LancamentoPrimario {
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
  logoUrl: string | null; // NOVO PROP
  ownerName: string; // NOVO PROP
  refetchSaldos: () => void; // NOVO PROP
}

const FluxoCaixaDetalhe: React.FC<FluxoCaixaDetalheProps> = ({ empresaId, contas, totalSaldo, logoUrl, ownerName, refetchSaldos }) => {
  const { printContent } = usePrint();
  
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [loadingLancamentos, setLoadingLancamentos] = useState(true);
  const [isUndoing, setIsUndoing] = useState(false); // NOVO ESTADO
  
  // Filtros
  const [filtroContaId, setFiltroContaId] = useState('todos');
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [filtroTexto, setFiltroTexto] = useState('');
  const filtroTextoDebounced = useDebounce(filtroTexto, 500);
  const [filtroPeriodo, setFiltroPeriodo] = useState<DateRange | undefined>(undefined);
  
  // Edição
  const [editDialog, setEditDialog] = useState<{ open: boolean, lancamento: Lancamento | null }>({ open: false, lancamento: null });

  // NOVO: Filtra as contas para o Select (apenas Caixa ou Banco)
  const contasCaixaBanco = useMemo(() => {
      return contas.filter(c => c.plano_contas?.is_caixa || c.plano_contas?.is_banco);
  }, [contas]);

  const fetchLancamentos = useCallback(async () => {
    setLoadingLancamentos(true);
    
    // 1. Determinar as contas a serem consideradas
    const contasFiltradasIds = filtroContaId === 'todos' 
        ? contasCaixaBanco.map(c => c.id) // USANDO APENAS CAIXA/BANCO
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
        id,
        data_movimentacao,
        descricao,
        valor,
        tipo,
        conta_bancaria_id,
        conta_contabil_id,
        conciliado,
        origem,
        documento,
        historico_id,
        conta_resultado_id,
        saldo_contas:conta_bancaria_id ( nome )
      `)
      .eq('proprietario_id', empresaId) // ALTERADO: empresa_id -> proprietario_id
      .in('conta_bancaria_id', contasFiltradasIds) // Filtra por contas selecionadas
      .order('data_movimentacao', { ascending: false });
      
    if (filtroTipo !== 'todos') {
        query = query.eq('tipo', filtroTipo);
    }
    
    // Filtro de texto: busca por ID, descrição ou documento
    if (filtroTextoDebounced) {
        const termo = `%${filtroTextoDebounced}%`;
        // CORREÇÃO: Foca apenas em campos de texto (descricao e documento)
        query = query.or(`descricao.ilike.${termo},documento.ilike.${termo}`);
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
      let filteredData = data as Lancamento[];
      
      // Filtro de ID no frontend (para IDs de lançamento ou conta bancária)
      if (filtroTextoDebounced) {
          const termo = filtroTextoDebounced.toLowerCase();
          filteredData = filteredData.filter(l => 
              l.id.toLowerCase().includes(termo) ||
              l.conta_bancaria_id.toLowerCase().includes(termo)
          );
      }
      
      setLancamentos(filteredData);
    }
    setLoadingLancamentos(false);
  }, [empresaId, filtroContaId, filtroTipo, filtroTextoDebounced, filtroPeriodo, contasCaixaBanco]); // Adicionado contasCaixaBanco

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
  
  const handlePrint = (orientation: 'portrait' | 'landscape') => {
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
            logoUrl={logoUrl} // PASSANDO LOGO
            ownerName={ownerName} // PASSANDO NOME
        />
    );

    const htmlContent = ReactDOMServer.renderToStaticMarkup(printComponent);
    printContent(htmlContent, `Relatório Fluxo de Caixa - ${format(new Date(), 'yyyyMMdd')}`, orientation);
  };
  
  const handleOpenEdit = (lancamento: Lancamento) => {
    setEditDialog({ open: true, lancamento });
  };

  const handleEditSaveComplete = () => {
      setEditDialog({ open: false, lancamento: null });
      fetchLancamentos(); // Refetch data
      refetchSaldos(); // CRÍTICO: Força o recálculo do saldo total
  };
  
  const handleEstorno = async (lancamento: Lancamento) => {
    if (!window.confirm('Tem certeza que deseja estornar este lançamento? Isso criará um lançamento de estorno e marcará o original como estornado.')) return;
    
    setIsUndoing(true);
    
    try {
        // 1. Buscar o ID do lançamento de partida dobrada (DRE) usando a referência cruzada
        const dreLaunchId = lancamento.conta_resultado_id;
        
        if (!dreLaunchId) {
            throw new Error('Referência cruzada (conta_resultado_id) não encontrada no lançamento primário.');
        }
        
        // 2. Marcar os lançamentos originais como estornados (para desabilitar o botão de estorno)
        const { error: updateError } = await supabase
            .from('lancamentos')
            .update({ origem: 'movimentacao_direta_estornada' })
            .in('id', [lancamento.id, dreLaunchId]);
            
        if (updateError) throw updateError;
        
        // 3. Criar o lançamento de estorno (Entrada/Saída oposta)
        const estornoTipo = lancamento.tipo === 'Entrada' ? 'Saida' : 'Entrada';
        const estornoDescricao = `Estorno: ${lancamento.descricao}`;
        const valor = Math.abs(lancamento.valor);
        
        // Lançamento 1: Estorno no Ativo (Caixa/Banco)
        const estornoAtivoPayload = {
            proprietario_id: empresaId,
            data_movimentacao: new Date().toISOString(),
            descricao: estornoDescricao,
            valor: valor,
            tipo: estornoTipo, // Tipo oposto (Entrada -> Saida, Saida -> Entrada)
            conta_bancaria_id: lancamento.conta_bancaria_id,
            conta_contabil_id: lancamento.conta_contabil_id, // Conta Ativo/Caixa
            origem: 'estorno_direto',
            historico_id: lancamento.historico_id,
        };
        
        // Lançamento 2: Estorno no Resultado (DRE)
        // O tipo do lançamento de Resultado/DRE é o oposto do tipo do lançamento de Ativo/Caixa
        const estornoResultadoTipoCorrigido = estornoTipo === 'Entrada' ? 'Saida' : 'Entrada'; 
        const contaResultadoId = lancamento.conta_contabil_id; // Conta de Resultado original
        
        const estornoResultadoPayload = {
            proprietario_id: empresaId,
            data_movimentacao: new Date().toISOString(),
            descricao: estornoDescricao,
            valor: valor,
            tipo: estornoResultadoTipoCorrigido, // Tipo oposto ao do Ativo (Entrada -> Saida, Saida -> Entrada)
            conta_bancaria_id: null,
            conta_contabil_id: contaResultadoId,
            origem: 'estorno_direto',
            historico_id: lancamento.historico_id,
        };
        
        // 4. Inserir os novos lançamentos de estorno
        const [resAtivo, resResultado] = await Promise.all([
            supabase.from('lancamentos').insert(estornoAtivoPayload),
            supabase.from('lancamentos').insert(estornoResultadoPayload),
        ]);
        
        if (resAtivo.error) throw resAtivo.error;
        if (resResultado.error) throw resResultado.error;
        
        showSuccess('Lançamento estornado com sucesso! Um novo registro de estorno foi criado.');
        
    } catch (error: any) {
        console.error('Erro ao estornar lançamento:', error);
        showError('Falha ao estornar lançamento: ' + error.message);
    } finally {
        setIsUndoing(false);
        fetchLancamentos(); // GARANTINDO O RECALCULO DOS LANÇAMENTOS
        refetchSaldos(); // CRÍTICO: Força o recálculo do saldo total
    }
  };

  return (
    <>
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
                    <p className={cn("text-lg font-bold mt-1 truncate", totalSaldo >= 0 ? 'text-green-600' : 'text-red-600')}>{formatCurrency(totalSaldo)}</p>
                </div>
                
                {/* Saldo Inicial (Apenas se conta filtrada) */}
                {isContaFiltrada && (
                    <div className="p-3 bg-black/20 dark:bg-orange-900/20 rounded-lg text-white">
                        <h4 className="text-sm font-medium flex items-center"><Landmark className="w-4 h-4 mr-2" /> Saldo Inicial (Conta)</h4>
                        <p className={cn("text-lg font-bold mt-1 truncate", saldoInicialConta >= 0 ? 'text-white' : 'text-red-200')}>{formatCurrency(saldoInicialConta)}</p>
                    </div>
                )}
                
                {/* Entradas no Período */}
                <div className="p-3 bg-green-100 dark:bg-green-900/20 rounded-lg">
                    <h4 className="text-sm font-medium text-green-700 dark:text-green-300 flex items-center"><ArrowUpCircle className="w-4 h-4 mr-2" /> Entradas no Período</h4>
                    <p className="text-lg font-bold text-green-600 dark:text-green-400 mt-1 truncate">{formatCurrency(totalEntradas)}</p>
                </div>
                
                {/* Saídas no Período */}
                <div className="p-3 bg-red-100 dark:bg-red-900/20 rounded-lg">
                    <h4 className="text-sm font-medium text-red-700 dark:text-red-300 flex items-center"><ArrowDownCircle className="w-4 h-4 mr-2" /> Saídas no Período</h4>
                    <p className="text-lg font-bold text-red-600 dark:text-red-400 mt-1 truncate">{formatCurrency(totalSaidas)}</p>
                </div>
                
                {/* Saldo Final / Variação Líquida (Ocupa o restante da linha) */}
                <div className={cn("p-3 rounded-lg", saldoFinalOuVariacao >= 0 ? "bg-blue-100 dark:bg-blue-900/20" : "bg-red-100 dark:bg-red-900/20", isContaFiltrada ? "md:col-span-1" : "md:col-span-2")}>
                    <h4 className="text-sm font-medium text-muted-foreground flex items-center"><Landmark className="w-4 h-4 mr-2" /> {tituloSaldoFinal}</h4>
                    <p className={cn("text-lg font-bold mt-1 truncate", saldoFinalOuVariacao >= 0 ? "text-blue-600 dark:text-blue-400" : "text-red-600 dark:text-red-400")}>{formatCurrency(saldoFinalOuVariacao)}</p>
                </div>
            </div>
        </CardContent>
      </Card>
      
      {/* Filtros de Lançamentos */}
      <Card>
        <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between space-y-4 md:space-y-0 pb-2">
            <CardTitle className="text-lg flex items-center"><Filter className="w-4 h-4 mr-2" /> Filtros de Lançamentos</CardTitle>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" disabled={loadingLancamentos || lancamentos.length === 0}>
                        <Printer className="w-4 h-4 mr-2" /> Imprimir Relatório
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
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-4">
            <div className="relative w-full sm:w-[300px]">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Buscar ID, Conta, Descrição ou Documento..."
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
                    {contasCaixaBanco.map(c => (
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
                  <TableHead className="w-[100px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingLancamentos ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></TableCell></TableRow>
                ) : lancamentos.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-4 text-muted-foreground">Nenhum lançamento encontrado com os filtros aplicados.</TableCell></TableRow>
                ) : (
                  lancamentos.map((l) => {
                    const isDirectMovement = l.origem === 'movimentacao_direta';
                    const isEstorno = l.origem === 'estorno_direto';
                    const isEstornada = l.origem === 'movimentacao_direta_estornada';
                    
                    return (
                        <TableRow key={l.id} className={cn(isEstorno && 'bg-red-500/10', isEstornada && 'opacity-50')}>
                            <TableCell className="text-sm">{formatarData(l.data_movimentacao)}</TableCell>
                            <TableCell className="font-medium text-sm">{l.saldo_contas?.nome || 'N/A'}</TableCell>
                            <TableCell className="text-sm">{l.descricao} {isEstornada && '(ESTORNADO)'}</TableCell>
                            <TableCell className="text-center">
                                <Badge variant={l.tipo === 'Entrada' ? 'success' : 'destructive'} className="flex items-center justify-center">
                                    {l.tipo === 'Entrada' ? <ArrowUpCircle className="w-3 h-3 mr-1" /> : <ArrowDownCircle className="w-3 h-3 mr-1" />}
                                    {l.tipo}
                                </Badge>
                            </TableCell>
                            <TableCell className={cn("text-right font-semibold", l.valor >= 0 ? 'text-green-600' : 'text-red-600')}>
                                {formatCurrency(Math.abs(l.valor))}
                            </TableCell>
                            <TableCell className="w-[100px] text-right">
                                <div className="flex justify-end space-x-2">
                                    {isDirectMovement && (
                                        <>
                                            <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(l)} title="Editar Movimentação">
                                                <Edit className="w-4 h-4" />
                                            </Button>
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="ghost" size="icon" disabled={isUndoing || isEstornada} title="Estornar Lançamento">
                                                        <Undo2 className="w-4 h-4 text-red-500" />
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Confirmar Estorno?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            Esta ação irá criar um novo par de lançamentos de estorno (com o valor oposto) e **marcará os lançamentos originais como estornados**, mantendo o histórico. O saldo da conta será reajustado.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel disabled={isUndoing}>Cancelar</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleEstorno(l)} disabled={isUndoing}>
                                                            {isUndoing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Confirmar Estorno'}
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </>
                                    )}
                                </div>
                            </TableCell>
                        </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
    
    {editDialog.lancamento && (
        <FormMovimentacaoDiretaDialog
            open={editDialog.open}
            onOpenChange={(open) => setEditDialog({ open, lancamento: null })}
            lancamentoInicial={editDialog.lancamento}
            onSaveComplete={handleEditSaveComplete}
        />
    )}
    </>
  );
};

export default FluxoCaixaDetalhe;