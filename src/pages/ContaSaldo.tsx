import LayoutPrincipal from '@/components/LayoutPrincipal';
import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, PlusCircle, Edit, Trash2, Banknote, Wallet, CreditCard, Filter, Search, TrendingUp, TrendingDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { SaldoContaDetalhada } from '@/types/saldo-conta';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import FormSaldoConta from '@/components/FormSaldoConta';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlanoContas } from '@/types/plano-contas';
import { Input } from '@/components/ui/input';
import { useDebounce } from '@/hooks/use-debounce';
import useSaldoContaCalculado from '@/hooks/use-saldo-conta-calculado'; // NOVO HOOK

type TipoSaldoFiltro = 'todos' | 'Credito' | 'Debito';
type NaturezaContabilFiltro = 'todos' | 'Ativo' | 'Passivo' | 'Receita' | 'Despesa'; // NOVO FILTRO

const ContaSaldo = () => {
  const { usuario, perfil, role, carregando: carregandoSessao } = useSessao();
  const [contasContabeis, setContasContabeis] = useState<PlanoContas[]>([]);
  const [loadingContasContabeis, setLoadingContasContabeis] = useState(true);
  const [contaSelecionada, setContaSelecionada] = useState<SaldoContaDetalhada | null>(null);
  const [dialogAberto, setDialogAberto] = useState(false);
  
  // Filtros
  const [filtroTipoSaldo, setFiltroTipoSaldo] = useState<TipoSaldoFiltro>('todos');
  const [filtroNaturezaContabil, setFiltroNaturezaContabil] = useState<NaturezaContabilFiltro>('todos'); // NOVO ESTADO DE FILTRO
  const [filtroContaContabilId, setFiltroContaContabilId] = useState<string>('todos');
  const [filtroNomeInput, setFiltroNomeInput] = useState('');
  const filtroNomeDebounced = useDebounce(filtroNomeInput, 500); 

  const getEmpresaId = () => {
    if (role === 'Admin') return usuario?.id || null;
    if (role === 'Cliente') return (perfil as ClienteProfile)?.id || null;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id || null;
    return null;
  };
  
  const empresaId = getEmpresaId();
  
  // NOVO: Usando o hook de cálculo de saldo
  const { contas, totalSaldo, carregando: carregandoSaldos, refetch: refetchSaldos } = useSaldoContaCalculado(
      filtroTipoSaldo, 
      filtroContaContabilId, 
      filtroNomeDebounced
  );

  const fetchContasContabeis = useCallback(async () => {
    if (!empresaId) return;
    setLoadingContasContabeis(true);
    
    const { data, error } = await supabase
        .from('plano_contas')
        .select('id, Conta, Descricao, Analitica')
        .eq('proprietario_id', empresaId)
        .eq('Analitica', 'Sim')
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
  
  // O refetchSaldos é chamado automaticamente pelo hook useSaldoContaCalculado quando os filtros mudam.

  const handleSaveComplete = () => {
    setDialogAberto(false);
    setContaSelecionada(null);
    refetchSaldos(); // Força a atualização do saldo
  };

  const handleEdit = (conta: SaldoContaDetalhada) => {
    setContaSelecionada(conta);
    setDialogAberto(true);
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
      refetchSaldos(); // Força a atualização do saldo
    }
  };
  
  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  
  // Helper para exibir a natureza correta
  const getNaturezaDisplay = (natureza: 'Ativo' | 'Passivo' | 'Receita' | 'Despesa', tipoSaldo: 'Credito' | 'Debito') => {
      let icon, variant;
      
      if (natureza === 'Ativo') {
          icon = <Wallet className="w-4 h-4 mr-2 text-green-600" />;
          variant = 'success' as const;
      } else if (natureza === 'Passivo') {
          icon = <CreditCard className="w-4 h-4 mr-2 text-red-600" />;
          variant = 'destructive' as const;
      } else if (natureza === 'Receita') {
          icon = <TrendingUp className="w-4 h-4 mr-2 text-blue-600" />;
          variant = 'default' as const;
      } else if (natureza === 'Despesa') {
          icon = <TrendingDown className="w-4 h-4 mr-2 text-yellow-600" />;
          variant = 'warning' as const;
      } else {
          icon = <Banknote className="w-4 h-4 mr-2 text-muted-foreground" />;
          variant = 'secondary' as const;
      }
      
      return { label: natureza, icon, variant, tipoSaldoDisplay: tipoSaldo === 'Debito' ? 'Débito' : 'Crédito' };
  };

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
  
  // Filtra as contas no frontend pelo novo filtro de Natureza Contábil
  const contasFiltradasPorNatureza = contas.filter(conta => 
      filtroNaturezaContabil === 'todos' || conta.natureza_contabil === filtroNaturezaContabil
  );

  return (
    <LayoutPrincipal>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl md:text-3xl font-bold flex items-center">
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
      
      {/* FILTROS */}
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg flex items-center"><Filter className="w-4 h-4 mr-2" /> Filtros</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-4">
            {/* Filtro por Nome/Descrição */}
            <div className="relative w-full sm:w-[300px]">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Buscar por nome da conta ou descrição contábil..."
                    value={filtroNomeInput}
                    onChange={(e) => setFiltroNomeInput(e.target.value)}
                    className="pl-10"
                />
            </div>
            
            {/* Filtro por Natureza Contábil */}
            <Select value={filtroNaturezaContabil} onValueChange={(v) => setFiltroNaturezaContabil(v as NaturezaContabilFiltro)}>
                <SelectTrigger className="w-full sm:w-[200px]">
                    <SelectValue placeholder="Filtrar por Natureza Contábil" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="todos">Todas as Naturezas</SelectItem>
                    <SelectItem value="Ativo">Ativo</SelectItem>
                    <SelectItem value="Passivo">Passivo</SelectItem>
                    <SelectItem value="Receita">Receita</SelectItem>
                    <SelectItem value="Despesa">Despesa</SelectItem>
                </SelectContent>
            </Select>
            
            {/* Filtro por Tipo de Saldo (Débito/Crédito) */}
            <Select value={filtroTipoSaldo} onValueChange={(v) => setFiltroTipoSaldo(v as TipoSaldoFiltro)}>
                <SelectTrigger className="w-full sm:w-[200px]">
                    <SelectValue placeholder="Filtrar por Tipo de Saldo" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="todos">Todos os Tipos</SelectItem>
                    <SelectItem value="Debito">Débito</SelectItem>
                    <SelectItem value="Credito">Crédito</SelectItem>
                </SelectContent>
            </Select>
            
            {/* Filtro por Conta Contábil */}
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
            <CardHeader><CardTitle className="text-xl">Contas Cadastradas ({contasFiltradasPorNatureza.length})</CardTitle></CardHeader>
            <CardContent>
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[150px]">Nome</TableHead>
                                <TableHead className="w-[100px]">Natureza</TableHead>
                                <TableHead className="w-[100px]">Tipo Saldo</TableHead>
                                <TableHead>Conta Contábil</TableHead>
                                <TableHead className="w-[150px] text-right">Saldo Atual</TableHead>
                                <TableHead className="w-[100px] text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {contasFiltradasPorNatureza.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-4 text-muted-foreground">
                                        Nenhuma conta ou caixa cadastrado.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                contasFiltradasPorNatureza.map((conta) => {
                                    const natureza = getNaturezaDisplay(conta.natureza_contabil, conta.tipo_saldo);
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
                                                {natureza.tipoSaldoDisplay}
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {conta.plano_contas?.Conta} - {conta.plano_contas?.Descricao || 'N/A'}
                                            </TableCell>
                                            <TableCell className={cn("text-right font-semibold", conta.saldo_atual >= 0 ? 'text-green-600' : 'text-red-600')}>
                                                {formatCurrency(conta.saldo_atual)}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end space-x-2">
                                                    <Button variant="ghost" size="sm" onClick={() => handleEdit(conta)}>
                                                        <Edit className="w-4 h-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="sm" onClick={() => handleDelete(conta.id)}>
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
    </LayoutPrincipal>
  );
};

export default ContaSaldo;