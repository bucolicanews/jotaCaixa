import React, { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile } from '@/types/usuario';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Package, DollarSign, CalendarCheck, ArrowDownCircle, CreditCard } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { Plano } from '@/types/plano';
import { format, parseISO, isFuture, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link, useNavigate } from 'react-router-dom';
import { useStripeConfig } from '@/hooks/use-stripe-config';

interface Pagamento {
  id: string;
  data: string;
  valor: number;
  status: 'pago' | 'falha';
  descricao: string;
}

interface ContaPagarPlano {
  id: string;
  data_vencimento: string;
  valor: number;
  fornecedor: string;
}

// Interface para o registro de admin_contas_receber
interface AdminContaReceber {
    id: string;
    descricao: string;
    valor_total: number;
    data_vencimento: string;
    status: string;
    origem: string;
    created_at: string;
}

const MinhaAssinatura: React.FC = () => {
  const { perfil, role, carregando } = useSessao();
  const navigate = useNavigate();
  const { loading: loadingStripe } = useStripeConfig();
  
  const [planoAtual, setPlanoAtual] = useState<Plano | null>(null);
  const [carregandoPlano, setCarregandoPlano] = useState(true);
  const [proximaContaPagar, setProximaContaPagar] = useState<ContaPagarPlano | null>(null);
  const [historicoPagamentos, setHistoricoPagamentos] = useState<Pagamento[]>([]);
  const [ultimoRegistroAssinatura, setUltimoRegistroAssinatura] = useState<AdminContaReceber | null>(null); // NOVO ESTADO
  const [isSubmitting] = useState(false);

  const isClient = role === 'Cliente';
  const clienteProfile = perfil as ClienteProfile;
  const clienteId = clienteProfile?.id;

  const fetchDadosAssinatura = useCallback(async () => {
    if (!isClient || !clienteId || !clienteProfile?.plano_id) {
      setCarregandoPlano(false);
      return;
    }

    setCarregandoPlano(true);

    // 1️⃣ Buscar detalhes do plano
    const { data: planoData, error: planoError } = await supabase
      .from('planos')
      .select('*')
      .eq('id', clienteProfile.plano_id)
      .single();

    if (planoError) {
      showError('Erro ao carregar detalhes do plano: ' + planoError.message);
      setPlanoAtual(null);
      setCarregandoPlano(false);
      return;
    }

    setPlanoAtual(planoData as Plano);
    
    // 2️⃣ Buscar o último registro de assinatura (admin_contas_receber)
    const { data: ultimoRegistro, error: registroError } = await supabase
        .from('admin_contas_receber')
        .select('*')
        .eq('cliente_id', clienteId)
        .eq('origem', 'assinatura')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
        
    if (registroError && registroError.code !== 'PGRST116') {
        console.error('Erro ao buscar último registro de assinatura:', registroError);
    } else if (ultimoRegistro) {
        setUltimoRegistroAssinatura(ultimoRegistro as AdminContaReceber);
    } else {
        setUltimoRegistroAssinatura(null);
    }


    // 3️⃣ Buscar histórico de pagamentos (admin_recebimentos)
    const { data: recebimentos, error: crError } = await supabase
      .from('admin_recebimentos')
      .select(`
        id,
        data_recebimento,
        valor_recebido,
        forma_pagamento,
        admin_parcelas_receber (
          admin_contas_receber ( descricao )
        )
      `)
      .eq('cliente_id', clienteId) // Filtra pelo ID do cliente que pagou
      .order('data_recebimento', { ascending: false });

    if (crError) {
      console.error('Erro ao buscar histórico de recebimentos:', crError);
      setHistoricoPagamentos([]);
    } else if (recebimentos && recebimentos.length > 0) {
      const historico = (recebimentos as any[]).map((r) => ({
        id: r.id,
        data: r.data_recebimento!,
        valor: Number(r.valor_recebido),
        status: 'pago' as const,
        descricao:
          r.admin_parcelas_receber?.[0]?.admin_contas_receber?.descricao ||
          'Mensalidade Paga',
      }));
      setHistoricoPagamentos(historico);
    } else {
      setHistoricoPagamentos([]);
    }

    // 4️⃣ Buscar próxima conta a pagar (contas_pagar)
    const { data: contasPagar, error: cpError } = await supabase
      .from('contas_pagar')
      .select('id, data_vencimento, valor, status, fornecedor')
      .eq('empresa_id', clienteId) // Filtra pelo ID do cliente que deve pagar
      .in('status', ['pendente', 'atrasado'])
      .order('data_vencimento', { ascending: true })
      .limit(1);

    if (cpError) {
      console.error('Erro ao buscar próxima conta a pagar:', cpError);
    } else if (contasPagar && contasPagar.length > 0) {
      setProximaContaPagar({
        id: contasPagar[0].id,
        data_vencimento: contasPagar[0].data_vencimento,
        valor: Number(contasPagar[0].valor),
        fornecedor: contasPagar[0].fornecedor || 'Mensalidade',
      });
    } else {
      setProximaContaPagar(null);
    }

    setCarregandoPlano(false);
  }, [isClient, clienteId, clienteProfile]);

  useEffect(() => {
    if (!carregando) {
      fetchDadosAssinatura();
    }
  }, [carregando, fetchDadosAssinatura]);
  
  const handleNavigateToRenewal = () => {
    if (!proximaContaPagar) {
        showError('Nenhuma mensalidade pendente para pagar.');
        return;
    }
    // Redireciona para a página de seleção de plano/pagamento, passando o ID da conta a pagar
    navigate(`/renovacao?cp_id=${proximaContaPagar.id}`);
  };

  if (carregando || carregandoPlano || loadingStripe) {
    return (
      <LayoutPrincipal>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </LayoutPrincipal>
    );
  }

  if (!isClient || !planoAtual) {
    return (
      <LayoutPrincipal>
        <Card>
          <CardHeader>
            <CardTitle>Acesso Negado</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Esta página é exclusiva para clientes com assinatura ativa.</p>
          </CardContent>
        </Card>
      </LayoutPrincipal>
    );
  }

  const dataFimAcesso = clienteProfile.data_fim_acesso ? parseISO(clienteProfile.data_fim_acesso) : null;
  const daysRemaining = dataFimAcesso ? differenceInDays(dataFimAcesso, new Date()) : 0;
  const isTrial = dataFimAcesso && isFuture(dataFimAcesso) && daysRemaining < 30;
  const statusAssinatura = isTrial ? 'Trial Ativo' : (dataFimAcesso && isFuture(dataFimAcesso) ? 'Ativa' : 'Expirada');
  
  const dataProximaCobranca = proximaContaPagar?.data_vencimento 
    ? format(parseISO(proximaContaPagar.data_vencimento), 'dd/MM/yyyy', { locale: ptBR }) 
    : (dataFimAcesso ? format(dataFimAcesso, 'dd/MM/yyyy', { locale: ptBR }) : 'N/A');
    
  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  return (
    <LayoutPrincipal>
      <h1 className="text-2xl md:text-3xl font-bold mb-6 flex items-center">
        <DollarSign className="w-6 h-6 mr-2" /> Minha Assinatura
      </h1>
      
      {/* NOVO: Exibição do Último Registro de Assinatura (para debug/visualização) */}
      {ultimoRegistroAssinatura && (
          <Card className="mb-6 bg-secondary/50">
              <CardHeader className="p-3">
                  <CardTitle className="text-sm font-semibold">Último Registro de Assinatura (admin_contas_receber)</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 text-xs overflow-x-auto">
                  <pre className="whitespace-pre-wrap break-all">
                      {JSON.stringify(ultimoRegistroAssinatura, null, 2)}
                  </pre>
              </CardContent>
          </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Detalhes do Plano */}
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-xl flex items-center">
              <Package className="w-5 h-5 mr-2" /> Plano Atual
            </CardTitle>
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
              <Badge variant={
                statusAssinatura === 'Ativa'
                  ? 'default'
                  : statusAssinatura === 'Trial Ativo'
                  ? 'warning'
                  : 'destructive'
              }>
                {statusAssinatura}
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-semibold flex items-center">
                <CalendarCheck className="w-4 h-4 mr-2" /> Próxima Cobrança:
              </span>
              <span className="font-bold">{dataProximaCobranca}</span>
            </div>
          </CardContent>
        </Card>

        {/* Próxima Mensalidade (Mantido na coluna 1 para layout) */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-xl flex items-center">
              <ArrowDownCircle className="w-5 h-5 mr-2" /> Próxima Mensalidade
            </CardTitle>
          </CardHeader>
          <CardContent>
            {proximaContaPagar ? (
              <div className="space-y-2">
                <p className="text-3xl font-bold text-red-600">{formatCurrency(proximaContaPagar.valor)}</p>
                <p className="text-sm text-muted-foreground">
                  Vencimento: {format(parseISO(proximaContaPagar.data_vencimento), 'dd/MM/yyyy', { locale: ptBR })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {proximaContaPagar.fornecedor}
                </p>
                
                <Button 
                    variant="default" 
                    size="sm" 
                    className="mt-4 w-full"
                    onClick={handleNavigateToRenewal}
                    disabled={isSubmitting}
                >
                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="w-4 h-4 mr-2" />}
                    Pagar Mensalidade (Stripe)
                </Button>
                
                <Link to="/contas-pagar">
                    <Button variant="secondary" size="sm" className="mt-2 w-full">
                        Ver Contas a Pagar
                    </Button>
                </Link>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma cobrança futura pendente.</p>
            )}
          </CardContent>
        </Card>
        
        {/* Histórico de Pagamentos (Movido para col-span-2) */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-xl">Histórico de Pagamentos</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data Pagamento</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor Pago</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historicoPagamentos.length > 0 ? (
                  historicoPagamentos.map((p) => (
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
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                      Nenhum pagamento encontrado.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </LayoutPrincipal>
  );
};

export default MinhaAssinatura;