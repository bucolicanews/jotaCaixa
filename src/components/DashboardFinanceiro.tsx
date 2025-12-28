import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ArrowUpCircle, ArrowDownCircle, Banknote, TrendingUp, Scale, Filter, Wallet, Landmark, Eye, EyeOff, PlusCircle } from 'lucide-react';
import { useSessao } from '@/hooks/use-sessao';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { formatCurrency } from '@/utils/formatters';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import useSaldoContaCalculado from '@/hooks/use-saldo-conta-calculado';
import { startOfMonth, endOfMonth, format, addDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useNavigate, Link } from 'react-router-dom';
import { ClienteProfile, UsuarioProfile, AdminUsuarioProfile } from '@/types/usuario';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { useOwner } from '@/hooks/use-owner';

interface FluxoData {
    receber: number;
    pagar: number;
    isGeral: boolean; // Novo campo para indicar se os dados são de parcelas ou lançamentos
}

interface ContaMensalData {
    saldoInicial: number;
    entradas: number;
    saidas: number;
    saldoFinal: number;
}

// NOVO TIPO: Para depuração
interface LancamentoDetalhe {
    valor: number;
    tipo: 'Entrada' | 'Saida';
    origem: string;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

const DashboardFinanceiro: React.FC = () => {
    const { usuario, perfil, role, carregando: carregandoSessao } = useSessao();
    const { ownerId, ownerType } = useOwner();
    const navigate = useNavigate();
    
    const [filtroContaId, setFiltroContaId] = useState('todos'); // 'todos' ou ID da conta
    const [fluxoData, setFluxoData] = useState<FluxoData>({ receber: 0, pagar: 0, isGeral: true });
    const [contaMensalData, setContaMensalData] = useState<ContaMensalData | null>(null);
    const [loadingFluxo, setLoadingFluxo] = useState(true);
    const [totalAReceber30Dias, setTotalAReceber30Dias] = useState(0);
    const [totalAPagar30Dias, setTotalAPagar30Dias] = useState(0);
    
    // NOVO ESTADO: Visibilidade da Depuração
    const [showDebug, setShowDebug] = useState(false);
    
    // NOVO ESTADO: Movimentações Realizadas (Entradas/Saídas)
    const [totalEntradasRealizadas, setTotalEntradasRealizadas] = useState(0);
    const [totalSaidasRealizadas, setTotalSaidasRealizadas] = useState(0);
    const [lancamentosDetalhes, setLancamentosDetalhes] = useState<LancamentoDetalhe[]>([]); // NOVO ESTADO

    const isAdmin = role === 'Admin';
    
    // Hook para buscar saldos de contas (Ativo/Passivo)
    const { contas, totalSaldo, carregando: carregandoSaldos } = useSaldoContaCalculado('todos', 'todos', '', 'bancos');
    
    // Filtra as contas para o gráfico de Saldo por Conta
    const contasFiltradas = useMemo(() => {
        if (filtroContaId === 'todos') return contas;
        return contas.filter(c => c.id === filtroContaId);
    }, [contas, filtroContaId]);

    // Helper para determinar tabelas
    const getTables = (type: 'CR' | 'CP') => {
        const isOwnerAdmin = ownerType === 'Admin' || ownerType === 'AdminUsuario';
        if (type === 'CR') {
            return {
                tabelaParcelas: isOwnerAdmin ? 'admin_parcelas_receber' : 'parcelas_contas_receber',
                ownerKey: isOwnerAdmin ? 'admin_id' : 'empresa_id',
            };
        } else {
            return {
                tabelaParcelas: isOwnerAdmin ? 'admin_parcelas_pagar' : 'parcelas_contas_pagar',
                ownerKey: isOwnerAdmin ? 'admin_id' : 'empresa_id',
            };
        }
    };

    const fetchContaMensalData = useCallback(async (contaId: string) => {
        if (!ownerId) return;
        setLoadingFluxo(true);

        const startOfMonthISO = format(startOfMonth(new Date()), 'yyyy-MM-dd');
        const endOfMonthISO = format(endOfMonth(new Date()), 'yyyy-MM-dd');
        
        const contaSelecionada = contas.find(c => c.id === contaId);
        const saldoInicialConta = contaSelecionada?.saldo_inicial || 0;

        try {
            // 1. Buscar Lançamentos do Mês Atual
            const { data: lancamentosData, error: lError } = await supabase
                .from('lancamentos')
                .select('valor, tipo, origem')
                .eq('proprietario_id', ownerId)
                .eq('conta_bancaria_id', contaId)
                .gte('data_movimentacao', startOfMonthISO)
                .lte('data_movimentacao', endOfMonthISO);
                
            if (lError) throw lError;
            
            const safeLancamentos = (lancamentosData || []).filter(l => !l.origem.includes('estorno'));
            
            const entradas = safeLancamentos.filter(l => l.tipo === 'Entrada').reduce((sum, l) => sum + l.valor, 0);
            const saidas = safeLancamentos.filter(l => l.tipo === 'Saida').reduce((sum, l) => sum + l.valor, 0);
            
            // 2. Calcular Saldo Inicial (antes do mês atual)
            const { data: lancamentosAnteriores, error: laError } = await supabase
                .from('lancamentos')
                .select('valor, tipo, origem')
                .eq('proprietario_id', ownerId)
                .eq('conta_bancaria_id', contaId)
                .lt('data_movimentacao', startOfMonthISO);
                
            if (laError) console.error('Erro ao buscar lançamentos anteriores:', laError);
            
            const safeLancamentosAnteriores = (lancamentosAnteriores || []).filter(l => !l.origem.includes('estorno'));
            
            const entradasAnteriores = safeLancamentosAnteriores.filter(l => l.tipo === 'Entrada').reduce((sum, l) => sum + l.valor, 0);
            const saidasAnteriores = safeLancamentosAnteriores.filter(l => l.tipo === 'Saida').reduce((sum, l) => sum + l.valor, 0);
            
            const saldoInicialCalculado = saldoInicialConta + entradasAnteriores - saidasAnteriores;
            const saldoFinal = saldoInicialCalculado + entradas - saidas;

            setContaMensalData({
                saldoInicial: saldoInicialCalculado,
                entradas: entradas,
                saidas: saidas,
                saldoFinal: saldoFinal,
            });
            
            // Atualiza o fluxo de caixa para o gráfico (Entradas vs Saídas do mês)
            setFluxoData({ receber: entradas, pagar: saidas, isGeral: false });
            setTotalEntradasRealizadas(entradas);
            setTotalSaidasRealizadas(saidas);
            setLancamentosDetalhes(safeLancamentos as LancamentoDetalhe[]);
        } catch (e: any) {
            console.error('❌ DASHBOARD ERROR (fetchContaMensalData):', e);
            setContaMensalData(null);
            showError('Falha ao carregar dados mensais: ' + e.message);
        } finally {
            setLoadingFluxo(false);
        }

    }, [ownerId, contas]);


    const fetchFluxoDataGeral = useCallback(async () => {
        if (!ownerId) return;
        setLoadingFluxo(true);
        setContaMensalData(null); // Limpa dados mensais se for geral

        const start = format(startOfMonth(new Date()), 'yyyy-MM-dd');
        const end = format(endOfMonth(new Date()), 'yyyy-MM-dd');
        
        const { tabelaParcelas: tabelaParcelasReceber, ownerKey: ownerKeyCR } = getTables('CR');
        const { tabelaParcelas: tabelaParcelasPagar, ownerKey: ownerKeyCP } = getTables('CP');
        
        try {
            // 1. Fetch Realized Movements (Entradas / Saídas - Current Month)
            
            const contaIds = contas.map(c => c.id);
            let lancamentosData: any[] | null = null;
            
            if (contaIds.length > 0) {
                let query = supabase
                    .from('lancamentos')
                    .select('valor, tipo, origem')
                    .eq('proprietario_id', ownerId)
                    .gte('data_movimentacao', start)
                    .lte('data_movimentacao', end)
                    .in('conta_bancaria_id', contaIds); // FILTRO CRÍTICO
                    
                const { data, error: lError } = await query;
                
                if (lError) {
                    console.error('Erro ao buscar lançamentos mensais:', lError);
                }
                lancamentosData = data;
            }
            
            const safeLancamentos = (lancamentosData || []).filter(l => !l.origem.includes('estorno'));
            
            const entradasRealizadas = safeLancamentos.filter(l => l.tipo === 'Entrada').reduce((sum, l) => sum + l.valor, 0);
            const saidasRealizadas = safeLancamentos.filter(l => l.tipo === 'Saida').reduce((sum, l) => sum + l.valor, 0);
            
            setTotalEntradasRealizadas(entradasRealizadas);
            setTotalSaidasRealizadas(saidasRealizadas);
            setLancamentosDetalhes(safeLancamentos as LancamentoDetalhe[]); // SALVA DETALHES

            // 2. Fetch Future Obligations (A Receber / A Pagar - Current Month)
            const { data: crData, error: crError } = await supabase
                .from(tabelaParcelasReceber)
                .select('valor_parcela, status')
                .eq(ownerKeyCR, ownerId)
                .gte('data_vencimento', start)
                .lte('data_vencimento', end)
                .in('status', ['aberta', 'parcial', 'reprogramada']); // Apenas pendentes

            if (crError) { console.error('Erro ao buscar CR:', crError); }
            const totalReceber = (crData || []).reduce((sum, p) => sum + p.valor_parcela, 0);
            
            const { data: cpData, error: cpError } = await supabase
                .from(tabelaParcelasPagar)
                .select('valor_parcela, status')
                .eq(ownerKeyCP, ownerId)
                .gte('data_vencimento', start)
                .lte('data_vencimento', end)
                .in('status', ['aberta', 'parcial', 'reprogramada']); // Apenas pendentes

            if (cpError) { console.error('Erro ao buscar CP:', cpError); }
            const totalPagar = (cpData || []).reduce((sum, p) => sum + p.valor_parcela, 0);
            
            setFluxoData({ receber: totalReceber, pagar: totalPagar, isGeral: true });
        } catch (e: any) {
            console.error('❌ DASHBOARD ERROR (fetchFluxoDataGeral):', e);
            showError('Falha ao carregar dados gerais: ' + e.message);
        } finally {
            setLoadingFluxo(false);
        }
    }, [ownerId, ownerType, contas]);
    
    const fetchKPIs = useCallback(async () => {
        if (!ownerId) return;
        
        const today = format(new Date(), 'yyyy-MM-dd');
        const thirtyDaysLater = format(addDays(new Date(), 30), 'yyyy-MM-dd');
        
        const { tabelaParcelas: tabelaParcelasReceber, ownerKey: ownerKeyCR } = getTables('CR');
        const { tabelaParcelas: tabelaParcelasPagar, ownerKey: ownerKeyCP } = getTables('CP');
        
        try {
            // Total a Receber (próximos 30 dias)
            const { data: cr30, error: cr30Error } = await supabase
                .from(tabelaParcelasReceber)
                .select('valor_parcela')
                .eq(ownerKeyCR, ownerId)
                .in('status', ['aberta', 'parcial', 'reprogramada'])
                .gte('data_vencimento', today)
                .lte('data_vencimento', thirtyDaysLater);
                
            if (cr30Error) console.error('Erro ao buscar CR 30 dias:', cr30Error);
            const totalCR = (cr30 || []).reduce((sum, p) => sum + p.valor_parcela, 0);
            setTotalAReceber30Dias(totalCR);
            
            // Total a Pagar (próximos 30 dias)
            const { data: cp30, error: cp30Error } = await supabase
                .from(tabelaParcelasPagar)
                .select('valor_parcela')
                .eq(ownerKeyCP, ownerId)
                .in('status', ['aberta', 'parcial', 'reprogramada'])
                .gte('data_vencimento', today)
                .lte('data_vencimento', thirtyDaysLater);
                
            if (cp30Error) console.error('Erro ao buscar CP 30 dias:', cp30Error);
            const totalCP = (cp30 || []).reduce((sum, p) => sum + p.valor_parcela, 0);
            setTotalAPagar30Dias(totalCP);
        } catch (e) {
            console.error('❌ DASHBOARD ERROR (fetchKPIs):', e);
        }
    }, [ownerId, ownerType]);

    useEffect(() => {
        if (ownerId) {
            fetchKPIs();
            if (filtroContaId === 'todos') {
                fetchFluxoDataGeral();
            } else {
                fetchContaMensalData(filtroContaId);
            }
        }
    }, [ownerId, filtroContaId, fetchKPIs, fetchFluxoDataGeral, fetchContaMensalData]);

    const loading = carregandoSessao || carregandoSaldos || loadingFluxo;
    const lucroPrejuizo = fluxoData.receber - fluxoData.pagar;
    const resultadoRealizado = totalEntradasRealizadas - totalSaidasRealizadas; // NEW CALCULATION

    // Dados para o gráfico de Saldo por Conta
    const contasComSaldo = contasFiltradas.filter(c => Math.abs(c.saldo_atual) > 0.01);
    
    const saldoData = contasComSaldo
        .map(c => ({
            name: c.nome,
            saldo: c.saldo_atual,
            fill: c.saldo_atual >= 0 ? COLORS[0] : COLORS[3],
        }));
        
    // Dados para o gráfico de Fluxo (A Receber/Entradas vs A Pagar/Saídas)
    const fluxoChartData = [
        { name: fluxoData.isGeral ? 'A Receber (Mês)' : 'Entradas (Mês)', valor: fluxoData.receber, fill: COLORS[1] },
        { name: fluxoData.isGeral ? 'A Pagar (Mês)' : 'Saídas (Mês)', valor: fluxoData.pagar, fill: COLORS[3] },
    ];
    
    // Dados para o gráfico de Lucro/Prejuízo
    const lucroChartData = [
        { name: 'Resultado Mensal', valor: lucroPrejuizo, fill: lucroPrejuizo >= 0 ? COLORS[1] : COLORS[3] }
    ];
    
    // Dados para o gráfico de Depuração (Entradas/Saídas por Origem)
    const debugData = useMemo(() => {
        const totals: Record<string, { entradas: number, saidas: number }> = {};
        
        lancamentosDetalhes.forEach(l => {
            const origem = l.origem || 'manual';
            totals[origem] = totals[origem] || { entradas: 0, saidas: 0 };
            
            if (l.tipo === 'Entrada') {
                totals[origem].entradas += l.valor;
            } else if (l.tipo === 'Saida') {
                totals[origem].saidas += l.valor;
            }
        });
        
        return Object.keys(totals).map(origem => ({
            origem,
            entradas: totals[origem].entradas,
            saidas: totals[origem].saidas,
        }));
    }, [lancamentosDetalhes]);

    // NOVO LOG DE DEBBUG
    useEffect(() => {
        if (!loading) {
            console.log(`[DashboardFinanceiro] Final State: ownerId=${ownerId}, TotalSaldo=${totalSaldo}, ContasCount=${contas.length}`);
        }
    }, [loading, ownerId, totalSaldo, contas.length]);
    // FIM NOVO LOG

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }
    
    const isContaFiltrada = filtroContaId !== 'todos';
    
    // NOVO: Se não houver contas cadastradas, exibe o CTA
    if (contas.length === 0) {
        return (
            <Card className="mt-8 p-8 text-center">
                <CardTitle className="text-2xl mb-4">Nenhuma Conta de Caixa/Banco Cadastrada</CardTitle>
                <CardContent>
                    <p className="text-lg text-muted-foreground mb-6">
                        Para visualizar o Dashboard Financeiro e o Fluxo de Caixa, você precisa cadastrar pelo menos uma conta de Caixa ou Banco.
                    </p>
                    <Link to="/bancos">
                        <Button size="lg">
                            <PlusCircle className="w-5 h-5 mr-2" /> Cadastrar Primeira Conta
                        </Button>
                    </Link>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            {/* Indicadores Chave (KPIs) */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                
                {/* KPIs Dinâmicos (Conta Específica) */}
                {isContaFiltrada && contaMensalData ? (
                    // NOVO LAYOUT: 3 COLUNAS (Entradas, Saídas, Saldo Final)
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:col-span-4">
                        <Card 
                            className="border-l-4 border-green-500 cursor-pointer hover:shadow-xl transition-shadow"
                            onClick={() => navigate('/relatorios/fluxo-caixa')}
                        >
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium flex items-center"><ArrowUpCircle className="w-4 h-4 mr-2" /> Entradas (Mês)</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-green-600">
                                    {formatCurrency(contaMensalData.entradas)}
                                </div>
                            </CardContent>
                        </Card>
                        <Card 
                            className="border-l-4 border-red-500 cursor-pointer hover:shadow-xl transition-shadow"
                            onClick={() => navigate('/relatorios/fluxo-caixa')}
                        >
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium flex items-center"><ArrowDownCircle className="w-4 h-4 mr-2" /> Saídas (Mês)</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-red-600">
                                    {formatCurrency(contaMensalData.saidas)}
                                </div>
                            </CardContent>
                        </Card>
                        <Card 
                            className={cn("border-l-4 cursor-pointer hover:shadow-xl transition-shadow", contaMensalData.saldoFinal >= 0 ? "border-blue-500" : "border-red-500")}
                            onClick={() => navigate('/bancos')}
                        >
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium flex items-center"><Landmark className="w-4 h-4 mr-2" /> Saldo Final (Conta)</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className={cn("text-2xl font-bold", contaMensalData.saldoFinal >= 0 ? "text-blue-600" : "text-red-600")}>
                                    {formatCurrency(contaMensalData.saldoFinal)}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                ) : (
                    // KPIs Gerais (Todas as Contas)
                    <>
                        <Card 
                            className={cn("border-l-4 cursor-pointer hover:shadow-xl transition-shadow", totalSaldo >= 0 ? "border-green-500" : "border-red-500")}
                            onClick={() => navigate('/bancos')}
                        >
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium flex items-center"><Banknote className="w-4 h-4 mr-2" /> Saldo Total (Contas)</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className={cn("text-2xl font-bold", totalSaldo >= 0 ? "text-green-600" : "text-red-600")}>
                                    {formatCurrency(totalSaldo)}
                                </div>
                            </CardContent>
                        </Card>
                        <Card 
                            className="border-l-4 border-blue-500 cursor-pointer hover:shadow-xl transition-shadow"
                            onClick={() => navigate('/contas-receber')}
                        >
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium flex items-center"><ArrowUpCircle className="w-4 h-4 mr-2" /> A Receber (30 dias)</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-blue-600">
                                    {formatCurrency(totalAReceber30Dias)}
                                </div>
                            </CardContent>
                        </Card>
                        <Card 
                            className="border-l-4 border-red-500 cursor-pointer hover:shadow-xl transition-shadow"
                            onClick={() => navigate('/contas-pagar')}
                        >
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium flex items-center"><ArrowDownCircle className="w-4 h-4 mr-2" /> A Pagar (30 dias)</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-red-600">
                                    {formatCurrency(totalAPagar30Dias)}
                                </div>
                            </CardContent>
                        </Card>
                        <Card 
                            className={cn("border-l-4 cursor-pointer hover:shadow-xl transition-shadow", lucroPrejuizo >= 0 ? "border-green-500" : "border-red-500")}
                            onClick={() => navigate('/relatorios/dre')}
                        >
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium flex items-center"><TrendingUp className="w-4 h-4 mr-2" /> Resultado Mensal (Obrig.)</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className={cn("text-2xl font-bold", lucroPrejuizo >= 0 ? "text-green-600" : "text-red-600")}>
                                    {formatCurrency(lucroPrejuizo)}
                                </div>
                            </CardContent>
                        </Card>
                        
                        {/* NOVO BLOCO DE KPIS REALIZADOS */}
                        <div className="md:col-span-4 grid grid-cols-1 md:grid-cols-3 gap-6">
                            <Card 
                                className="border-l-4 border-green-500 cursor-pointer hover:shadow-xl transition-shadow"
                                onClick={() => navigate('/relatorios/fluxo-caixa')}
                            >
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium flex items-center"><ArrowUpCircle className="w-4 h-4 mr-2" /> Recebido (Mês)</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div data-dyad-id="src\components\DashboardFinanceiro.tsx:397:36" data-dyad-name="div" className="text-2xl font-bold text-green-600">
                                        {formatCurrency(totalEntradasRealizadas)}
                                    </div>
                                </CardContent>
                            </Card>
                            <Card 
                                className="border-l-4 border-red-500 cursor-pointer hover:shadow-xl transition-shadow"
                                onClick={() => navigate('/relatorios/fluxo-caixa')}
                            >
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium flex items-center"><ArrowDownCircle className="w-4 h-4 mr-2" /> Pago (Mês)</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div data-dyad-id="src\components\DashboardFinanceiro.tsx:410:36" data-dyad-name="div" className="text-2xl font-bold text-red-600">
                                        {formatCurrency(totalSaidasRealizadas)}
                                    </div>
                                </CardContent>
                            </Card>
                            <Card 
                                className={cn("border-l-4 cursor-pointer hover:shadow-xl transition-shadow", resultadoRealizado >= 0 ? "border-blue-500" : "border-red-500")}
                                onClick={() => navigate('/relatorios/fluxo-caixa')}
                            >
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium flex items-center"><TrendingUp className="w-4 h-4 mr-2" /> Resultado Realizado (Mês)</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div data-dyad-id="src\components\DashboardFinanceiro.tsx:423:36" data-dyad-name="div" className="text-2xl font-bold">
                                        {formatCurrency(resultadoRealizado)}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                        {/* FIM NOVO BLOCO */}
                    </>
                )}
            </div>
            
            {/* Filtro de Contexto */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center"><Filter className="w-4 h-4 mr-2" /> Filtro de Visualização</CardTitle>
                </CardHeader>
                <CardContent>
                    <Select value={filtroContaId} onValueChange={setFiltroContaId}>
                        <SelectTrigger className="w-full md:w-[300px]">
                            <SelectValue placeholder="Filtrar por Conta/Caixa ou Geral" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="todos">Geral (Todas as Contas)</SelectItem>
                            {contas.map(c => (
                                <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </CardContent>
            </Card>
            
            {/* NOVO: Detalhes de Lançamentos do Mês (Depuração) */}
            {isAdmin && debugData.length > 0 && filtroContaId === 'todos' && (
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-xl text-yellow-600">Depuração: Lançamentos do Mês por Origem</CardTitle>
                        <Button variant="ghost" size="sm" onClick={() => setShowDebug(prev => !prev)}>
                            {showDebug ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
                            {showDebug ? 'Ocultar' : 'Mostrar'}
                        </Button>
                    </CardHeader>
                    {showDebug && (
                        <CardContent>
                            <p className="text-sm text-muted-foreground mb-3">
                                Estes são os valores exatos que compõem o "Recebido (Mês)" ({formatCurrency(totalEntradasRealizadas)}) e "Pago (Mês)" ({formatCurrency(totalSaidasRealizadas)}) na tabela `lancamentos`.
                            </p>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Origem</TableHead>
                                        <TableHead className="text-right">Entradas</TableHead>
                                        <TableHead className="text-right">Saídas</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {debugData.map(d => (
                                        <TableRow key={d.origem}>
                                            <TableCell className="font-mono text-sm">{d.origem}</TableCell>
                                            <TableCell className="text-right text-green-600">{formatCurrency(d.entradas)}</TableCell>
                                            <TableCell className="text-right text-red-600">{formatCurrency(d.saidas)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    )}
                </Card>
            )}

            {/* Gráficos */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Gráfico 1: Saldo por Conta */}
                <Card 
                    className="lg:col-span-2 cursor-pointer hover:shadow-xl transition-shadow"
                    onClick={() => navigate('/bancos')}
                >
                    <CardHeader><CardTitle className="text-xl flex items-center"><Scale className="w-5 h-5 mr-2" /> Saldo por Conta/Caixa ({filtroContaId === 'todos' ? 'Geral' : contas.find(c => c.id === filtroContaId)?.nome})</CardTitle></CardHeader>
                    <CardContent className="h-80">
                        {saldoData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={saldoData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" />
                                    <XAxis dataKey="name" stroke="hsl(var(--foreground))" tick={{ fontSize: 10 }} />
                                    <YAxis tickFormatter={formatCurrency} stroke="hsl(var(--foreground))" />
                                    <Tooltip 
                                        content={({ active, payload }) => {
                                            if (active && payload && payload.length) {
                                                return (
                                                    <div className="bg-card p-2 border rounded-md shadow-lg text-sm">
                                                        <p className="font-bold">{payload[0].payload.name}</p>
                                                        <p style={{ color: payload[0].payload.fill }}>{formatCurrency(payload[0].value as number)}</p>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }}
                                    />
                                    <Bar dataKey="saldo" fill="#8884d8" />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex justify-center items-center h-full text-muted-foreground">Nenhuma conta com saldo registrado.</div>
                        )}
                    </CardContent>
                </Card>
                
                {/* Gráfico 2: Lucro/Prejuízo Mensal */}
                <Card 
                    className="lg:col-span-1 cursor-pointer hover:shadow-xl transition-shadow"
                    onClick={() => navigate('/relatorios/dre')}
                >
                    <CardHeader><CardTitle className="text-xl flex items-center"><TrendingUp className="w-5 h-5 mr-2" /> Resultado Mensal ({format(new Date(), 'MMM')})</CardTitle></CardHeader>
                    <CardContent className="h-80 flex flex-col justify-center items-center">
                        <ResponsiveContainer width="100%" height={150}>
                            <BarChart data={lucroChartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" />
                                <XAxis dataKey="name" stroke="hsl(var(--foreground))" />
                                <YAxis tickFormatter={formatCurrency} stroke="hsl(var(--foreground))" />
                                <Tooltip 
                                    content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                            return (
                                                <div className="bg-card p-2 border rounded-md shadow-lg text-sm">
                                                    <p className="font-bold">{payload[0].payload.name}</p>
                                                    <p style={{ color: payload[0].payload.fill }}>{formatCurrency(payload[0].value as number)}</p>
                                                </div>
                                            );
                                        }
                                        return null;
                                    }}
                                />
                                <Bar dataKey="valor" fill={lucroPrejuizo >= 0 ? COLORS[1] : COLORS[3]} />
                            </BarChart>
                        </ResponsiveContainer>
                        <div className="mt-4 text-center">
                            <p className="text-sm text-muted-foreground">Lucro/Prejuízo (Contas a Pagar/Receber)</p>
                            <p className={cn("text-3xl font-extrabold", lucroPrejuizo >= 0 ? "text-green-600" : "text-red-600")}>
                                {formatCurrency(lucroPrejuizo)}
                            </p>
                        </div>
                    </CardContent>
                </Card>
                
                {/* Gráfico 3: Receitas vs Despesas (Barra) */}
                <Card 
                    className="lg:col-span-3 cursor-pointer hover:shadow-xl transition-shadow"
                    onClick={() => navigate('/relatorios/fluxo-caixa')}
                >
                    <CardHeader><CardTitle className="text-xl flex items-center"><TrendingUp className="w-5 h-5 mr-2" /> Fluxo de Caixa ({fluxoData.isGeral ? 'A Receber vs A Pagar' : 'Entradas vs Saídas'} - Mês)</CardTitle></CardHeader>
                    <CardContent className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={fluxoChartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" />
                                <XAxis dataKey="name" stroke="hsl(var(--foreground))" />
                                <YAxis tickFormatter={formatCurrency} stroke="hsl(var(--foreground))" />
                                <Tooltip 
                                    content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                            return (
                                                <div className="bg-card p-2 border rounded-md shadow-lg text-sm">
                                                    <p className="font-bold">{payload[0].payload.name}</p>
                                                    <p style={{ color: payload[0].payload.fill }}>{formatCurrency(payload[0].value as number)}</p>
                                                </div>
                                            );
                                        }
                                        return null;
                                    }}
                                />
                                <Bar dataKey="valor" />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default DashboardFinanceiro;