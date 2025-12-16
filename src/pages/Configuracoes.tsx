import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSessao } from '@/hooks/use-sessao';
import FormConfiguracoesStripe from '@/components/formularios/FormConfiguracoesStripe';
import FormConfiguracoesCR from '@/components/formularios/FormConfiguracoesCR';
import FormConfiguracoesCP from '@/components/formularios/FormConfiguracoesCP';
import FormConfiguracoesContrato from '@/components/formularios/FormConfiguracoesContrato';
import FormConfiguracaoPlanoContas from '@/components/formularios/FormConfiguracaoPlanoContas';
import FormConfiguracaoContabil from '@/components/formularios/FormConfiguracaoContabil';
import { Key, Settings, DollarSign, ArrowDownCircle, FileSignature, BookOpen, Scale, Users, Landmark } from 'lucide-react';
import FormConfiguracaoTabelasPadrao from '@/components/formularios/FormConfiguracaoTabelasPadrao';
import { ClienteProfile } from '@/types/usuario';
import { cn } from '@/lib/utils';

const Configuracoes = () => {
  const { role, usuario, perfil } = useSessao();
  const isAdmin = role === 'Admin';
  const isCliente = role === 'Cliente';
  const canAccessContabil = isAdmin || isCliente;
  
  const proprietarioId = isAdmin ? (usuario?.id || '') : ((perfil as ClienteProfile)?.id || '');
  
  return (
    <LayoutPrincipal>
      <h1 className="text-2xl md:text-3xl font-bold mb-6 flex items-center">
        <Settings className="w-6 h-6 mr-2 text-primary" /> Configurações
      </h1>
      
      <Tabs defaultValue={canAccessContabil ? "contabil" : "geral"} className="w-full">
        {/* MELHORIA DE RESPONSIVIDADE:
            - overflow-x-auto: Permite deslizar as abas lateralmente no celular.
            - whitespace-nowrap: Impede que o texto das abas quebre em duas linhas.
            - flex: Alinha as abas em linha única.
            - no-scrollbar: Remove a barra visual (opcional).
        */}
        <div className="w-full overflow-x-auto no-scrollbar mb-4 bg-muted p-1 rounded-lg">
          <TabsList className="flex h-9 items-center justify-start bg-transparent w-max sm:w-full sm:justify-center">
            <TabsTrigger value="geral" className="min-w-[100px] whitespace-nowrap">Geral</TabsTrigger>
            
            {canAccessContabil && (
              <>
                <TabsTrigger value="contabil" className="whitespace-nowrap flex items-center">
                  <Scale className="w-4 h-4 mr-1.5" /> Contábil
                </TabsTrigger>
                <TabsTrigger value="plano_contas" className="whitespace-nowrap flex items-center">
                  <BookOpen className="w-4 h-4 mr-1.5" /> Plano de Contas
                </TabsTrigger>
                <TabsTrigger value="cr" className="whitespace-nowrap flex items-center">
                  <DollarSign className="w-4 h-4 mr-1.5" /> Receber
                </TabsTrigger>
                <TabsTrigger value="cp" className="whitespace-nowrap flex items-center">
                  <ArrowDownCircle className="w-4 h-4 mr-1.5" /> Pagar
                </TabsTrigger>
                <TabsTrigger value="contratos" className="whitespace-nowrap flex items-center">
                  <FileSignature className="w-4 h-4 mr-1.5" /> Contratos
                </TabsTrigger>
              </>
            )}
            
            {isAdmin && (
              <>
                <TabsTrigger value="stripe" className="whitespace-nowrap flex items-center">
                  <Key className="w-4 h-4 mr-1.5" /> Stripe
                </TabsTrigger>
                <TabsTrigger value="configuracao_tebelas_padrao" className="whitespace-nowrap">
                  Tabelas Padrão
                </TabsTrigger>
              </>
            )}
            
            <TabsTrigger value="usuarios" className="whitespace-nowrap flex items-center">
              <Users className="w-4 h-4 mr-1.5" /> Usuários
            </TabsTrigger>
            <TabsTrigger value="tributarias" className="whitespace-nowrap flex items-center">
              <Landmark className="w-4 h-4 mr-1.5" /> Tributárias
            </TabsTrigger>
          </TabsList>
        </div>
        
        {/* Conteúdos das Abas (Mantidos conforme sua lógica) */}
        <div className="mt-6">
            <TabsContent value="geral">
              <Card>
                <CardHeader><CardTitle>Configurações Gerais da Empresa</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    Gerencie informações básicas da empresa, como nome, endereço e dados de contato.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
            
            {canAccessContabil && (
              <>
                <TabsContent value="contabil">
                  <Card>
                    <CardHeader><CardTitle>Mapeamento de Níveis Contábeis</CardTitle></CardHeader>
                    <CardContent>
                      <FormConfiguracaoContabil proprietarioId={proprietarioId} />
                    </CardContent>
                  </Card>
                </TabsContent>
                
                <TabsContent value="plano_contas">
                  <Card>
                    <CardHeader><CardTitle>Máscara de Código Contábil</CardTitle></CardHeader>
                    <CardContent>
                      <FormConfiguracaoPlanoContas proprietarioId={proprietarioId} />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="cr">
                  <Card>
                    <CardHeader><CardTitle>Mapeamento Contábil de Contas a Receber</CardTitle></CardHeader>
                    <CardContent><FormConfiguracoesCR /></CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="cp">
                  <Card>
                    <CardHeader><CardTitle>Mapeamento Contábil de Contas a Pagar</CardTitle></CardHeader>
                    <CardContent><FormConfiguracoesCP /></CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="contratos">
                  <Card>
                    <CardHeader><CardTitle>Configurações de Contratos e Links</CardTitle></CardHeader>
                    <CardContent><FormConfiguracoesContrato /></CardContent>
                  </Card>
                </TabsContent>
              </>
            )}
            
            {isAdmin && (
              <>
                <TabsContent value="stripe">
                  <Card>
                    <CardHeader><CardTitle>Credenciais do Stripe</CardTitle></CardHeader>
                    <CardContent><FormConfiguracoesStripe /></CardContent>
                  </Card>
                </TabsContent>
                
                <TabsContent value="configuracao_tebelas_padrao">
                  <FormConfiguracaoTabelasPadrao adminId={usuario?.id || null} />
                </TabsContent>
              </>
            )}
            
            <TabsContent value="usuarios">
              <Card>
                <CardHeader><CardTitle>Gestão de Usuários e Permissões</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">Gerencie usuários, perfis de importação e regras tributárias.</p>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="tributarias">
              <Card>
                <CardHeader><CardTitle>Regras Tributárias e Calima</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">Configure mapeamentos para exportação Calima e regras tributárias.</p>
                </CardContent>
              </Card>
            </TabsContent>
        </div>
      </Tabs>
    </LayoutPrincipal>
  );
};

export default Configuracoes;