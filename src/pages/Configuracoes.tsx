import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSessao } from '@/hooks/use-sessao';
import FormConfiguracoesStripe from '@/components/FormConfiguracoesStripe';
import FormConfiguracoesCR from '@/components/FormConfiguracoesCR';
import GerenciarConfiguracoesConciliacao from '@/components/GerenciarConfiguracoesConciliacao'; // NOVO COMPONENTE
import { Key, Settings, DollarSign, Banknote } from 'lucide-react';

const Configuracoes = () => {
  const { role } = useSessao();
  const isAdmin = role === 'Admin';
  
  return (
    <LayoutPrincipal>
      <h1 className="text-2xl md:text-3xl font-bold mb-6 flex items-center">
        <Settings className="w-6 h-6 mr-2" /> Configurações
      </h1>
      
      <Tabs defaultValue={isAdmin ? "cr" : "geral"} className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          <TabsTrigger value="geral">Geral</TabsTrigger>
          {isAdmin && <TabsTrigger value="cr" className="flex items-center"><DollarSign className="w-4 h-4 mr-1" /> Contas a Receber</TabsTrigger>}
          {isAdmin && <TabsTrigger value="stripe" className="flex items-center"><Key className="w-4 h-4 mr-1" /> Stripe</TabsTrigger>}
          <TabsTrigger value="bancos" className="flex items-center"><Banknote className="w-4 h-4 mr-1" /> Bancos</TabsTrigger>
          <TabsTrigger value="usuarios">Usuários</TabsTrigger>
          <TabsTrigger value="tributarias">Tributárias</TabsTrigger>
        </TabsList>
        
        <TabsContent value="geral" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Configurações Gerais da Empresa</CardTitle></CardHeader>
            <CardContent>
              <p className="text-lg text-gray-600 dark:text-gray-400">
                Gerencie informações básicas da empresa, como nome, endereço e dados de contato.
              </p>
              {/* TODO: Implementar formulário de configuração geral */}
            </CardContent>
          </Card>
        </TabsContent>
        
        {isAdmin && (
          <TabsContent value="cr" className="mt-4">
            <Card>
              <CardHeader><CardTitle>Mapeamento Contábil de Contas a Receber</CardTitle></CardHeader>
              <CardContent>
                <FormConfiguracoesCR />
              </CardContent>
            </Card>
          </TabsContent>
        )}
        
        {isAdmin && (
          <TabsContent value="stripe" className="mt-4">
            <Card>
              <CardHeader><CardTitle>Credenciais do Stripe</CardTitle></CardHeader>
              <CardContent>
                <FormConfiguracoesStripe />
              </CardContent>
            </Card>
          </TabsContent>
        )}
        
        <TabsContent value="bancos" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Configurações de Importação de Extratos</CardTitle></CardHeader>
            <CardContent>
              <GerenciarConfiguracoesConciliacao /> {/* USANDO O NOVO COMPONENTE */}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="usuarios" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Gestão de Usuários e Permissões</CardTitle></CardHeader>
            <CardContent>
              <p className="text-lg text-gray-600 dark:text-gray-400">
                Gerencie usuários, perfis de importação e regras tributárias.
              </p>
              {/* TODO: Implementar link para GerenciarUsuarios */}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="tributarias" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Regras Tributárias e Calima</CardTitle></CardHeader>
            <CardContent>
              <p className="text-lg text-gray-600 dark:text-gray-400">
                Configure mapeamentos para exportação Calima e regras tributárias.
              </p>
              {/* TODO: Implementar configurações tributárias */}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </LayoutPrincipal>
  );
};

export default Configuracoes;