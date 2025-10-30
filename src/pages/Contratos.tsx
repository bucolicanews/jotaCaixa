import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlusCircle, FileSignature, Settings, Loader2, Tag, FileTextIcon } from 'lucide-react';
import { useSessao } from '@/hooks/use-sessao';
import { useState } from 'react';
import { Link } from 'react-router-dom';

const Contratos = () => {
  const { role, carregando } = useSessao();
  const [activeTab, setActiveTab] = useState('gerados');

  if (carregando) {
    return <LayoutPrincipal><div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></LayoutPrincipal>;
  }
  
  const canManageModels = role === 'Admin' || role === 'Cliente';

  return (
    <LayoutPrincipal>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl md:text-3xl font-bold flex items-center">
          <FileSignature className="w-6 h-6 mr-2" /> Gerenciamento de Contratos
        </h1>
        <div className="flex space-x-2 w-full sm:w-auto">
            <Button className="w-full sm:w-auto" disabled>
                <PlusCircle className="w-4 h-4 mr-2" />
                Novo Contrato
            </Button>
            {canManageModels && (
                <Link to="/contratos/tags">
                    <Button variant="outline" className="w-full sm:w-auto">
                        <Settings className="w-4 h-4 mr-2" />
                        Configurar
                    </Button>
                </Link>
            )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-3">
          <TabsTrigger value="gerados">Contratos Gerados</TabsTrigger>
          <TabsTrigger value="pendentes">Pendentes de Assinatura</TabsTrigger>
          {canManageModels && <TabsTrigger value="modelos">Modelos e Tags</TabsTrigger>}
        </TabsList>
        
        <TabsContent value="gerados" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-xl">Contratos Ativos</CardTitle></CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Lista de contratos gerados e seus status. (Em breve)</p>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="pendentes" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-xl">Assinaturas Pendentes</CardTitle></CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Contratos enviados para assinatura eletrônica. (Em breve)</p>
            </CardContent>
          </Card>
        </TabsContent>
        
        {canManageModels && (
            <TabsContent value="modelos" className="mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Link to="/contratos/tags">
                        <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-lg font-medium">Gerenciar Tags</CardTitle>
                                <Tag className="h-5 w-5 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-muted-foreground">Crie e edite tags dinâmicas para seus contratos.</p>
                            </CardContent>
                        </Card>
                    </Link>
                    <Link to="/contratos/modelos">
                        <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-lg font-medium">Gerenciar Modelos</CardTitle>
                                <FileTextIcon className="h-5 w-5 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-muted-foreground">Crie e edite templates de contrato.</p>
                            </CardContent>
                        </Card>
                    </Link>
                </div>
            </TabsContent>
        )}
      </Tabs>
    </LayoutPrincipal>
  );
};

export default Contratos;