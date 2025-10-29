import LayoutPrincipal from '@/components/LayoutPrincipal';
import { useSessao } from '@/hooks/use-sessao';
import { Loader2 } from 'lucide-react';
import FormPerfil from '@/components/FormPerfil';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { showError } from '@/utils/toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import DetalheProprioPonto from '@/components/DetalheProprioPonto';
import { UsuarioProfile } from '@/types/usuario';
import { useState, useEffect } from 'react';
// import { useLocation } from 'react-router-dom'; // Removendo importação não utilizada

const Perfil = () => {
  const { perfil, role, carregando, refetch } = useSessao();
  // const location = useLocation(); // Removendo declaração não utilizada
  
  const isUsuario = role === 'Usuario';
  const podeVerPonto = isUsuario && (perfil as UsuarioProfile)?.permissoes?.visualizar_proprio_ponto;
  
  // Define a aba inicial: se puder ver o ponto, começa em 'ponto', senão em 'dados'
  const initialTab = podeVerPonto ? 'ponto' : 'dados';
  const [activeTab, setActiveTab] = useState(initialTab);

  // Se o usuário não puder ver o ponto, garante que ele não fique preso na aba 'ponto'
  useEffect(() => {
    if (!podeVerPonto && activeTab === 'ponto') {
        setActiveTab('dados');
    }
  }, [podeVerPonto, activeTab]);


  if (carregando) {
    return (
      <LayoutPrincipal>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </LayoutPrincipal>
    );
  }

  if (!perfil || !role) {
    showError('Não foi possível carregar os dados do perfil.');
    return <LayoutPrincipal><Card><CardHeader><CardTitle>Erro</CardTitle></CardHeader><CardContent>Perfil não encontrado.</CardContent></Card></LayoutPrincipal>;
  }
  
  return (
    <LayoutPrincipal>
      <h1 className="text-2xl md:text-3xl font-bold mb-6">Meu Perfil</h1>
      <div className="max-w-4xl mx-auto"> 
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 md:grid-cols-3">
                <TabsTrigger value="dados">Dados Pessoais</TabsTrigger>
                {podeVerPonto && <TabsTrigger value="ponto">Meu Ponto</TabsTrigger>}
                <TabsTrigger value="config">Configurações</TabsTrigger>
            </TabsList>
            
            <TabsContent value="dados" className="mt-4">
                <FormPerfil 
                    perfil={perfil} 
                    role={role} 
                    onSaveComplete={refetch} 
                />
            </TabsContent>
            
            {podeVerPonto && (
                <TabsContent value="ponto" className="mt-4">
                    <DetalheProprioPonto />
                </TabsContent>
            )}
            
            <TabsContent value="config" className="mt-4">
                <Card>
                    <CardHeader><CardTitle>Configurações da Conta</CardTitle></CardHeader>
                    <CardContent>
                        <p className="text-muted-foreground">Em breve: Opções de notificação e segurança.</p>
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>
      </div>
    </LayoutPrincipal>
  );
};

export default Perfil;