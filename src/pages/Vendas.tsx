import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, User, Building2, Check, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { Plano } from '@/types/plano';
import { PERMISSOES_DISPONIVEIS } from '@/config/permissoes';
import { cn } from '@/lib/utils';
import CheckoutPlano from '@/components/CheckoutPlano';
import { useSessao } from '@/hooks/use-sessao';
import { useLocation, useNavigate } from 'react-router-dom';

const Vendas: React.FC = () => {
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [carregandoPlanos, setCarregandoPlanos] = useState(true);
  const [planoSelecionado, setPlanoSelecionado] = useState<Plano | null>(null);
  
  const { role, usuario, carregando: carregandoSessao } = useSessao();
  const location = useLocation();
  const navigate = useNavigate();
  const isClient = role === 'Cliente';

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
      .eq('visivel_vendas', true)
      .order('preco_mensal', { ascending: true });

    if (error) {
      showError('Erro ao carregar planos: ' + error.message);
      setPlanos([]);
    } else {
      setPlanos(data as Plano[]);
    }
    setCarregandoPlanos(false);
  }, []);

  useEffect(() => {
    if (!carregandoSessao) {
      buscarPlanos();
    }
  }, [carregandoSessao, buscarPlanos]);

  useEffect(() => {
    if (planos.length === 0) return;
    const params = new URLSearchParams(location.search);
    const planoIdParam = params.get('plano');
    if (planoIdParam) {
      const found = planos.find((plan) => plan.id === planoIdParam);
      if (found && (!planoSelecionado || planoSelecionado.id !== found.id)) {
        setPlanoSelecionado(found);
      }
    }
  }, [location.search, planos, planoSelecionado]);
  
  const handleSelectPlan = (plano: Plano) => {
      setPlanoSelecionado(plano);
  };
  
  const handleBackToPlans = () => {
      setPlanoSelecionado(null);
  };

  if (carregandoPlanos || carregandoSessao) {
    return (
        <div className="flex items-center justify-center h-screen">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
    );
  }

  // Bloqueio: exige login antes de prosseguir para checkout/upgrade
  if (!usuario) {
    navigate('/login', { replace: true });
    return null;
  }
  
  if (planoSelecionado) {
      return (
        <div className="flex flex-col items-center justify-center p-4 w-full">
            <Button variant="link" onClick={handleBackToPlans} className="mb-4 self-start md:self-center">
                &larr; Voltar para a seleção de planos
            </Button>
            {/* Se for cliente logado, ativa o modo isUpgrade */}
            <CheckoutPlano plano={planoSelecionado} isUpgrade={isClient} />
        </div>
      );
  }
  
  // Renderização para Cliente Logado (Seleção de plano para Upgrade/Downgrade)
  if (isClient) {
      return (
        <div className="p-4 md:p-12 w-full">
            <div className="max-w-6xl mx-auto text-center pt-8">
                <h1 className="text-3xl md:text-4xl font-bold mb-8">Selecione seu Novo Plano</h1>
                <p className="text-lg text-muted-foreground mb-12">
                    Escolha um plano para iniciar o processo de pagamento e atualização.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {planos.map((plano) => (
                        <Card 
                            key={plano.id} 
                            className={cn(
                                "p-4 flex flex-col items-center text-center transition-all duration-300",
                                plano.tipo_cliente === 'PJ' ? "border-primary shadow-lg" : "border-secondary"
                            )}
                        >
                            {plano.tipo_cliente === 'PJ' ? (
                                <Building2 className="w-8 h-8 text-primary mb-3" />
                            ) : (
                                <User className="w-8 h-8 text-primary mb-3" />
                            )}
                            
                            <h3 className="text-xl font-semibold mb-1">{plano.nome} ({plano.tipo_cliente})</h3>
                            <p className="text-sm text-muted-foreground mb-4 h-10 overflow-hidden">
                                {plano.descricao || (plano.tipo_cliente === 'PJ' ? 'Gestão completa para empresas.' : 'Uso pessoal e microempreendedores.')}
                            </p>
                            
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
                                Selecionar Plano
                            </Button>
                        </Card>
                    ))}
                </div>
            </div>
        </div>
      );
  }


  // Este bloco não deve ser alcançado se a lógica de redirecionamento estiver correta,
  // mas é mantido como fallback para o fluxo de adesão pública (que agora é tratado no CheckoutPlano).
  return (
    <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
};

export default Vendas;
