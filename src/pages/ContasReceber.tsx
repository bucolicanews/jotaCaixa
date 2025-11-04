import React, { useState, useEffect, useMemo, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Plus, Filter, Search, Loader2, FileText, DollarSign, Calendar, Clock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { ContaReceber, ContaReceberComProgresso, ExtendedParcelaDetalhada, AdminRecebimento } from '@/types/contas-receber';
import { formatCurrency } from '@/utils/formatters';
import TabelaContasReceber from '@/components/TabelaContasReceber';
import TabelaParcelasReceber from '@/components/TabelaParcelasReceber';
import TabelaRecebimentos from '@/components/TabelaRecebimentos';
import DetalhesParcelasDialog from '@/components/DetalhesParcelasDialog';
import RegistrarContaReceberDialog from '@/components/RegistrarContaReceberDialog';
import { DateRange } from 'react-day-picker';

// ... (Restante do código do componente ContasReceber)

const ContasReceberPage: React.FC = () => {
    const { role, perfil, usuario } = useSessao();
    const [loading, setLoading] = useState(true);
    const [contas, setContas] = useState<ContaReceberComProgresso[]>([]);
    const [parcelas, setParcelas] = useState<ExtendedParcelaDetalhada[]>([]);
    const [recebimentos, setRecebimentos] = useState<AdminRecebimento[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('todos');
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [tab, setTab] = useState('contas');
    
    const [contaDialogOpen, setContaDialogOpen] = useState(false);
    const [parcelasDialogOpen, setParcelasDialogOpen] = useState(false);
    const [parcelaSelecionada, setParcelaSelecionada] = useState<ExtendedParcelaDetalhada | null>(null);
    const [contaSelecionada, setContaSelecionada] = useState<ContaReceber | null>(null);

    const isMyLaunch = role === 'Admin';
    
    const getOwnerId = () => {
        if (role === 'Admin') return usuario?.id || null;
        if (role === 'Cliente') return (perfil as ClienteProfile)?.id || null;
        if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id || null;
        return null;
    };
    
    const ownerId = getOwnerId();

    const fetchContasReceber = useCallback(async () => {
        if (!ownerId) return;
        setLoading(true);
        
        try {
            // 1. Fetch Contas
            const tabelaContas = isMyLaunch ? 'admin_contas_receber' : 'contas_receber';
            const ownerKey = isMyLaunch ? 'admin_id' : 'empresa_id';
            
            const { data: contasData, error: contasError } = await supabase
                .from(tabelaContas)
                .select(`
                    *,
                    clientes ( nome )
                `)
                .eq(ownerKey, ownerId)
                .order('data_vencimento', { ascending: true });
                
            if (contasError) throw contasError;
            
            // 2. Fetch Parcelas
            const tabelaParcelas = isMyLaunch ? 'admin_parcelas_receber' : 'parcelas_contas_receber';
            
            const { data: parcelasData, error: parcelasError } = await supabase
                .from(tabelaParcelas)
                .select(`
                    *,
                    contas_receber: ${tabelaContas} (
                        descricao,
                        cliente_id,
                        empresa_id,
                        origem,
                        clientes ( nome )
                    )
                `)
                .in('contas_receber.empresa_id', [ownerId]) // Filtra parcelas pertencentes à empresa
                .order('data_vencimento', { ascending: true });
                
            if (parcelasError) throw parcelasError;
            
            // 3. Fetch Recebimentos
            const tabelaRecebimentos = isMyLaunch ? 'admin_recebimentos' : 'recebimentos';
            
            const { data: recebimentosData, error: recebimentosError } = await supabase
                .from(tabelaRecebimentos)
                .select(`
                    *,
                    admin_parcelas_receber: ${isMyLaunch ? 'admin_parcelas_receber' : 'parcelas_contas_receber'} (
                        numero_parcela,
                        admin_contas_receber: ${tabelaContas} (
                            descricao,
                            origem,
                            cliente_id
                        )
                    )
                `)
                .eq(ownerKey, ownerId)
                .order('data_recebimento', { ascending: false });
                
            if (recebimentosError) throw recebimentosError;

            // Processamento de Contas (para calcular progresso)
            const parcelasPorConta = parcelasData.reduce((acc, parcela) => {
                const contaId = parcela.conta_receber_id;
                if (!acc[contaId]) {
                    acc[contaId] = { total: 0, pagas: 0 };
                }
                acc[contaId].total++;
                if (parcela.status === 'paga' || parcela.status === 'parcial') {
                    acc[contaId].pagas++;
                }
                return acc;
            }, {} as Record<string, { total: number, pagas: number }>);

            const contasComProgresso: ContaReceberComProgresso[] = contasData.map(conta => ({
                ...conta,
                parcelas_total: parcelasPorConta[conta.id]?.total || 0,
                parcelas_pagas: parcelasPorConta[conta.id]?.pagas || 0,
            }));

            setContas(contasComProgresso);
            setParcelas(parcelasData as ExtendedParcelaDetalhada[]);
            setRecebimentos(recebimentosData as AdminRecebimento[]);

        } catch (error: any) {
            showError('Erro ao carregar dados de Contas a Receber: ' + error.message);
            setContas([]);
            setParcelas([]);
            setRecebimentos([]);
        } finally {
            setLoading(false);
        }
    }, [ownerId, isMyLaunch]);

    useEffect(() => {
        fetchContasReceber();
    }, [fetchContasReceber]);

    // Lógica de Filtragem
    const contasFiltradas = useMemo(() => {
        let filtered = contas;

        if (searchTerm) {
            filtered = filtered.filter(conta =>
                conta.descricao.toLowerCase().includes(searchTerm.toLowerCase()) ||
                conta.clientes?.nome?.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        if (statusFilter !== 'todos') {
            filtered = filtered.filter(conta => conta.status === statusFilter);
        }

        if (dateRange?.from && dateRange?.to) {
            filtered = filtered.filter(conta => {
                const vencimento = new Date(conta.data_vencimento);
                return vencimento >= dateRange.from! && vencimento <= dateRange.to!;
            });
        }

        return filtered;
    }, [contas, searchTerm, statusFilter, dateRange]);

    const parcelasFiltradas = useMemo(() => {
        let filtered = parcelas;

        if (searchTerm) {
            filtered = filtered.filter(parcela =>
                parcela.contas_receber?.descricao.toLowerCase().includes(searchTerm.toLowerCase()) ||
                parcela.contas_receber?.clientes?.nome?.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        if (statusFilter !== 'todos') {
            filtered = filtered.filter(parcela => parcela.status === statusFilter);
        }

        if (dateRange?.from && dateRange?.to) {
            filtered = filtered.filter(parcela => {
                const vencimento = new Date(parcela.data_vencimento);
                return vencimento >= dateRange.from! && vencimento <= dateRange.to!;
            });
        }

        return filtered;
    }, [parcelas, searchTerm, statusFilter, dateRange]);

    const recebimentosFiltrados = useMemo(() => {
        let filtered = recebimentos;

        if (searchTerm) {
            filtered = filtered.filter(rec =>
                rec.admin_parcelas_receber?.admin_contas_receber?.descricao.toLowerCase().includes(searchTerm.toLowerCase()) ||
                rec.forma_pagamento.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }
        
        if (dateRange?.from && dateRange?.to) {
            filtered = filtered.filter(rec => {
                const dataRecebimento = new Date(rec.data_recebimento);
                return dataRecebimento >= dateRange.from! && dataRecebimento <= dateRange.to!;
            });
        }

        return filtered;
    }, [recebimentos, searchTerm, dateRange]);

    const handleOpenParcelasDialog = (parcela: ExtendedParcelaDetalhada) => {
        setParcelaSelecionada(parcela);
        setParcelasDialogOpen(true);
    };
    
    const handleOpenContaDialog = (conta: ContaReceber | null) => {
        setContaSelecionada(conta);
        setContaDialogOpen(true);
    };

    const resumoFinanceiro = useMemo(() => {
        const totalReceber = contas.reduce((sum, conta) => sum + conta.valor_total, 0);
        const totalRecebido = parcelas.filter(p => p.status === 'paga' || p.status === 'parcial').reduce((sum, p) => sum + p.valor_pago, 0);
        const totalPendente = totalReceber - totalRecebido;
        
        return { totalReceber, totalRecebido, totalPendente };
    }, [contas, parcelas]);

    return (
        <LayoutPrincipal>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Contas a Receber</h1>
                <Button onClick={() => handleOpenContaDialog(null)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Nova Conta
                </Button>
            </div>

            {/* Resumo Financeiro */}
            <div className="grid gap-4 md:grid-cols-3 mb-6">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total a Receber</CardTitle>
                        <FileText className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(resumoFinanceiro.totalReceber)}</div>
                        <p className="text-xs text-muted-foreground">Total de todas as contas registradas.</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Recebido</CardTitle>
                        <DollarSign className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">{formatCurrency(resumoFinanceiro.totalRecebido)}</div>
                        <p className="text-xs text-muted-foreground">Soma dos pagamentos efetuados.</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Pendente</CardTitle>
                        <Clock className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">{formatCurrency(resumoFinanceiro.totalPendente)}</div>
                        <p className="text-xs text-muted-foreground">Valor restante a ser recebido.</p>
                    </CardContent>
                </Card>
            </div>

            {/* Filtros e Tabs */}
            <Tabs value={tab} onValueChange={setTab} className="w-full">
                <div className="flex justify-between items-center mb-4">
                    <TabsList>
                        <TabsTrigger value="contas">Contas</TabsTrigger>
                        <TabsTrigger value="parcelas">Parcelas</TabsTrigger>
                        <TabsTrigger value="recebimentos">Recebimentos</TabsTrigger>
                    </TabsList>
                    
                    <div className="flex items-center space-x-2">
                        <div className="relative">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar..."
                                className="pl-8 w-[200px]"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className="flex items-center">
                                    <Filter className="mr-2 h-4 w-4" />
                                    Filtros
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-80 p-4 space-y-4">
                                <h4 className="font-semibold">Filtrar por Status</h4>
                                <Select value={statusFilter} onValueChange={setStatusFilter}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="todos">Todos</SelectItem>
                                        <SelectItem value="aberta">Aberta</SelectItem>
                                        <SelectItem value="parcial">Parcial</SelectItem>
                                        <SelectItem value="recebida">Recebida</SelectItem>
                                        <SelectItem value="cancelada">Cancelada</SelectItem>
                                    </SelectContent>
                                </Select>
                                
                                <h4 className="font-semibold">Filtrar por Data</h4>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                            id="date"
                                            variant={"outline"}
                                            className="w-full justify-start text-left font-normal"
                                        >
                                            <Calendar className="mr-2 h-4 w-4" />
                                            {dateRange?.from ? (
                                                dateRange.to ? (
                                                    `${format(dateRange.from, "LLL dd, y", { locale: ptBR })} - ${format(dateRange.to, "LLL dd, y", { locale: ptBR })}`
                                                ) : (
                                                    format(dateRange.from, "LLL dd, y", { locale: ptBR })
                                                )
                                            ) : (
                                                <span>Selecione um período</span>
                                            )}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="end">
                                        <CalendarComponent
                                            initialFocus
                                            mode="range"
                                            defaultMonth={dateRange?.from}
                                            selected={dateRange}
                                            onSelect={setDateRange}
                                            numberOfMonths={2}
                                            locale={ptBR}
                                        />
                                        <div className="p-2">
                                            <Button variant="ghost" onClick={() => setDateRange(undefined)} className="w-full">Limpar Filtro</Button>
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>

                {loading ? (
                    <div className="flex justify-center items-center h-64">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : (
                    <>
                        <TabsContent value="contas">
                            <TabelaContasReceber
                                contas={contasFiltradas}
                                onEditConta={handleOpenContaDialog}
                            />
                        </TabsContent>
                        <TabsContent value="parcelas">
                            <TabelaParcelasReceber
                                parcelas={parcelasFiltradas}
                                onOpenParcela={handleOpenParcelasDialog}
                            />
                        </TabsContent>
                        <TabsContent value="recebimentos">
                            <TabelaRecebimentos
                                recebimentos={recebimentosFiltrados}
                            />
                        </TabsContent>
                    </>
                )}
            </Tabs>

            {/* Dialogs */}
            <RegistrarContaReceberDialog
                contaInicial={contaSelecionada}
                open={contaDialogOpen}
                onOpenChange={setContaDialogOpen}
                onSaveComplete={fetchContasReceber}
            />
            
            <DetalhesParcelasDialog
                parcela={parcelaSelecionada} 
                open={parcelasDialogOpen}
                onOpenChange={setParcelasDialogOpen}
                onSaveComplete={fetchContasReceber}
            />
        </LayoutPrincipal>
    );
};

export default ContasReceberPage;