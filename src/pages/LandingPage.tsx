import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Zap, ArrowUpCircle, ArrowDownCircle, Clock, FileSignature, Check, Scale } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const FEATURES = [
    { icon: ArrowUpCircle, title: "Contas a Receber", description: "Gerencie faturas, parcelas e recebimentos de clientes com automação." },
    { icon: ArrowDownCircle, title: "Contas a Pagar", description: "Controle despesas, fornecedores e evite atrasos com alertas inteligentes." },
    { icon: Clock, title: "Ponto Eletrônico", description: "Registro de ponto por selfie e geolocalização para funcionários." },
    { icon: FileSignature, title: "Contratos Dinâmicos", description: "Crie, preencha e envie contratos para assinatura eletrônica em minutos." },
    { icon: Scale, title: "Relatórios Contábeis", description: "Gere DRE, Balanço Patrimonial e exporte dados para seu contador (Calima)." },
    { icon: Check, title: "Conciliação Bancária", description: "Importe extratos CSV e concilie lançamentos automaticamente." },
];

const LandingPage: React.FC = () => {
  return (
    <div className="w-full">
      
      {/* Seção 1: Hero - Início */}
      <section id="inicio" className="py-20 md:py-32 text-center bg-secondary/20">
        <div className="container mx-auto px-4 max-w-4xl">
          <Zap className="w-16 h-16 text-primary mx-auto mb-6" />
          <h1 className="text-4xl md:text-6xl font-extrabold mb-4 text-foreground leading-tight">
            Controle Financeiro e RH em um Só Lugar.
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mb-8">
            O Fluxo de Caixa que simplifica a gestão da sua empresa, do faturamento à folha de ponto.
          </p>
          <Link to="/vendas">
            <Button size="lg" className="text-lg px-8 py-6 shadow-lg hover:shadow-xl transition-all">
              Comece Agora (Teste Grátis)
            </Button>
          </Link>
        </div>
      </section>

      {/* Seção 2: Sistema - Funcionalidades */}
      <section id="sistema" className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">Funcionalidades Irresistíveis</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {FEATURES.map((feature, index) => (
              <Card key={index} className="hover:shadow-xl transition-shadow duration-300">
                <CardHeader>
                  <feature.icon className="w-8 h-8 text-primary mb-2" />
                  <CardTitle className="text-xl">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
      
      {/* Seção 3: Preços (Link para /vendas) */}
      <section id="precos" className="py-16 md:py-24 bg-secondary/20">
        <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Planos Flexíveis para o Seu Negócio</h2>
            <p className="text-lg text-muted-foreground mb-8">
                Transparência total. Sem taxas escondidas.
            </p>
            <Link to="/vendas">
                <Button variant="outline" size="lg">
                    Ver Detalhes dos Planos
                </Button>
            </Link>
        </div>
      </section>

      {/* Seção 4: Suporte */}
      <section id="suporte" className="py-16 md:py-24">
        <div className="container mx-auto px-4 max-w-3xl text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Suporte Dedicado</h2>
          <p className="text-lg text-muted-foreground mb-8">
            Nossa equipe está pronta para ajudar você a tirar o máximo proveito do sistema.
          </p>
          <Button variant="secondary" size="lg">
            Fale Conosco
          </Button>
        </div>
      </section>
      
      {/* Seção 5: Sobre Nós */}
      <section id="sobre" className="py-16 md:py-24 bg-secondary/20">
        <div className="container mx-auto px-4 max-w-4xl">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">Sobre Nós</h2>
          <p className="text-lg text-muted-foreground text-center">
            Nascemos da necessidade de integrar finanças e gestão de pessoas de forma simples e acessível para pequenas e médias empresas. Nossa missão é dar a você o controle total, sem a complexidade dos sistemas tradicionais.
          </p>
        </div>
      </section>
      
    </div>
  );
};

export default LandingPage;