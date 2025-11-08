import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Zap, ArrowUpCircle, ArrowDownCircle, Clock, FileSignature, Check, Scale, Banknote, TrendingUp, Phone, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

const FEATURES = [
    { 
        icon: ArrowUpCircle, 
        title: "Contas a Receber", 
        subtitle: "Otimize seu Faturamento",
        description: "Nunca mais perca um prazo de pagamento. Gerencie faturas, parcelas e recebimentos de clientes." 
    },
    { 
        icon: ArrowDownCircle, 
        title: "Contas a Pagar", 
        subtitle: "Controle Total de Despesas",
        description: "Mantenha seus fornecedores em dia. Controle despesas, visualize parcelamentos futuros e evite atrasos." 
    },
    { 
        icon: Banknote, 
        title: "Bancos e Saldos", 
        subtitle: "Visão Unificada de Caixa",
        description: "Conecte todas as suas contas bancárias e caixas internos. Calcule o saldo atual em tempo real." 
    },
    { 
        icon: Clock, 
        title: "Ponto Eletrônico", 
        subtitle: "Gestão de RH Simplificada",
        description: "Sistema de ponto eletrônico para funcionários com registro por selfie e geolocalização." 
    },
    { 
        icon: FileSignature, 
        title: "Contratos Dinâmicos", 
        subtitle: "Assinatura Eletrônica Rápida",
        description: "Crie modelos de contrato com tags dinâmicas e envie para assinatura eletrônica em um clique." 
    },
    { 
        icon: Check, 
        title: "Conciliação Bancária", 
        subtitle: "Automatize Lançamentos",
        description: "Importe extratos CSV e deixe o sistema conciliar lançamentos automaticamente com base em regras." 
    },
    { 
        icon: Scale, 
        title: "Relatórios Contábeis", 
        subtitle: "Pronto para o Contador",
        description: "Gere DRE e Balanço Patrimonial. Exporte lançamentos no formato de partidas dobradas (Calima)." 
    },
    { 
        icon: TrendingUp, 
        title: "Faturamento e Assinaturas", 
        subtitle: "Vendas e Recorrência",
        description: "Gerencie planos de assinatura, integre com o Stripe para pagamentos recorrentes e acompanhe o ciclo de vida." 
    },
];

const LandingPage: React.FC = () => {
  return (
    <div className="w-full">
      
      {/* Seção 1: Hero - Início */}
      <section id="inicio" className="py-20 md:py-32 text-center bg-background">
        <div className="container mx-auto px-4 max-w-5xl">
          <Zap className="w-16 h-16 text-primary mx-auto mb-6 animate-pulse" />
          <h1 className="text-4xl md:text-7xl font-extrabold mb-6 text-foreground leading-tight tracking-tighter">
            Controle Financeiro e RH em um Só Lugar.
          </h1>
          <p className="text-lg md:text-2xl text-muted-foreground mb-10 max-w-3xl mx-auto">
            A plataforma completa que simplifica a gestão da sua empresa, do faturamento à folha de ponto, com foco em automação e conformidade.
          </p>
          <Link to="/vendas">
            <Button size="lg" className="text-xl px-10 py-7 shadow-xl hover:shadow-2xl transition-all transform hover:scale-[1.02]">
              Comece Agora (Teste Grátis)
            </Button>
          </Link>
        </div>
      </section>

      {/* Seção 2: Sistema - Funcionalidades (Expandida) */}
      <section id="sistema" className="py-16 md:py-24 bg-secondary/20">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-5xl font-bold text-center mb-4">Módulos Poderosos</h2>
          <p className="text-xl text-muted-foreground text-center mb-16 max-w-3xl mx-auto">
            Chega de planilhas e sistemas desconectados. Nossos módulos trabalham juntos para dar a você o controle total.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {FEATURES.map((feature, index) => (
              <Card 
                key={index} 
                className="hover:shadow-2xl transition-shadow duration-300 flex flex-col h-full border-t-4 border-primary/50"
              >
                <CardHeader className="flex-grow">
                  <feature.icon className="w-8 h-8 text-primary mb-2" />
                  <CardTitle className="text-xl">{feature.title}</CardTitle>
                  <p className="text-sm font-semibold text-primary/80">{feature.subtitle}</p>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-sm">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
      
      {/* Seção 3: Preços (Link para /vendas) */}
      <section id="precos" className="py-16 md:py-24 bg-background">
        <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl md:text-5xl font-bold mb-4">Planos Flexíveis</h2>
            <p className="text-lg text-muted-foreground mb-10 max-w-3xl mx-auto">
                Escolha o plano que melhor se adapta ao tamanho e às necessidades da sua empresa.
            </p>
            <Link to="/vendas">
                <Button variant="default" size="lg" className="text-lg px-8 py-6">
                    Ver Detalhes dos Planos
                </Button>
            </Link>
        </div>
      </section>

      {/* Seção 4: Suporte */}
      <section id="suporte" className="py-16 md:py-24 bg-secondary/20">
        <div className="container mx-auto px-4 max-w-4xl text-center">
          <h2 className="text-3xl md:text-5xl font-bold mb-4">Suporte Dedicado</h2>
          <p className="text-lg text-muted-foreground mb-8">
            Nossa equipe está pronta para ajudar você a tirar o máximo proveito do sistema. Entre em contato para dúvidas, demonstrações ou assistência técnica.
          </p>
          <Button variant="secondary" size="lg" className="text-lg px-8 py-6">
            <Phone className="w-5 h-5 mr-2" /> Contatar Suporte
          </Button>
        </div>
      </section>
      
      {/* Seção 5: Sobre Nós */}
      <section id="sobre" className="py-16 md:py-24 bg-background">
        <div className="container mx-auto px-4 max-w-4xl">
          <h2 className="text-3xl md:text-5xl font-bold text-center mb-4">Nossa Missão</h2>
          <Separator className="my-6 max-w-xs mx-auto" />
          <p className="text-xl text-muted-foreground text-center flex items-center">
            <Info className="w-6 h-6 mr-3 text-primary flex-shrink-0" />
            Nascemos da necessidade de integrar finanças e gestão de pessoas de forma simples e acessível para pequenas e médias empresas. Nossa missão é dar a você o controle total, sem a complexidade dos sistemas tradicionais.
          </p>
        </div>
      </section>
      
    </div>
  );
};

export default LandingPage;