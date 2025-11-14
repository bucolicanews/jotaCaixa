import React from 'react';
import { useSessao } from '@/hooks/use-sessao';
import { useNavigate, Outlet } from 'react-router-dom';
import { Loader2, Package, Phone } from 'lucide-react';
import { ClienteProfile } from '@/types/usuario';
import { Card, CardDescription, CardHeader, CardTitle, CardContent } from './ui/card';
import { cn } from '@/lib/utils';
import Header from './Header';
import TrialBanner from './TrialBanner';
import TrialButton from './TrialButton'; // Importando o novo componente
import { isPast, parseISO } from 'date-fns';
import { Link } from 'react-router-dom';
import { Button } from './ui/button';

interface LayoutPrincipalProps {
  // children: React.ReactNode; // Removido
}

const LayoutPrincipal: React.FC<LayoutPrincipalProps> = () => {
  const { usuario, carregando, role, perfil, refetch } = useSessao();
  const navegar = useNavigate();

  if (carregando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!usuario) {
    navegar('/login', { replace: true });
    return null;
  }

  const isClient = role === 'Cliente';
  const clienteProfile = perfil as ClienteProfile;
  
  const isPendingClient = isClient && !(clienteProfile?.aprovado);
  
  const dataFimAcesso = clienteProfile?.data_fim_acesso ? parseISO(clienteProfile.data_fim_acesso) : null;
  
  // 1. Acesso Expirado: Cliente aprovado E dataFimAcesso existe E está no passado.
  const isAccessExpired = isClient && clienteProfile?.aprovado && dataFimAcesso && isPast(dataFimAcesso);
  
  // 2. Acesso Bloqueado: Cliente aprovado E dataFimAcesso é NULL.
  const isAccessBlocked = isClient && clienteProfile?.aprovado && dataFimAcesso === null;


  if (isPendingClient) {
    return (
      <div className="flex flex-col min-h-screen w-full bg-background">
        <Header />
        <main className="flex-1 p-4 md:p-8 overflow-y-auto flex items-center justify-center w-full">
          <Card className="w-full max-w-lg text-center">
            <CardHeader>
              <CardTitle className="text-2xl">Aguardando Aprovação</CardTitle>
              <CardDescription className="mt-2">
                Sua empresa foi cadastrada e está aguardando a aprovação de um administrador. Você será notificado quando sua conta for ativada.
              </CardDescription>
            </CardHeader>
            <CardContent>
                {/* Adicionando o botão de Trial */}
                <TrialButton 
                    clienteProfile={clienteProfile} 
                    onTrialActivated={refetch} 
                />
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }
  
  if (isAccessExpired || isAccessBlocked) {
      return (
        <div className="flex flex-col min-h-screen w-full bg-background">
          <Header />
          <main className="flex-1 p-4 md:p-8 overflow-y-auto flex items-center justify-center w-full">
            <Card className="w-full max-w-lg text-center border-red-500">
              <CardHeader>
                <CardTitle className="text-2xl text-destructive">Acesso Bloqueado</CardTitle>
                <CardDescription className="mt-2">
                  {isAccessBlocked 
                    ? 'Seu acesso foi desativado pelo suporte. Entre em contato para reativar seu plano.'
                    : 'Seu período de acesso (Trial ou Plano) terminou. Para continuar utilizando o sistema, por favor, renove sua assinatura.'
                  }
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                  <Link to="/vendas">
                      <Button variant="default" className="w-full">
                          <Package className="w-4 h-4 mr-2" />
                          Renovar Assinatura
                      </Button>
                  </Link>
                  <Button variant="outline" className="w-full">
                      <Phone className="w-4 h-4 mr-2" />
                      Contatar Suporte
                  </Button>
              </CardContent>
            </Card>
          </main>
        </div>
      );
  }

  return (
    <div className="flex flex-col min-h-screen w-full bg-background">
      {/* Header Fixo no Topo */}
      <Header />
      
      {/* Banner de Trial (Aparece apenas para Clientes em Trial) */}
      <TrialBanner />
      
      {/* Conteúdo Principal (Rolável) */}
      <main className={cn("flex-1 p-4 md:p-8 w-full overflow-x-hidden")}>
        <Outlet /> {/* RENDERIZA AS ROTAS FILHAS AQUI */}
      </main>
      
      {/* TODO: Adicionar Footer aqui se necessário */}
    </div>
  );
};

export default LayoutPrincipal;