import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Zap, ArrowUpCircle, ArrowDownCircle, Clock, FileSignature, Check, Scale, Banknote, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const FEATURES = [
    { 
        icon: ArrowUpCircle, 
        title: "Contas a Receber", 
        subtitle: "Otimize seu Faturamento",
        description: "Nunca mais perca um prazo de pagamento. Gerencie faturas, parcelas e recebimentos de clientes. O sistema calcula juros e multas automaticamente, garantindo que seu fluxo de caixa esteja sempre saudável." 
    },
    { 
        icon: ArrowDownCircle, 
        title: "Contas a Pagar", 
        subtitle: "Controle Total de Despesas",
        description: "Mantenha seus fornecedores em dia. Controle despesas, visualize parcelamentos futuros e evite atrasos com alertas inteligentes. Tenha uma visão clara de todos os seus compromissos financeiros." 
    },
    { 
        icon: Banknote, 
        title: "Bancos e Saldos", 
        subtitle: "Visão Unificada de Caixa",
        description: "Conecte todas as suas contas bancárias e caixas internos. Calcule o saldo atual em tempo real, somando saldos iniciais e todos os lançamentos (entradas e saídas). Saiba exatamente quanto você tem, onde você tem." 
    },
    { 
        icon: Clock, 
        title: "Ponto Eletrônico", 
        subtitle: "Gestão de RH Simplificada",
        description: "Sistema de ponto eletrônico para funcionários com registro por selfie e geolocalização. Acompanhe a folha de ponto, horas extras e faltas, garantindo conformidade legal e precisão no cálculo salarial." 
    },
    { 
        icon: FileSignature, 
        title: "Contratos Dinâmicos", 
        subtitle: "Assinatura Eletrônica Rápida",
        description: "Crie modelos de contrato com tags dinâmicas que preenchem automaticamente dados do cliente e valores financeiros. Envie para assinatura eletrônica e gere as Contas a Receber correspondentes em um clique." 
    },
    { 
        icon: Check, 
        title: "Conciliação Bancária", 
        subtitle: "Automatize Lançamentos",
        description: "Importe extratos CSV e deixe o sistema conciliar lançamentos automaticamente com base em regras predefinidas. Identifique duplicidades e mapeie transações para o Plano de Contas em minutos, não horas." 
    },
    { 
        icon: Scale, 
        title: "Relatórios Contábeis", 
        subtitle: "Pronto para o Contador",
        description: "Gere relatórios essenciais como DRE (Demonstração do Resultado do Exercício) e Balanço Patrimonial. Exporte lançamentos no formato de partidas dobradas, prontos para importação em sistemas contábeis (Ex: Calima)." 
    },
    { 
        icon: TrendingUp, 
        title: "Faturamento e Assinaturas", 
        subtitle: "Vendas e Recorrência",
        description: "Gerencie planos de assinatura, integre com o Stripe para pagamentos recorrentes e acompanhe o ciclo de vida do cliente. Ideal para negócios com receita previsível e modelos de serviço." 
    },
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

      {/* Seção 2: Sistema - Funcionalidades (Expandida) */}
      <section id="sistema" className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">O Sistema Quase Irresistível</h2>
          <p className="text-xl text-muted-foreground text-center mb-12 max-w-3xl mx-auto">
            Chega de planilhas e sistemas desconectados. Nossos módulos trabalham juntos para dar a você o controle total e a tranquilidade que sua gestão merece.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {FEATURES.map((feature, index) => (
              <Card key={index} className="hover:shadow-xl transition-shadow duration-300 flex flex-col">
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