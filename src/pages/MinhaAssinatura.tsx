import React, { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile } from '@/types/usuario';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Package, DollarSign, CalendarCheck, CreditCard } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { Plano } from '@/types/plano';
import { format, parseISO, isFuture } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

interface PagamentoSimulado {
    id: string;
    data: string;
    valor: number;
    status: 'pago' | 'falha';
    descricao: string;
}

const PAGAMENTOS_SIMULADOS: PagamentoSimulado[] = [
    { id: 'p1', data: '2025-10-01T10:00:00Z', valor: 50.00, status: 'pago', descricao: 'Mensalidade - Outubro' },
    { id: 'p2', data: '2025-09-01T10:00:00Z', valor: 50.00, status: 'pago', descricao: 'Mensalidade - Setembro' },
    { id: 'p3', data: '2025-08-01T10:00:00Z', valor: 50.00, status: 'pago', descricao: 'Mensalidade - Agosto' },
];

const MinhaAssinatura: React.FC = () => {
    const { perfil, role, carregando } = useSessao();
    const [planoAtual, setPlanoAtual] = useState<Plano | null>(null);
    const [carregandoPlano, setCarregandoPlano] = useState(true);

    const isClient = role === 'Cliente';
    const clienteProfile = perfil as ClienteProfile;

    const fetchPlano = useCallback(async () => {
        if (!isClient || !clienteProfile?.plano_id) {
            setCarregandoPlano(false);
            return;
        }

        const { data, error } = await supabase
            .from('planos')
            .select('*')
            .eq('id', clienteProfile.plano_id)
            .single();

        if (error) {
            showError('Erro ao carregar detalhes do plano: ' + error.message);
            setPlanoAtual(null);
        } else {
            setPlanoAtual(data as Plano);
        }
        setCarregandoPlano(false);
    }, [isClient, clienteProfile]);

    useEffect(() => {
        if (!carregando) {
            fetchPlano();
        }
    }, [carregando, fetchPlano]);

    if (carregando || carregandoPlano) {
        return <LayoutPrincipal><div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></LayoutPrincipal>;
    }

    if (!isClient || !planoAtual) {
        return (
            <LayoutPrincipal>
                <Card><CardHeader><CardTitle>Acesso Negado</CardTitle></CardHeader><CardContent><p>Esta página é exclusiva para clientes com assinatura ativa.</p></CardContent></Card>
            </LayoutPrincipal>
        );
    }
    
    const dataFimAcesso = clienteProfile.data_fim_acesso ? parseISO(clienteProfile.data_fim_acesso) : null;
    const isTrial = dataFimAcesso && isFuture(dataFimAcesso) && planoAtual.dias_trial > 0;
    const statusAssinatura = isTrial ? 'Trial Ativo' : (dataFimAcesso && isFuture(dataFimAcesso) ? 'Ativa' : 'Expirada');
    const dataExpiracaoFormatada = dataFimAcesso ? format(dataFimAcesso, 'dd/MM/yyyy', { locale: ptBR }) : 'N/A';
    const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

    return (
        <LayoutPrincipal>
            <h1 className="text-2xl md:text-3xl font-bold mb-6 flex items-center">
                <DollarSign className="w-6 h-6 mr-2" /> Minha Assinatura
            </h1>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                {/* Detalhes do Plano */}
                <Card className="lg:col-span-2">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-xl flex items-center"><Package className="w-5 h-5 mr-2" /> Plano Atual</CardTitle>
                        <Link to="/vendas">
                            <Button variant="default" size="sm">Mudar Plano</Button>
                        </Link>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex justify-between items-center border-b pb-2">
                            <span className="font-semibold">Nome do Plano:</span>
                            <span className="text-lg font-bold text-primary">{planoAtual.nome}</span>
                        </div>
                        <div className="flex justify-between items-center border-b pb-2">
                            <span className="font-semibold">Preço Mensal:</span>
                            <span className="text-lg">{formatCurrency(planoAtual.preco_mensal)}</span>
                        </div>
                        <div className="flex justify-between items-center border-b pb-2">
                            <span className="font-semibold">Status:</span>
                            <Badge variant={statusAssinatura === 'Ativa' ? 'default' : statusAssinatura === 'Trial Ativo' ? 'warning' : 'destructive'}>
                                {statusAssinatura}
                            </Badge>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="font-semibold flex items-center"><CalendarCheck className="w-4 h-4 mr-2" /> Próxima Cobrança:</span>
                            <span className="font-bold">{dataExpiracaoFormatada}</span>
                        </div>
                    </CardContent>
                </Card>
                
                {/* Informações de Pagamento */}
                <Card>
                    <CardHeader><CardTitle className="text-xl flex items-center"><CreditCard className="w-5 h-5 mr-2" /> Forma de Pagamento</CardTitle></CardHeader>
                    <CardContent>
                        <CardDescription>
                            Gerencie seu cartão de crédito ou débito.
                        </CardDescription>
                        <Button variant="outline" className="w-full mt-4" disabled>
                            Gerenciar Cartão (Em breve)
                        </Button>
                    </CardContent>
                </Card>
            </div>

            {/* Histórico de Pagamentos */}
            <Card>
                <CardHeader><CardTitle className="text-xl">Histórico de Pagamentos</CardTitle></CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Data</TableHead>
                                <TableHead>Descrição</TableHead>
                                <TableHead className="text-right">Valor</TableHead>
                                <TableHead className="text-center">Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {PAGAMENTOS_SIMULADOS.map(p => (
                                <TableRow key={p.id}>
                                    <TableCell>{format(parseISO(p.data), 'dd/MM/yyyy', { locale: ptBR })}</TableCell>
                                    <TableCell>{p.descricao}</TableCell>
                                    <TableCell className="text-right font-medium">{formatCurrency(p.valor)}</TableCell>
                                    <TableCell className="text-center">
                                        <Badge variant={p.status === 'pago' ? 'success' : 'destructive'}>
                                            {p.status === 'pago' ? 'Pago' : 'Falha'}
                                        </Badge>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </LayoutPrincipal>
    );
};

export default MinhaAssinatura;