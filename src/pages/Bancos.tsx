import React, { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, PlusCircle, Edit, Trash2, Banknote, Wallet, CreditCard, Filter, Search, ArrowUpCircle, ArrowDownCircle, Eye, AlertCircle, CheckCircle2, Link2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { SaldoContaDetalhada } from '@/types/saldo-conta';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import FormSaldoConta from '@/components/formularios/FormSaldoConta';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlanoContas } from '@/types/plano-contas';
import { Input } from '@/components/ui/input';
import { useDebounce } from '@/hooks/use-debounce';
import useSaldoContaCalculado from '@/hooks/use-saldo-conta-calculado';
import DetalhesLancamentosDialog from '@/components/contabilidade/DetalhesLancamentosDialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useMonitoramentoContabil } from '@/hooks/useMonitoramentoContabil';

type TipoSaldoFiltro = 'todos' | 'Credito' | 'Debito' | 'Receita' | 'Despesa';

interface MonitoramentoBadgeProps {
  contaId: string;
  onVerDetalhes: () => void;
}

const MonitoramentoBadge: React.FC<MonitoramentoBadgeProps> = ({ contaId, onVerDetalhes }) => {
  const mon = useMonitoramentoContabil(contaId);

  if (mon.loading) {
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  }

  const tudo_ok = mon.totalExtratosSemVinculo === 0 && mon.lancamentosSemVinculo.length === 0;
  const tem_pendencias = mon.totalExtratosSemVinculo > 0 || mon.lancamentosSemVinculo.length > 0;

  const cor = tudo_ok
    ? 'text-green-600'
    : tem_pendencias
    ? 'text-amber-500'
    : 'text-muted-foreground';

  const icone = tudo_ok
    ? <CheckCircle2 className={cn('w-4 h-4', cor)} />
    : <AlertCircle className={cn('w-4 h-4', cor)} />;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7">
          {icone}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4" align="end">
        <div className="space-y-3">
          <p className="text-sm font-semibold flex items-center gap-1">
            <Link2 className="w-4 h-4" /> Monitoramento Contábil
          </p>

          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Extratos totais</span>
              <span className="font-medium">{mon.totalExtratos}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Vinculados</span>
              <span className="font-medium text-green-600">{mon.totalExtratosVinculados}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Sem vínculo</span>
              <div className="flex items-center gap-1">
                <span className={cn('font-medium', mon.totalExtratosSemVinculo > 0 ? 'text-red-600' : 'text-green-600')}>
                  {mon.totalExtratosSemVinculo}
                </span>
                {mon.totalExtratosSemVinculo > 0 && (
                  <Button variant="link" size="sm" className="h-auto p-0 text-xs text-blue-600" onClick={onVerDetalhes}>
                    ver
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="border-t pt-2 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Parcelas CR vinculadas</span>
              <span className="font-medium">{mon.parcelasVinculadas.filter(p => p.tipo_parcela === 'CR').length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Parcelas CP vinculadas</span>
              <span className="font-medium">{mon.parcelasVinculadas.filter(p => p.tipo_parcela === 'CP').length}</span>
            </div>
          </div>

          <div className="border-t pt-2 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Lançamentos contábeis</span>
              <span className="font-medium">{mon.lancamentos.length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Sem vínculo contábil</span>
              <div className="flex items-center gap-1">
                <span className={cn('font-medium', mon.lancamentosSemVinculo.length > 0 ? 'text-amber-600' : 'text-green-600')}>
                  {mon.lancamentosSemVinculo.length}
                </span>
                {mon.lancamentosSemVinculo.length > 0 && (
                  <Button variant="link" size="sm" className="h-auto p-0 text-xs text-blue-600" onClick={onVerDetalhes}>
                    ver
                  </Button>
                )}
              </div>
            </div>
          </div>

          {tudo_ok && (
            <p className="text-xs text-green-600 font-medium flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Tudo vinculado e lançado
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

const Bancos = () => {
  const { usuario, perfil, role, carregando: carregandoSessao } = useSessao();
  const [contasContabeis, setContasContabeis] = useState<PlanoContas[]>([]);
  const [loadingContasContabeis, setLoadingContasContabeis] = useState(true);
  const [contaSelecionada, setContaSelecionada] = useState<SaldoContaDetalhada | null>(null);
  const [dialogAberto, setDialogAberto] = useState(false);
  
  // State for details dialog
  const [detalhesDialog, setDetalhesDialog] = useState<{ open: boolean, conta: SaldoContaDetalhada | null }>({ open: false, conta: null });
  
  // Filtros
  const [filtroTipoSaldo, setFiltroTipoSaldo] = useState<TipoSaldoFiltro>('todos');
  const [filtroContaContabilId, setFiltroContaContabilId] = useState<string>('todos');
  const [filtroNomeInput, setFiltroNomeInput] = useState('');
  const filtroNomeDebounced = useDebounce(filtroNomeInput, 500); 

  const getEmpresaId = () => {
    if (role === 'Admin') return usuario?.id || null;
    if (role === 'Cliente') return (perfil as ClienteProfile)?.id || null;
    if (role === 'Usuario') {
      const user = perfil as any;
      if (user?.admin_id) return user.admin_id;
      if (user?.cliente_id) return user.cliente_id;
    }
    return null;
  };
  
  const empresaId = getEmpresaId();
  
  console.log('[Bancos] DEBUG:', { role, 'perfil?.id': (perfil as any)?.id, 'perfil?.email': (perfil as any)?.email, empresaId });
  
  const { contas, totalSaldo, carregando: carregandoSaldos, refetch: refetchSaldos } = useSaldoContaCalculado(
      filtroTipoSaldo, 
      filtroContaContabilId, 
      filtroNomeDebounced,
      'bancos' // ESCOPO PADRÃO
  );

  const fetchContasContabeis = useCallback(async () => {
    if (!empresaId) return;
    setLoadingContasContabeis(true);
    
    const { data, error } = await supabase
        .from('plano_contas')
        .select('id, Conta, Descricao, Analitica')
        .eq('proprietario_id', empresaId)
        .eq('Analitica', 'Sim')
        .eq('is_conta_caixa_banco', true) // FILTRO PRINCIPAL: Apenas contas marcadas como caixa/banco
        .order('Conta');
        
    if (error) {
        showError('Erro ao carregar Plano de Contas: ' + error.message);
        setContasContabeis([]);
    } else {
        setContasContabeis(data as PlanoContas[]);
    }
    setLoadingContasContabeis(false);
  }, [empresaId]);

  useEffect(() => {
    if (!carregandoSessao && empresaId) {
      fetchContasContabeis();
    }
  }, [carregandoSessao, empresaId, fetchContasContabeis]);
  
  const handleSaveComplete = () => {
    setDialogAberto(false);
    setContaSelecionada(null);
    refetchSaldos();
  };

  const handleEdit = (conta: SaldoContaDetalhada) => {
    setContaSelecionada(conta);
    setDialogAberto(true);
  };

  const handleOpenDetalhes = (conta: SaldoContaDetalhada) => {
    setDetalhesDialog({ open: true, conta });
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta conta?')) return;

    const { error } = await supabase
      .from('saldo_contas')
      .delete()
      .eq('id', id);

    if (error) {
      showError('Erro ao excluir conta: ' + error.message);
    } else {
      showSuccess('Conta excluída com sucesso.');
      refetchSaldos();
    }
  };
  
  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  
  if (carregandoSessao || carregandoSaldos) {
    return (
      <LayoutPrincipal>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </LayoutPrincipal>
    );
  }
  
  if (!empresaId) {
    return (
      <LayoutPrincipal>
        <Card><CardContent className="p-6 text-red-500">Você não está vinculado a uma empresa para gerenciar contas.</CardContent></Card>
      </LayoutPrincipal>
    );
  }
  
  const getNaturezaDisplay = (tipo: 'Credito' | 'Debito' | 'Receita' | 'Despesa') => {
      if (tipo === 'Debito') return { label: 'Débito (Ativo)', icon: <Wallet className="w-4 h-4 mr-2 text-green-600" />, variant: 'success' as const };
      if (tipo === 'Receita') return { label: 'Receita', icon: <ArrowUpCircle className="w-4 h-4 mr-2 text-blue-600" />, variant: 'default' as const };
      if (tipo === 'Despesa') return { label: 'Despesa', icon: <ArrowDownCircle className="w-4 h-4 mr-2 text-orange-600" />, variant: 'warning' as const };
      return { label: 'Crédito (Passivo)', icon: <CreditCard className="w-4 h-4 mr-2 text-red-600" />, variant: 'destructive' as const };
  };

  return (
    <LayoutPrincipal>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-3xl font-bold mb-6 flex items-center">
            <Banknote className="w-6 h-6 mr-2" /> Contas e Saldos
        </h1>
        <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
          <DialogTrigger asChild>
            <Button onClick={() => setContaSelecionada(null)} className="w-full sm:w-auto">
              <PlusCircle className="w-4 h-4 mr-2" />
              Nova Conta
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{contaSelecionada ? 'Editar Conta' : 'Nova Conta'}</DialogTitle>
            </DialogHeader>
            <FormSaldoConta 
              contaInicial={contaSelecionada}
              onSaveComplete={handleSaveComplete}
            />
          </DialogContent>
        </Dialog>
      </div>
      
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg flex items-center"><Filter className="w-4 h-4 mr-2" /> Filtros</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-4">
            <div className="relative w-full sm:w-[300px]">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Buscar por nome da conta ou descrição contábil..."
                    value={filtroNomeInput}
                    onChange={(e) => setFiltroNomeInput(e.target.value)}
                    className="pl-10"
                />
            </div>
            
            <Select value={filtroTipoSaldo} onValueChange={(v) => setFiltroTipoSaldo(v as TipoSaldoFiltro)}>
                <SelectTrigger className="w-full sm:w-[200px]">
                    <SelectValue placeholder="Filtrar por Natureza" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="todos">Todas as Naturezas</SelectItem>
                    <SelectItem value="Debito">Débito (Ativo)</SelectItem>
                    <SelectItem value="Credito">Crédito (Passivo)</SelectItem>
                    <SelectItem value="Receita">Receita</SelectItem>
                    <SelectItem value="Despesa">Despesa</SelectItem>
                </SelectContent>
            </Select>
            
            <Select 
                value={filtroContaContabilId} 
                onValueChange={setFiltroContaContabilId} 
                disabled={loadingContasContabeis}
            >
                <SelectTrigger className="w-full sm:w-[300px]">
                    <SelectValue placeholder={loadingContasContabeis ? "Carregando Contas Contábeis..." : "Filtrar por Conta Contábil"} />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="todos">Todas as Contas Contábeis</SelectItem>
                    {contasContabeis.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                            {c.Conta} - {c.Descricao}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </CardContent>
      </Card>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <Card className="md:col-span-2">
            <CardHeader><CardTitle className="text-xl">Contas Cadastradas ({contas.length})</CardTitle></CardHeader>
            <CardContent>
                <div className="overflow-x-auto max-h-[60vh]">
                    <Table>
                        <TableHeader className="sticky top-0 bg-background z-10">
                            <TableRow>
                                <TableHead className="w-[150px]">Nome</TableHead>
                                <TableHead className="w-[100px]">Natureza</TableHead>
                                <TableHead>Conta Contábil</TableHead>
                                <TableHead className="w-[80px] text-center">Contábil</TableHead>
                                <TableHead className="w-[150px] text-right">Saldo Atual</TableHead>
                                <TableHead className="w-[100px] text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {contas.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-4 text-muted-foreground">
                                        Nenhuma conta ou caixa cadastrado.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                contas.map((conta) => {
                                    const natureza = getNaturezaDisplay(conta.tipo_saldo);
                                    return (
                                        <TableRow key={conta.id}>
                                            <TableCell className="font-medium flex items-center">
                                                {natureza.icon}
                                                {conta.nome}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={natureza.variant}>
                                                    {natureza.label}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {conta.plano_contas?.Conta} - {conta.plano_contas?.Descricao || 'N/A'}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <MonitoramentoBadge
                                                    contaId={conta.id}
                                                    onVerDetalhes={() => handleOpenDetalhes(conta)}
                                                />
                                            </TableCell>
                                            <TableCell className={cn("text-right font-semibold", conta.saldo_atual >= 0 ? 'text-green-600' : 'text-red-600')}>
                                                {formatCurrency(conta.saldo_atual)}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end space-x-1">
                                                    <Button variant="ghost" size="icon" onClick={() => handleOpenDetalhes(conta)} title="Ver Detalhes">
                                                        <Eye className="w-4 h-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" onClick={() => handleEdit(conta)} title="Editar Conta">
                                                        <Edit className="w-4 h-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" onClick={() => handleDelete(conta.id)} title="Excluir Conta">
                                                        <Trash2 className="w-4 h-4 text-red-500" />
                                                    </Button>
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
        
        <Card>
            <CardHeader><CardTitle className="text-xl">Resumo de Saldo</CardTitle></CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground">Soma dos saldos atuais de todas as contas.</p>
                <p className={cn("text-3xl font-bold mt-2", totalSaldo >= 0 ? 'text-green-600' : 'text-red-600')}>
                    {formatCurrency(totalSaldo)}
                </p>
            </CardContent>
        </Card>
      </div>

      <DetalhesLancamentosDialog
        conta={detalhesDialog.conta}
        open={detalhesDialog.open}
        onOpenChange={(open: boolean) => setDetalhesDialog({ open, conta: null })}
      />
    </LayoutPrincipal>
  );
};

export default Bancos;