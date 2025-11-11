import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSessao } from '@/hooks/use-sessao';
import FormConfiguracoesStripe from '@/components/formularios/FormConfiguracoesStripe';
import FormConfiguracoesCR from '@/components/formularios/FormConfiguracoesCR';
import FormConfiguracoesCP from '@/components/formularios/FormConfiguracoesCP';
import FormConfiguracoesContrato from '@/components/formularios/FormConfiguracoesContrato';
import FormConfiguracaoPlanoContas from '@/components/formularios/FormConfiguracaoPlanoContas'; // NOVO IMPORT
import { Key, Settings, DollarSign, ArrowDownCircle, FileSignature, BookOpen } from 'lucide-react'; // NOVO ICONE

const Configuracoes = () => {
  const { role, usuario } = useSessao();
  const isAdmin = role === 'Admin';
  
  // O ID do proprietário é o ID do Admin logado
  const proprietarioId = usuario?.id || '';
  
  return (
    <LayoutPrincipal>
      <h1 className="text-2xl md:text-3xl font-bold mb-6 flex items-center">
        <Settings className="w-6 h-6 mr-2" /> Configurações
      </h1>
      
      <Tabs defaultValue={isAdmin ? "plano_contas" : "geral"} className="w-full">
        {/* Ajuste: Usando flex-wrap e w-full para quebrar em várias linhas em telas pequenas */}
        <TabsList className="flex flex-wrap h-auto justify-start w-full">
          <TabsTrigger value="geral" className="flex-1 sm:flex-auto">Geral</TabsTrigger>
          {isAdmin && <TabsTrigger value="plano_contas" className="flex-1 sm:flex-auto flex items-center"><BookOpen className="w-4 h-4 mr-1" /> Plano de Contas</TabsTrigger>}
          {isAdmin && <TabsTrigger value="cr" className="flex-1 sm:flex-auto flex items-center"><DollarSign className="w-4 h-4 mr-1" /> Contas a Receber</TabsTrigger>}
          {isAdmin && <TabsTrigger value="cp" className="flex-1 sm:flex-auto flex items-center"><ArrowDownCircle className="w-4 h-4 mr-1" /> Contas a Pagar</TabsTrigger>}
          {isAdmin && <TabsTrigger value="contratos" className="flex-1 sm:flex-auto flex items-center"><FileSignature className="w-4 h-4 mr-1" /> Contratos</TabsTrigger>}
          {isAdmin && <TabsTrigger value="stripe" className="flex-1 sm:flex-auto flex items-center"><Key className="w-4 h-4 mr-1" /> Stripe</TabsTrigger>}
          <TabsTrigger value="usuarios" className="flex-1 sm:flex-auto">Usuários</TabsTrigger>
          <TabsTrigger value="tributarias" className="flex-1 sm:flex-auto">Tributárias</TabsTrigger>
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
          <TabsContent value="plano_contas" className="mt-4">
            <Card>
              <CardHeader><CardTitle>Máscara de Código Contábil</CardTitle></CardHeader>
              <CardContent>
                <FormConfiguracaoPlanoContas proprietarioId={proprietarioId} />
              </CardContent>
            </Card>
          </TabsContent>
        )}
        
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
          <TabsContent value="cp" className="mt-4">
            <Card>
              <CardHeader><CardTitle>Mapeamento Contábil de Contas a Pagar</CardTitle></CardHeader>
              <CardContent>
                <FormConfiguracoesCP />
              </CardContent>
            </Card>
          </TabsContent>
        )}
        
        {isAdmin && (
          <TabsContent value="contratos" className="mt-4">
            <Card>
              <CardHeader><CardTitle>Configurações de Contratos e Links</CardTitle></CardHeader>
              <CardContent>
                <FormConfiguracoesContrato />
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