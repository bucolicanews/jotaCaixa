import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Users, TrendingUp } from "lucide-react";

const Index = () => {
  const { usuario, empresa } = useAuth();

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">
        Painel Principal
      </h1>
      
      {usuario && (
        <p className="text-lg text-muted-foreground">
          Bem-vindo(a), {usuario.nome}. 
          {empresa && (
            <span className="ml-2 font-medium text-primary">
              Empresa: {empresa.nome_fantasia} ({empresa.cnpj})
            </span>
          )}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Saldo Atual (Caixa/Bancos)
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">R$ 0,00</div>
            <p className="text-xs text-muted-foreground">
              +0% desde o mês passado
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Contas a Vencer (30 dias)
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">R$ 0,00</div>
            <p className="text-xs text-muted-foreground">
              0 contas pendentes
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Fluxo Projetado (Próx. Mês)
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">R$ 0,00</div>
            <p className="text-xs text-muted-foreground">
              Projeção de Receitas - Despesas
            </p>
          </CardContent>
        </Card>
      </div>
      
      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-4">Gráficos e Alertas</h2>
        <Card className="p-4 h-64 flex items-center justify-center">
            <p className="text-muted-foreground">Gráficos de Fluxo de Caixa e Inadimplência virão aqui.</p>
        </Card>
      </div>
    </div>
  );
};

export default Index;