import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Zap, Loader2, User, Building2, Check, X, Package } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { Plano } from '@/types/plano';
import { PERMISSOES_DISPONIVEIS } from '@/config/permissoes';
import { cn } from '@/lib/utils';
import CheckoutPlano from '@/components/CheckoutPlano';

const Vendas: React.FC = () => {
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [carregandoPlanos, setCarregandoPlanos] = useState(true);
  const [planoSelecionado, setPlanoSelecionado] = useState<Plano | null>(null);
  const navigate = useNavigate();

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

  useEffect(() => {
    buscarPlanos();
  }, [buscarPlanos]);
  
  const handleSelectPlan = (plano: Plano) => {
      setPlanoSelecionado(plano);
  };
  
  const handleBackToPlans = () => {
      setPlanoSelecionado(null);
  };

  if (carregandoPlanos) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
    );
  }
  
  if (planoSelecionado) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
            <Button variant="link" onClick={handleBackToPlans} className="mb-4 self-start md:self-center">
                &larr; Voltar para a seleção de planos
            </Button>
            <CheckoutPlano plano={planoSelecionado} />
        </div>
      );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-12">
      <div className="max-w-6xl mx-auto text-center">
        
        {/* Seção de Apresentação (Hero) */}
        <div className="min-h-[30vh] flex flex-col items-center justify-center pt-16 pb-16">
            <Zap className="w-12 h-12 text-primary mb-4" />
            <h1 className="text-5xl md:text-6xl font-extrabold mb-4 text-foreground leading-tight">
                O Fluxo de Caixa que sua Empresa Merece.
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mb-8">
                Gerencie contas a pagar, a receber, folha de ponto e contratos em uma única plataforma multi-tenant, segura e eficiente.
            </p>
            
            <Link to="/login">
                <Button 
                    size="lg" 
                    className="text-lg px-8 py-6 shadow-lg hover:shadow-xl transition-all"
                >
                    Fazer Login ou Cadastrar
                </Button>
            </Link>
            
            <div className="mt-12 text-center">
                <p className="text-sm text-muted-foreground">Já é cliente? <Link to="/login" className="text-primary hover:underline">Faça login aqui.</Link></p>
            </div>
        </div>
        
        {/* Seção de Planos */}
        <div className="pt-16">
            <h2 className="text-3xl font-bold mb-8">Escolha o Plano Ideal</h2>
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
                                <Package className="w-4 h-4 mr-2" /> Módulos Incluídos:
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
                            Iniciar Trial Grátis
                        </Button>
                    </Card>
                ))}
            </div>
        </div>
        
      </div>
    </div>
  );
};

export default Vendas;