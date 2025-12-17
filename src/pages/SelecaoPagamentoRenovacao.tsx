import React, { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader2, Package, DollarSign, Check, X, ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { Plano } from '@/types/plano';
import { PERMISSOES_DISPONIVEIS } from '@/config/permissoes';
import { cn } from '@/lib/utils';
import CheckoutPlano from '@/components/CheckoutPlano';
import { useSessao } from '@/hooks/use-sessao';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ClienteProfile } from '@/types/usuario';
import { Badge } from '@/components/ui/badge';
import { useStripeConfigClient } from '@/integrations/stripe/use-stripe-config-client';

const SelecaoPagamentoRenovacao: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { perfil, role, carregando } = useSessao();
  
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [carregandoPlanos, setCarregandoPlanos] = useState(true);
  const [planoSelecionado, setPlanoSelecionado] = useState<Plano | null>(null);
  const [valorParcela, setValorParcela] = useState<number | null>(null); // Alterado para valorParcela
  
  const contaPagarId = searchParams.get('cp_id'); // Este é o ID da Parcela
  const clienteProfile = perfil as ClienteProfile;
  const planoAtualId = clienteProfile?.plano_id;
  const adminId = clienteProfile?.admin_id;

  const { loading: loadingStripe } = useStripeConfigClient(adminId || null);

  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  
  const permissoesMap = PERMISSOES_DISPONIVEIS.filter(p => 
    p.key !== 'ponto_eletronico' && p.key !== 'visualizar_proprio_ponto'
  ).map(p => ({
      key: p.key,
      label: p.label,
  }));

  const buscarPlanos = useCallback(async () => {
    setCarregandoPlanos(true);
    
    const { data, error } = await supabase
      .from('planos')
      .select('*')
      .order('preco_mensal', { ascending: true });

    if (error) {
      showError('Erro ao carregar planos: ' + error.message);
      setPlanos([]);
    } else {
      setPlanos(data as Plano[]);
    }
    setCarregandoPlanos(false);
  }, []);
  
  // Busca o valor da parcela (que é a conta a pagar pendente)
  const fetchParcelaValor = useCallback(async (id: string) => {
      const { data, error } = await supabase
          .from('admin_parcelas_receber')
          .select('valor_parcela')
          .eq('id', id)
          .single();
          
      if (error || !data) {
          showError('Não foi possível carregar o valor da parcela pendente.');
          navigate('/minha-assinatura', { replace: true });
          return null;
      }
      setValorParcela(Number(data.valor_parcela));
      return Number(data.valor_parcela);
  }, [navigate]);

  useEffect(() => {
    if (!carregando && role === 'Cliente' && contaPagarId) {
        buscarPlanos();
        fetchParcelaValor(contaPagarId);
    } else if (!carregando && role !== 'Cliente') {
        navigate('/painel', { replace: true });
    } else if (!contaPagarId) {
        showError('ID da conta a pagar não fornecido.');
        navigate('/minha-assinatura', { replace: true });
    }
  }, [carregando, role, contaPagarId, buscarPlanos, navigate, fetchParcelaValor]);
  
  const handleSelectPlan = (plano: Plano) => {
      setPlanoSelecionado(plano);
  };
  
  const handleBackToPlans = () => {
      setPlanoSelecionado(null);
  };

  if (carregando || carregandoPlanos || loadingStripe || !contaPagarId || valorParcela === null) {
    return (
        <LayoutPrincipal>
            <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        </LayoutPrincipal>
    );
  }
  
  if (planoSelecionado) {
      // Lógica Condicional do Valor:
      const isPayingCurrentPlan = planoSelecionado.id === planoAtualId;
      // Se for o plano atual, cobra o valor da parcela pendente. Se for upgrade/downgrade, cobra o preço mensal do novo plano.
      const valorParaCheckout = isPayingCurrentPlan ? valorParcela : planoSelecionado.preco_mensal;
      
      // RETORNO ANTECIPADO: Renderiza APENAS o CheckoutPlano
      return (
        <LayoutPrincipal>
            <div className="max-w-xl mx-auto">
                <Button variant="link" onClick={handleBackToPlans} className="mb-4">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Voltar para a seleção
                </Button>
                <CheckoutPlano 
                    plano={planoSelecionado} 
                    isUpgrade={true} 
                    contaPagarId={contaPagarId} // ID da Parcela
                    valorCobrado={valorParaCheckout}
                />
            </div>
        </LayoutPrincipal>
      );
  }

  // Renderiza a seleção de planos APENAS se nenhum plano estiver selecionado
  return (
    <LayoutPrincipal>
        <div className="max-w-6xl mx-auto text-center pt-8">
            <h1 className="text-3xl md:text-4xl font-bold mb-4 flex items-center justify-center">
                <DollarSign className="w-8 h-8 mr-2" /> Renovar Assinatura
            </h1>
            <p className="text-lg text-muted-foreground mb-4">
                Selecione o plano que deseja pagar para o próximo ciclo.
            </p>
            <div className="p-4 bg-red-100 dark:bg-red-900/20 border border-red-500 rounded-md mb-8 max-w-md mx-auto">
                <p className="font-semibold text-red-700 dark:text-red-300">
                    Valor pendente na parcela: {formatCurrency(valorParcela)}
                </p>
                <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                    Se você mudar de plano, o valor cobrado agora será o preço mensal do novo plano.
                </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {planos.map((plano) => {
                    const isCurrentPlan = plano.id === planoAtualId;
                    return (
                        <Card 
                            key={plano.id} 
                            className={cn(
                                "p-4 flex flex-col items-center text-center transition-all duration-300",
                                isCurrentPlan ? "border-4 border-green-500 shadow-xl" : "border-secondary"
                            )}
                        >
                            <Package className="w-8 h-8 text-primary mb-3" />
                            
                            <h3 className="text-xl font-semibold mb-1">{plano.nome}</h3>
                            {isCurrentPlan && <Badge variant="default" className="mb-2 bg-green-500 hover:bg-green-500">Plano Atual</Badge>}
                            
                            <div className="text-3xl font-extrabold text-foreground mb-4">
                                {formatCurrency(plano.preco_mensal)}
                                <span className="text-base font-medium text-muted-foreground">/mês</span>
                            </div>
                            
                            <div className="space-y-3 flex-1 text-left w-full">
                                <h4 className="font-semibold flex items-center text-primary mb-2">
                                    Módulos Incluídos:
                                </h4>
                                <div className="space-y-1">
                                    {permissoesMap.map(p => {
                                        const isIncluded = plano.permissoes[p.key] === true;
                                        return (
                                            <div key={p.key} className="flex items-center space-x-2">
                                                {isIncluded ? (
                                                    <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                                                ) : (
                                                    <X className="w-4 h-4 text-red-500 flex-shrink-0" />
                                                )}
                                                <span className={cn("text-sm", !isIncluded && "text-muted-foreground line-through")}>
                                                    {p.label}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            
                            <Button 
                                onClick={() => handleSelectPlan(plano)} 
                                className="w-full mt-6"
                            >
                                {isCurrentPlan ? 'Pagar Plano Atual' : 'Fazer Upgrade/Downgrade'}
                            </Button>
                        </Card>
                    );
                })}
            </div>
        </div>
    </LayoutPrincipal>
  );
};

export default SelecaoPagamentoRenovacao;