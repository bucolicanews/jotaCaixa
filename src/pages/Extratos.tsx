import React, { useState, useEffect, useCallback, useMemo } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Banknote, Filter, Search, Eye, Edit, Trash2, Printer, ArrowUpCircle, ArrowDownCircle, TrendingUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { formatCurrency, formatarData } from '@/utils/formatters';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDebounce } from '@/hooks/use-debounce';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { TransacaoExtrato } from '@/types/conciliacao';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import ExtratoFormDialog from '@/components/ExtratoFormDialog';
import { PlanoContas } from '@/types/plano-contas';
import { useContabilConfig } from '@/hooks/use-contabil-config';
import { DateRangePicker } from '@/components/DateRangePicker';
import { DateRange } from 'react-day-picker';
import { format, parseISO } from 'date-fns';
import { usePrint } from '@/hooks/use-print';
import ReactDOMServer from 'react-dom/server';
import ExtratosPrint from '@/components/contabilidade/ExtratosPrint';
import { useOwnerBranding } from '@/hooks/use-owner-branding';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

interface ExtratoRecord extends TransacaoExtrato {
    id: string;
    id_saldo_contas: string;
    empresa_id: string;
    saldo_contas: { nome: string } | null;
}

const Extratos: React.FC = () => {
  const { usuario, carregando: carregandoSessao } = useSessao();
  const { configMap } = useContabilConfig();
  const { printContent } = usePrint();
  const { logoUrl, ownerName } = useOwnerBranding();
  
  const [extratos, setExtratos] = useState<ExtratoRecord[]>([]);
  const [contasContabeisResultado, setContasContabeisResultado] = useState<PlanoContas[]>([]);
  const [carregandoExtratos, setCarregandoExtratos] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Filtros
  const [filtroContaId, setFiltroContaId] = useState('todos');
  const [filtroTexto, setFiltroTexto] = useState('');
  const filtroTextoDebounced = useDebounce(filtroTexto, 500);
  const [contasDisponiveis, setContasDisponiveis] = useState<{ id: string, nome: string }[]>([]);
  const [filtroPeriodo, setFiltroPeriodo] = useState<DateRange | undefined>(undefined);
  
  // Edição
  const [extratoParaEditar, setExtratoParaEditar] = useState<ExtratoRecord | null>(null);
  const [dialogAberto, setDialogAberto] = useState(false);

  const ownerId = usuario?.id;

  const fetchContas = useCallback(async () => {
    if (!ownerId) return;
    
    // Busca contas de saldo que estão vinculadas a uma conta contábil marcada como is_banco = true
    const { data, error } = await supabase
        .from('saldo_contas')
        .select(`
            id, 
            nome, 
            plano_contas ( is_banco )
        `)
        .eq('proprietario_id', ownerId)
        .eq('plano_contas.is_banco', true); // FILTRO CRÍTICO: Apenas contas bancárias

    if (error) {
        console.error('Erro ao carregar contas:', error);
        setContasDisponiveis([]);
    } else {
        // Filtra para garantir que apenas contas com is_banco = true sejam retornadas
        const filtered = (data || []).filter(c => c.plano_contas?.is_banco === true);
        setContasDisponiveis(filtered.map(c => ({ id: c.id, nome: c.nome })) || []);
    }
  }, [ownerId]);
  
  const fetchContasContabeisResultado = useCallback(async () => {
    if (!ownerId) return;
    
    const { data, error } = await supabase
        .from('plano_contas')
        .select('id, Conta, Descricao')
        .eq('proprietario_id', ownerId)
        .eq('Analitica', 'Sim')
        .eq('is_conta_resultado', true)
        .order('Conta');
        
    if (error) {
        showError('Erro ao carregar Plano de Contas: ' + error.message);
        setContasContabeisResultado([]);
    } else {
        setContasContabeisResultado(data as PlanoContas[]);
    }
  }, [ownerId]);

  const fetchExtratos = useCallback(async () => {
    if (!ownerId) return;
    setCarregandoExtratos(true);
    
    let query = supabase
      .from('extratos')
      .select(`
        *,
        saldo_contas:id_saldo_contas ( nome )
      `)
      .eq('empresa_id', ownerId)
      .order('data', { ascending: false });
      
    if (filtroContaId !== 'todos') {
        query = query.eq('id_saldo_contas', filtroContaId);
    }
    
    if (filtroTextoDebounced) {
        const termo = `%${filtroTextoDebounced}%`;
        query = query.or(`descricao.ilike.${termo},identificacao.ilike.${termo}`);
    }
    
    // NOVO FILTRO DE DATA
    if (filtroPeriodo?.from) {
        query = query.gte('data', format(filtroPeriodo.from, 'yyyy-MM-dd'));
    }
    if (filtroPeriodo?.to) {
        query = query.lte('data', format(filtroPeriodo.to, 'yyyy-MM-dd'));
    }

    const { data, error } = await query;

    if (error) {
      showError('Erro ao carregar extratos: ' + error.message);
      setExtratos([]);
    } else {
      setExtratos(data as ExtratoRecord[]);
    }
    setCarregandoExtratos(false);
  }, [ownerId, filtroContaId, filtroTextoDebounced, filtroPeriodo]);

  useEffect(() => {
    if (!carregandoSessao && ownerId) {
      fetchContas();
      fetchExtratos();
      fetchContasContabeisResultado();
    }
  }, [carregandoSessao, ownerId, fetchContas, fetchExtratos, fetchContasContabeisResultado]);
  
  const handleEdit = (extrato: ExtratoRecord) => {
      setExtratoParaEditar(extrato);
      setDialogAberto(true);
  };
  
  const handleDelete = async (extrato: ExtratoRecord) => {
    if (!window.confirm('Tem certeza que deseja excluir este registro de extrato? Esta ação também tentará DELETAR os lançamentos contábeis correspondentes na tabela Lançamentos.')) return;
    
    setIsDeleting(true);
    try {
        // 1. Deletar os lançamentos correspondentes na tabela 'lancamentos'
        const valorAbsoluto = Math.abs(extrato.valor);
        
        // Deleta o lançamento de Ativo/Caixa (que tem conta_bancaria_id)
        const { error: deleteAtivoError } = await supabase
            .from('lancamentos')
            .delete()
            .eq('proprietario_id', extrato.empresa_id)
            .eq('conta_bancaria_id', extrato.id_saldo_contas)
            .eq('descricao', extrato.descricao)
            .eq('valor', valorAbsoluto)
            .eq('origem', 'conciliacao_extrato');
            
        if (deleteAtivoError) console.warn('Aviso: Falha ao deletar lançamento de Ativo/Caixa:', deleteAtivoError);
        
        // Deleta o lançamento de Resultado/DRE (que tem conta_contabil_id)
        if (extrato.conta_contabil_id) {
            const { error: deleteResultadoError } = await supabase
                .from('lancamentos')
                .delete()
                .eq('proprietario_id', extrato.empresa_id)
                .eq('conta_contabil_id', extrato.conta_contabil_id)
                .eq('descricao', extrato.descricao)
                .eq('valor', valorAbsoluto)
                .eq('origem', 'conciliacao_extrato');
                
            if (deleteResultadoError) console.warn('Aviso: Falha ao deletar lançamento de Resultado/DRE:', deleteResultadoError);
        }
        
        // 2. Deleta o registro da tabela 'extratos'
        const { error: extratoError } = await supabase
            .from('extratos')
            .delete()
            .eq('id', extrato.id);
            
        if (extratoError) throw extratoError;
        
        showSuccess('Registro de extrato e lançamentos contábeis correspondentes excluídos com sucesso.');
        fetchExtratos();
    } catch (error: any) {
        showError('Falha ao excluir extrato: ' + error.message);
    } finally {
        setIsDeleting(false);
    }
  };
  
  const handleSaveComplete = () => {
      setDialogAberto(false);
      setExtratoParaEditar(null);
      fetchExtratos();
  };
  
  const handlePrint = (orientation: 'portrait' | 'landscape') => {
    if (extratos.length === 0) {
        showError('Nenhum extrato para imprimir.');
        return;
    }
    
    const printComponent = (
        <ExtratosPrint
            data={extratos}
            filtroPeriodo={filtroPeriodo}
            logoUrl={logoUrl}
            ownerName={ownerName}
        />
    );

    const htmlContent = ReactDOMServer.renderToStaticMarkup(printComponent);
    printContent(htmlContent, `Extratos - ${ownerName}`, orientation);
  };
  
  // --- CÁLCULO DOS TOTAIS PARA OS CARDS ---
  const { totalEntradas, totalSaidas, variacaoLiquida } = useMemo(() => {
      const entradas = extratos.filter(e => e.tipo === 'Entrada').reduce((sum, e) => sum + Math.abs(e.valor), 0);
      const saidas = extratos.filter(e => e.tipo === 'Saida').reduce((sum, e) => sum + Math.abs(e.valor), 0);
      const variacao = entradas - saidas;
      return { totalEntradas: entradas, totalSaidas: saidas, variacaoLiquida: variacao };
  }, [extratos]);
  // ---------------------------------------

  if (carregandoSessao || carregandoExtratos) {
    return (
      <LayoutPrincipal>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </LayoutPrincipal>
    );
  }
  
  if (!ownerId) {
    return <LayoutPrincipal><Card><CardContent className="p-6">Você não está vinculado a uma empresa para ver extratos.</CardContent></Card></LayoutPrincipal>;
  }

  return (
    <LayoutPrincipal>
      <h1 className="text-2xl md:text-3xl font-bold mb-6 flex items-center">
        <Banknote className="w-6 h-6 mr-2" /> Extratos Bancários Salvos
      </h1>
      
      {/* NOVO: CARDS DE RESUMO */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <Card className="border-l-4 border-green-500">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-green-700 dark:text-green-300">Total de Entradas</CardTitle>
                  <ArrowUpCircle className="w-4 h-4 text-green-500" />
              </CardHeader>
              <CardContent>
                  <div className="text-2xl font-bold mt-1 text-green-600">
                      {formatCurrency(totalEntradas)}
                  </div>
              </CardContent>
          </Card>
          <Card className="border-l-4 border-red-500">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-red-700 dark:text-red-300">Total de Saídas</CardTitle>
                  <ArrowDownCircle className="w-4 h-4 text-red-500" />
              </CardHeader>
              <CardContent>
                  <div className="text-2xl font-bold mt-1 text-red-600">
                      {formatCurrency(totalSaidas)}
                  </div>
              </CardContent>
          </Card>
          <Card className={cn("border-l-4", variacaoLiquida >= 0 ? "border-blue-500" : "border-red-500")}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-foreground">Variação Líquida</CardTitle>
                  <TrendingUp className="w-4 h-4 text-primary" />
              </CardHeader>
              <CardContent>
                  <div className={cn("text-2xl font-bold mt-1", variacaoLiquida >= 0 ? "text-blue-600" : "text-red-600")}>
                      {formatCurrency(variacaoLiquida)}
                  </div>
              </CardContent>
          </Card>
      </div>
      {/* FIM CARDS DE RESUMO */}
      
      <Card className="mb-6">
        <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center"><Filter className="w-4 h-4 mr-2" /> Filtros e Ações</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col md:flex-row gap-4">
            <div className="relative w-full md:w-[300px]">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Buscar por descrição ou identificação..."
                    value={filtroTexto}
                    onChange={(e) => setFiltroTexto(e.target.value)}
                    className="pl-10"
                />
            </div>
            
            <Select value={filtroContaId} onValueChange={setFiltroContaId}>
                <SelectTrigger className="w-full md:w-[250px]">
                    <SelectValue placeholder="Filtrar por Conta/Caixa" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="todos">Todas as Contas</SelectItem>
                    {contasDisponiveis.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            
            <DateRangePicker date={filtroPeriodo} setDate={setFiltroPeriodo} />
            
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full md:w-auto" disabled={extratos.length === 0}>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-xl">Transações Salvas ({extratos.length})</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Data</TableHead>
                  <TableHead className="w-[150px]">Conta/Caixa</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="w-[100px]">Identificação</TableHead>
                  <TableHead className="w-[80px] text-center">Tipo</TableHead>
                  <TableHead className="w-[120px] text-right">Valor</TableHead>
                  <TableHead className="w-[150px]">Conta Contábil</TableHead>
                  <TableHead className="w-[100px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {extratos.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-4 text-muted-foreground">Nenhum extrato salvo.</TableCell></TableRow>
                ) : (
                  extratos.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-sm">{formatarData(e.data)}</TableCell>
                      <TableCell className="font-medium text-sm">{e.saldo_contas?.nome || 'N/A'}</TableCell>
                      <TableCell className="text-sm">{e.descricao}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{e.identificacao || '-'}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={e.tipo === 'Entrada' ? 'success' : 'destructive'}>
                          {e.tipo}
                        </Badge>
                      </TableCell>
                      <TableCell className={cn("text-right font-semibold", e.valor >= 0 ? 'text-green-600' : 'text-red-600')}>
                        {formatCurrency(Math.abs(e.valor))}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{e.conta_contabil_id || 'N/A'}</TableCell>
                      <TableCell className="text-right space-x-2">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(e)} title="Editar Extrato">
                              <Edit className="w-4 h-4" />
                          </Button>
                          <AlertDialog>
                              <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon" disabled={isDeleting} title="Excluir Extrato">
                                      <Trash2 className="w-4 h-4 text-red-500" />
                                  </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                  <AlertDialogHeader>
                                      <AlertDialogTitle>Excluir Registro de Extrato?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                          Esta ação removerá o registro de extrato e tentará DELETAR os lançamentos contábeis correspondentes. O saldo da conta será recalculado.
                                      </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                      <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => handleDelete(e)} disabled={isDeleting}>
                                          {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Excluir'}
                                      </AlertDialogAction>
                                  </AlertDialogFooter>
                              </AlertDialogContent>
                          </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      
      <ExtratoFormDialog
          extratoInicial={extratoParaEditar}
          open={dialogAberto}
          onOpenChange={setDialogAberto}
          onSaveComplete={handleSaveComplete}
          contasContabeis={contasContabeisResultado}
      />
    </LayoutPrincipal>
  );
};

export default Extratos;