import React, { useState } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, PlusCircle } from 'lucide-react';
import FormLancamentoManual from '@/components/formularios/FormLancamentoManual';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile } from '@/types/usuario';
import LancamentosManuaisTable from '@/components/lancamentos/LancamentosManuaisTable'; // NOVO IMPORT
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const Lancamentos: React.FC = () => {
  const { role, perfil } = useSessao();
  const [refreshKey, setRefreshKey] = useState(0); // Estado para forçar a recarga da tabela

  const canAccess = role === 'Admin' || (role === 'Cliente' && (perfil as ClienteProfile)?.permissoes?.plano_contas === true);

  if (!canAccess) {
    return (
      <LayoutPrincipal>
        <Card><CardHeader><CardTitle>Acesso Negado</CardTitle></CardHeader><CardContent><p>Você não tem permissão para realizar lançamentos contábeis.</p></CardContent></Card>
      </LayoutPrincipal>
    );
  }
  
  const handleSaveComplete = () => {
    setRefreshKey(prev => prev + 1); // Força a recarga da tabela
  };

  return (
    <LayoutPrincipal>
      <h1 className="text-2xl md:text-3xl font-bold mb-6 flex items-center">
        <DollarSign className="w-6 h-6 mr-2" /> Lançamentos Contábeis
      </h1>
      
      <Tabs defaultValue="novo" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="novo">Novo Lançamento</TabsTrigger>
            <TabsTrigger value="historico">Histórico Manual</TabsTrigger>
        </TabsList>
        
        <TabsContent value="novo" className="mt-4">
            <Card className="max-w-3xl mx-auto">
                <CardHeader>
                    <CardTitle className="text-xl flex items-center">
                        <PlusCircle className="w-5 h-5 mr-2" /> Registrar Partida Dobrada
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <FormLancamentoManual onSaveComplete={handleSaveComplete} />
                </CardContent>
            </Card>
        </TabsContent>
        
        <TabsContent value="historico" className="mt-4">
            <LancamentosManuaisTable key={refreshKey} />
        </TabsContent>
      </Tabs>
    </LayoutPrincipal>
  );
};

export default Lancamentos;