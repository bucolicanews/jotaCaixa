import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlusCircle, FileSignature, Settings, Loader2 } from 'lucide-react';
import { useSessao } from '@/hooks/use-sessao';
import { useState } from 'react';

const Contratos = () => {
  const { role, carregando } = useSessao();
  const [activeTab, setActiveTab] = useState('gerados');

  if (carregando) {
    return <LayoutPrincipal><div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></LayoutPrincipal>;
  }
  
  const canManageModels = role === 'Admin'; // Apenas Admin gerencia tags e modelos

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
                <Button variant="outline" className="w-full sm:w-auto" disabled>
                    <Settings className="w-4 h-4 mr-2" />
                    Modelos/Tags
                </Button>
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
                <Card>
                    <CardHeader><CardTitle className="text-xl">Modelos e Tags</CardTitle></CardHeader>
                    <CardContent>
                        <p className="text-muted-foreground">Gerenciamento de tags dinâmicas e templates de contrato. (Em breve)</p>
                    </CardContent>
                </Card>
            </TabsContent>
        )}
      </Tabs>
    </LayoutPrincipal>
  );
};

export default Contratos;