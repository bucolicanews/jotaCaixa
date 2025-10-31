import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Check, X, DollarSign, Package } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { Plano } from '@/types/plano';
import { PERMISSOES_DISPONIVEIS } from '@/config/permissoes';
import { cn } from '@/lib/utils';
import CheckoutPlano from '@/components/CheckoutPlano';
import { Link } from 'react-router-dom';

const VendasPlanos: React.FC = () => {
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [planoSelecionado, setPlanoSelecionado] = useState<Plano | null>(null);

  const buscarPlanos = useCallback(async () => {
    setCarregando(true);
    
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
    setCarregando(false);
  }, []);

  useEffect(() => {
    buscarPlanos();
  }, [buscarPlanos]);
  
  const handleSelectPlano = (plano: Plano) => {
      setPlanoSelecionado(plano);
  };
  
  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  
  const permissoesMap = PERMISSOES_DISPONIVEIS.filter(p => 
    p.key !== 'ponto_eletronico' && p.key !== 'visualizar_proprio_ponto'
  ).map(p => ({
      key: p.key,
      label: p.label,
  }));

  if (carregando) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  if (planoSelecionado) {
      return <CheckoutPlano plano={planoSelecionado} />;
  }

  return (
    <div className="max-w-6xl mx-auto text-center">
      <h2 className="text-3xl font-bold mb-4 text-foreground flex items-center justify-center">
          <DollarSign className="w-6 h-6 mr-2" /> Escolha seu Plano
      </h2>
      <p className="text-lg text-muted-foreground mb-10">
        Todos os planos incluem {planos[0]?.dias_trial || 7} dias de teste grátis.
      </p>

      {planos.length === 0 ? (
          <Card className="p-8"><p className="text-muted-foreground">Nenhum plano disponível no momento.</p></Card>
      ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {planos.map((plano) => (
                  <Card 
                      key={plano.id} 
                      className={cn(
                          "flex flex-col p-6 transition-all duration-300",
                          plano.tipo_cliente === 'PJ' ? "border-primary shadow-lg" : "border-secondary"
                      )}
                  >
                      <CardHeader className="p-0 mb-4">
                          <CardTitle className="text-3xl font-bold">{plano.nome}</CardTitle>
                          <CardDescription className="text-lg mt-1">
                              {plano.descricao}
                          </CardDescription>
                      </CardHeader>
                      
                      <div className="text-4xl font-extrabold mb-4">
                          {formatCurrency(plano.preco_mensal)}
                          <span className="text-lg font-medium text-muted-foreground">/mês</span>
                      </div>
                      
                      <div className="text-sm text-green-600 font-semibold mb-6">
                          {plano.dias_trial} dias de teste grátis
                      </div>

                      <div className="space-y-3 flex-1 text-left">
                          <h3 className="font-semibold flex items-center text-primary mb-3">
                              <Package className="w-4 h-4 mr-2" /> Módulos Incluídos:
                          </h3>
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
                      
                      <Button 
                          onClick={() => handleSelectPlano(plano)} 
                          className="mt-8 w-full"
                          variant={plano.tipo_cliente === 'PJ' ? 'default' : 'secondary'}
                      >
                          Aderir ao Plano
                      </Button>
                  </Card>
              ))}
          </div>
      )}
      
      <div className="mt-10">
          <Link to="/login">
              <Button size="lg" className="text-lg px-8 py-6 shadow-lg hover:shadow-xl transition-all">
                  Fazer Login ou Cadastrar
              </Button>
          </Link>
      </div>
    </div>
  );
};

export default VendasPlanos;