import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ArrowUpCircle, ArrowDownCircle, Banknote, TrendingUp, Scale } from 'lucide-react';
import { useSessao } from '@/hooks/use-sessao';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { formatCurrency } from '@/utils/formatters';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import useSaldoContaCalculado from '@/hooks/use-saldo-conta-calculado';
import { startOfMonth, endOfMonth, format } from 'date-fns';

interface FluxoData {
    receber: number;
    pagar: number;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

const DashboardFinanceiro: React.FC = () => {
    const { usuario, role, carregando: carregandoSessao } = useSessao();
    const [fluxoData, setFluxoData] = useState<FluxoData>({ receber: 0, pagar: 0 });
    const [loadingFluxo, setLoadingFluxo] = useState(true);
    const [totalAReceber30Dias, setTotalAReceber30Dias] = useState(0);
    const [totalAPagar30Dias, setTotalAPagar30Dias] = useState(0);

    const ownerId = usuario?.id; // O Admin é o proprietário dos dados de faturamento

    // Hook para buscar saldos de contas (Ativo/Passivo)
    const { contas, totalSaldo, carregando: carregandoSaldos } = useSaldoContaCalculado('todos', 'todos', '');

    const fetchFluxoData = useCallback(async () => {
        if (!ownerId) return;
        setLoadingFluxo(true);

        const start = format(startOfMonth(new Date()), 'yyyy-MM-dd');
        const end = format(endOfMonth(new Date()), 'yyyy-MM-dd');
        
        // 1. Buscar Contas a Receber (Admin) no mês atual
        const { data: crData, error: crError } = await supabase
            .from('admin_parcelas_receber')
            .select('valor_parcela, status')
            .eq('admin_id', ownerId)
            .gte('data_vencimento', start)
            .lte('data_vencimento', end)
            .neq('status', 'cancelada');

        if (crError) {
            showError('Erro ao buscar CR: ' + crError.message);
            setFluxoData({ receber: 0, pagar: 0 });
            return;
        }
        
        const totalReceber = (crData || []).reduce((sum, p) => sum + p.valor_parcela, 0);
        
        // 2. Buscar Contas a Pagar (Admin) no mês atual
        const { data: cpData, error: cpError } = await supabase
            .from('admin_parcelas_pagar')
            .select('valor_parcela, status')
            .eq('admin_id', ownerId)
            .gte('data_vencimento', start)
            .lte('data_vencimento', end)
            .neq('status', 'cancelada');

        if (cpError) {
            showError('Erro ao buscar CP: ' + cpError.message);
            setFluxoData({ receber: 0, pagar: 0 });
            return;
        }
        
        const totalPagar = (cpData || []).reduce((sum, p) => sum + p.valor_parcela, 0);
        
        setFluxoData({ receber: totalReceber, pagar: totalPagar });
        setLoadingFluxo(false);
    }, [ownerId]);
    
    const fetchKPIs = useCallback(async () => {
        if (!ownerId) return;
        
        const today = format(new Date(), 'yyyy-MM-dd');
        const thirtyDaysLater = format(addDays(new Date(), 30), 'yyyy-MM-dd');
        
        // Total a Receber (próximos 30 dias)
        const { data: cr30, error: cr30Error } = await supabase
            .from('admin_parcelas_receber')
            .select('valor_parcela')
            .eq('admin_id', ownerId)
            .in('status', ['aberta', 'parcial', 'reprogramada'])
            .gte('data_vencimento', today)
            .lte('data_vencimento', thirtyDaysLater);
            
        if (cr30Error) console.error('Erro ao buscar CR 30 dias:', cr30Error);
        const totalCR = (cr30 || []).reduce((sum, p) => sum + p.valor_parcela, 0);
        setTotalAReceber30Dias(totalCR);
        
        // Total a Pagar (próximos 30 dias)
        const { data: cp30, error: cp30Error } = await supabase
            .from('admin_parcelas_pagar')
            .select('valor_parcela')
            .eq('admin_id', ownerId)
            .in('status', ['aberta', 'parcial', 'reprogramada'])
            .gte('data_vencimento', today)
            .lte('data_vencimento', thirtyDaysLater);
            
        if (cp30Error) console.error('Erro ao buscar CP 30 dias:', cp30Error);
        const totalCP = (cp30 || []).reduce((sum, p) => sum + p.valor_parcela, 0);
        setTotalAPagar30Dias(totalCP);
        
    }, [ownerId]);

    useEffect(() => {
        if (ownerId) {
            fetchFluxoData();
            fetchKPIs();
        }
    }, [ownerId, fetchFluxoData, fetchKPIs]);

    const loading = carregandoSessao || carregandoSaldos || loadingFluxo;
    const lucroPrejuizo = fluxoData.receber - fluxoData.pagar;

    // Dados para o gráfico de Saldo por Conta
    const saldoData = contas
        .filter(c => c.saldo_atual !== 0)
        .map(c => ({
            name: c.nome,
            saldo: c.saldo_atual,
            fill: c.saldo_atual >= 0 ? COLORS[0] : COLORS[3],
        }));
        
    // Dados para o gráfico de Fluxo (Receitas vs Despesas)
    const fluxoChartData = [
        { name: 'A Receber (Mês)', valor: fluxoData.receber, fill: COLORS[1] },
        { name: 'A Pagar (Mês)', valor: fluxoData.pagar, fill: COLORS[3] },
    ];
    
    // Dados para o gráfico de Lucro/Prejuízo
    const lucroChartData = [
        { name: 'Resultado Mensal', valor: lucroPrejuizo, fill: lucroPrejuizo >= 0 ? COLORS[1] : COLORS[3] }
    ];

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Indicadores Chave (KPIs) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className={cn("border-l-4", totalSaldo >= 0 ? "border-green-500" : "border-red-500")}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium flex items-center"><Banknote className="w-4 h-4 mr-2" /> Saldo Total (Contas)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className={cn("text-2xl font-bold", totalSaldo >= 0 ? "text-green-600" : "text-red-600")}>
                            {formatCurrency(totalSaldo)}
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-l-4 border-blue-500">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium flex items-center"><ArrowUpCircle className="w-4 h-4 mr-2" /> A Receber (30 dias)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-600">
                            {formatCurrency(totalAReceber30Dias)}
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-l-4 border-red-500">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium flex items-center"><ArrowDownCircle className="w-4 h-4 mr-2" /> A Pagar (30 dias)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">
                            {formatCurrency(totalAPagar30Dias)}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Gráficos */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Gráfico 1: Saldo por Conta */}
                <Card className="lg:col-span-2">
                    <CardHeader><CardTitle className="text-xl flex items-center"><Scale className="w-5 h-5 mr-2" /> Saldo por Conta/Caixa</CardTitle></CardHeader>
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
                <Card className="lg:col-span-1">
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
                <Card className="lg:col-span-3">
                    <CardHeader><CardTitle className="text-xl flex items-center"><TrendingUp className="w-5 h-5 mr-2" /> Fluxo de Caixa (A Receber vs A Pagar - Mês)</CardTitle></CardHeader>
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