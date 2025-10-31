import React from 'react';
import { Button } from '@/components/ui/button';
import { Zap } from 'lucide-react';
import { Link } from 'react-router-dom';

const Vendas: React.FC = () => {
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
        
      </div>
    </div>
  );
};

export default Vendas;