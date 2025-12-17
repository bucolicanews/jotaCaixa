import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

const TesteGratis: React.FC = () => {
  return (
      <div className="max-w-3xl mx-auto my-10 px-4">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-3xl font-bold">7 Dias de Teste Grátis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-lg text-muted-foreground">
            <p>
              Experimente todo o poder do nosso ERP por 7 dias sem custo algum. Durante esse período você terá acesso
              completo aos módulos Financeiro, Contábil, RH, Folha de Ponto e Contratos.
            </p>
            <p>
              Para iniciar é simples: clique no botão abaixo, faça o cadastro na tela de login e aguarde o e-mail de confirmação com o link de acesso.
            </p>
            <p>
              Após confirmar o e-mail, seu ambiente ficará liberado automaticamente por 7 dias.
            </p>
            <div className="pt-4">
              <Link to="/login">
                <Button size="lg" className="w-full md:w-auto">Quero meu Teste Grátis</Button>
              </Link>
            </div>
            <p className="text-sm text-center text-muted-foreground mt-6">
              Precisa de ajuda no cadastro? Entre em contato com nosso suporte por WhatsApp.
            </p>
          </CardContent>
        </Card>
      </div>
  );
};

export default TesteGratis;
