import React, { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Zap, ArrowDown } from 'lucide-react';
import VendasPlanos from '@/components/VendasPlanos';
import { Link } from 'react-router-dom'; // Importando Link

const Vendas: React.FC = () => {
  const planosRef = useRef<HTMLDivElement>(null);

  const scrollToPlans = () => {
    planosRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-12">
      <div className="max-w-6xl mx-auto text-center">
        
        {/* Seção de Apresentação (Hero) */}
        <div className="min-h-[70vh] flex flex-col items-center justify-center pt-16 pb-16">
            <Zap className="w-12 h-12 text-primary mb-4" />
            <h1 className="text-5xl md:text-6xl font-extrabold mb-4 text-foreground leading-tight">
                O Fluxo de Caixa que sua Empresa Merece.
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mb-8">
                Gerencie contas a pagar, a receber, folha de ponto e contratos em uma única plataforma multi-tenant, segura e eficiente.
            </p>
            
            <Button 
                onClick={scrollToPlans} 
                size="lg" 
                className="text-lg px-8 py-6 shadow-lg hover:shadow-xl transition-all"
            >
                Ver Planos e Iniciar Trial Grátis
                <ArrowDown className="w-5 h-5 ml-2" />
            </Button>
            
            <div className="mt-12 text-center">
                <p className="text-sm text-muted-foreground">Já é cliente? <Link to="/login" className="text-primary hover:underline">Faça login aqui.</Link></p>
            </div>
        </div>

        {/* Seção de Planos (Scroll Target) */}
        <div ref={planosRef} className="pt-16 pb-16">
            <VendasPlanos />
        </div>
        
      </div>
    </div>
  );
};

export default Vendas;