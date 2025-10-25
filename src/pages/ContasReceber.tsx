import { useState, useEffect } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, PlusCircle, Edit, Trash2, ListChecks } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { ContaReceber, ParcelaDetalhada } from '@/types/contas-receber';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import FormContasReceber from '@/components/FormContasReceber';
import DetalhesParcelasDialog from '@/components/DetalhesParcelasDialog';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { DateRange } from 'react-day-picker';
import { DateRangePicker } from '@/components/DateRangePicker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { isToday, isPast, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';


type ParcelaStatus = 'aberta' | 'parcial' | 'paga' | 'reprogramada' | 'cancelada';
type BadgeVariant = 'success' | 'warning' | 'secondary' | 'destructive' | 'default' | 'info';

const getBadgeVariant = (status: ParcelaStatus, dataVencimento: string): BadgeVariant => {
  const vencimento = parseISO(dataVencimento + 'T00:00:00');

  if (status === 'paga') {
    return 'success'; // Verde para pago
  }
  
  if (status === 'cancelada') {
    return 'destructive';
  }

  // Lógica para status não pagos (aberta, parcial, reprogramada)
  
  // 1. Vencido (Vermelho)
  if (isPast(vencimento) && !isToday(vencimento)) {
    return 'destructive';
  }
  
  // 2. Vencendo Hoje, Parcial ou Reprogramada (Laranja/Amarelo)
  if (isToday(vencimento) || status === 'parcial' || status === 'reprogramada') {
    return 'warning';
  }

  // 3. Status Aberta (Azul/Info)
  if (status === 'aberta') {
    return 'info';
  }

  return 'secondary'; // Fallback
};

const ContasReceber = () => {
  const { usuario, carregando: carregandoSessao } = useSessao();
  const [contas, setContas] = useState<ContaReceber[]>([]);
  const [parcelas, setParcelas] = useState<ParcelaDetalhada[]>([]);
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [contaSelecionada, setContaSelecionada] = useState<ContaReceber | null>(null);
  const [dialogFormAberto, setDialogFormAberto] = useState(false);
  const [dialogParcelasAberto, setDialogParcelasAberto] = useState(false);
  
  // Filtros
  const [filtroGeral, setFiltroGeral] = useState('');
  const [filtroPeriodo, setFiltroPeriodo] = useState<DateRange | undefined>(undefined);
  const [filtroStatus, setFiltroStatus] = useState<string>('todos'); // 'todos', 'aberta', 'paga', 'pendente'

  const buscarDados = async () => {
    setCarregandoDados(true);
    const [contasRes, parcelasRes] = await Promise.all([
      supabase.from('contas_receber').select('*, clientes(*)').order('data_vencimento', { ascending: true }),
      supabase.from('parcelas_contas_receber').select('*, contas_receber(descricao, clientes(nome))').order('data_vencimento', { ascending: true })
    ]);

    if (contasRes.error) showError('Erro ao carregar contas: ' + contasRes.error.message);
    else setContas(contasRes.data as any[]);

    if (parcelasRes.error) showError('Erro ao carregar parcelas: ' + parcelasRes.error.message);
    else setParcelas(parcelasRes.data as any[]);
    
    setCarregandoDados(false);
  };

  useEffect(() => {
    if (!carregandoSessao && usuario) {
      buscarDados();
    }
  }, [carregandoSessao, usuario]);

  const handleSaveComplete = () => {
    setDialogFormAberto(false);
    setContaSelecionada(null);
    buscarDados();
  };

  const handleDelete = async (contaId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este conta e todas as suas parcelas? A ação não pode ser desfeita.')) return;
    const { error } = await supabase.from('contas_receber').delete().eq('id', contaId);
    if (error) showError('Erro ao excluir conta: ' + error.message);
    else {
      showSuccess('Conta excluída com sucesso.');
      buscarDados();
    }
  };

  const handleOpenParcelas = (conta: ContaReceber) => {
    setContaSelecionada(conta);
    setDialogParcelasAberto(true);
  };

  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const formatDate = (dateString: string) => new Date(dateString + 'T00:00:00').toLocaleDateString('pt-BR');

  const parcelasFiltradas = parcelas.filter(p => {
    const termoBusca = filtroGeral.toLowerCase();
    const dataVencimento = new Date(p.data_vencimento + 'T00:00:00');

    // 1. Filtro de Período (Data de Vencimento)
    if (filtroPeriodo?.from) {
      const from = filtroPeriodo.from;
      const to = filtroPeriodo.to || from;
      
      // Ajusta 'to' para incluir o final do dia
      const adjustedTo = new Date(to);
      adjustedTo.setHours(23, 59, 59, 999);

      if (dataVencimento < from || dataVencimento > adjustedTo) {
        return false;
      }
    }

    // 2. Filtro de Status
    if (filtroStatus !== 'todos') {
      const status = p.status;
      if (filtroStatus === 'pendente' && (status === 'paga' || status === 'cancelada')) {
        return false;
      }
      if (filtroStatus === 'paga' && status !== 'paga') {
        return false;
      }
      if (filtroStatus === 'aberta' && status !== 'aberta' && status !== 'parcial' && status !== 'reprogramada') {
        return false;
      }
    }

    // 3. Filtro Geral (Texto)
    return (
      (p.contas_receber?.clientes?.nome?.toLowerCase() || '').includes(termoBusca) ||
      (p.contas_receber?.descricao?.toLowerCase() || '').includes(termoBusca) ||
      String(p.numero_parcela).includes(termoBusca) ||
      formatDate(p.data_vencimento).includes(termoBusca) ||
      formatCurrency(p.valor_parcela).includes(termoBusca) ||
      formatCurrency(p.valor_pago || 0).includes(termoBusca) ||
      p.status.toLowerCase().includes(termoBusca)
    );
  });

  if (carregandoSessao || carregandoDados) {
    return <LayoutPrincipal><div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></LayoutPrincipal>;
  }

  return (
    <LayoutPrincipal>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl md:text-3xl font-bold">Contas a Receber</h1>
        <Dialog open={dialogFormAberto} onOpenChange={setDialogFormAberto}>
          <DialogTrigger asChild>
            <Button onClick={() => setContaSelecionada(null)} className="w-full sm:w-auto">
              <PlusCircle className="w-4 h-4 mr-2" />
              Nova Conta
            </Button>
          </DialogTrigger>
          <DialogContent><DialogHeader><DialogTitle>{contaSelecionada ? 'Editar Conta' : 'Nova Conta a Receber'}</DialogTitle></DialogHeader><FormContasReceber contaInicial={contaSelecionada} onSaveComplete={handleSaveComplete} /></DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="lancamentos" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="lancamentos">Lançamentos (Sintético)</TabsTrigger>
          <TabsTrigger value="parcelas">Todas as Parcelas (Analítico)</TabsTrigger>
        </TabsList>
        <TabsContent value="parcelas">
          <Card>
            <CardHeader>
              <CardTitle>Detalhamento de Todas as Parcelas</CardTitle>
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
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Descrição</TableHead><TableHead className="text-center">Nº Parcela</TableHead><TableHead>Vencimento</TableHead><TableHead>Valor da Parcela</TableHead><TableHead>Valor Pago</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {parcelasFiltradas.length > 0 ? (
                      parcelasFiltradas.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell>{p.contas_receber?.clientes?.nome || 'N/A'}</TableCell>
                          <TableCell>{p.contas_receber?.descricao || 'N/A'}</TableCell>
                          <TableCell className="text-center">{p.numero_parcela}</TableCell>
                          <TableCell>{formatDate(p.data_vencimento)}</TableCell>
                          <TableCell>{formatCurrency(p.valor_parcela)}</TableCell>
                          <TableCell className="font-medium">{formatCurrency(p.valor_pago || 0)}</TableCell>
                          <TableCell><Badge variant={getBadgeVariant(p.status, p.data_vencimento)}>{p.status}</Badge></TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center h-24">
                          Nenhum resultado encontrado.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="lancamentos">
          <Card>
            <CardHeader><CardTitle>Resumo dos Lançamentos</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {/* AÇÕES (PRIMEIRA COLUNA) */}
                      <TableHead className="text-left">Ações</TableHead> 
                      <TableHead>Cliente</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Valor Total</TableHead>
                      {/* Ocultar Status em telas pequenas */}
                      <TableHead className="hidden sm:table-cell">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contas.map((conta) => {
                      const statusVariant = getBadgeVariant(conta.status as ParcelaStatus, conta.data_vencimento);
                      
                      // Mapeamento de variantes para classes de texto do Tailwind
                      const statusColorClass = {
                        success: 'text-green-500',
                        warning: 'text-yellow-500',
                        destructive: 'text-red-500',
                        info: 'text-blue-500',
                        secondary: 'text-muted-foreground',
                        default: 'text-primary',
                      }[statusVariant];

                      return (
                        <TableRow key={conta.id}>
                          {/* CÉLULA DE AÇÕES (PRIMEIRA) */}
                          <TableCell className="text-left min-w-[120px]">
                            <div className="flex flex-col space-y-1 sm:flex-row sm:space-x-1 sm:space-y-0">
                              <Button variant="ghost" size="icon" onClick={() => handleOpenParcelas(conta)} title="Ver Parcelas"><ListChecks className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => { setContaSelecionada(conta); setDialogFormAberto(true); }}><Edit className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDelete(conta.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                            </div>
                          </TableCell>
                          
                          <TableCell className="font-medium">
                            {conta.clientes?.nome || 'N/A'}
                            {/* Exibir Status abaixo do nome do cliente em telas pequenas */}
                            <span className={cn("block text-xs font-normal sm:hidden", statusColorClass)}>
                              ({conta.status})
                            </span>
                          </TableCell>
                          <TableCell>{conta.descricao}</TableCell>
                          <TableCell>{formatDate(conta.data_vencimento)}</TableCell>
                          <TableCell>{formatCurrency(conta.valor_total)}</TableCell>
                          {/* Ocultar Badge em telas pequenas */}
                          <TableCell className="hidden sm:table-cell">
                            <Badge variant={statusVariant}>{conta.status}</Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <DetalhesParcelasDialog
        conta={contaSelecionada}
        open={dialogParcelasAberto}
        onOpenChange={setDialogParcelasAberto}
        onDataChange={buscarDados}
      />
    </LayoutPrincipal>
  );
};

export default ContasReceber;