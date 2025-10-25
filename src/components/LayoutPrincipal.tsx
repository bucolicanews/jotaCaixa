import React from 'react';
import MenuLateral from './MenuLateral';
import { useSessao } from '@/hooks/use-sessao';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { ClienteProfile } from '@/types/usuario';
import { Card, CardDescription, CardHeader, CardTitle } from './ui/card';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

interface LayoutPrincipalProps {
  children: React.ReactNode;
}

const LayoutPrincipal: React.FC<LayoutPrincipalProps> = ({ children }) => {
  const { usuario, carregando, role, perfil } = useSessao();
  const navegar = useNavigate();
  const isMobile = useIsMobile();

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

  const isPendingClient = role === 'Cliente' && !(perfil as ClienteProfile)?.aprovado;

  if (isPendingClient) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <MenuLateral /> {/* Menu superior em mobile */}
        <main className="flex-1 p-8 overflow-y-auto flex items-center justify-center">
          <Card className="w-full max-w-lg text-center">
            <CardHeader>
              <CardTitle className="text-2xl">Aguardando Aprovação</CardTitle>
              <CardDescription className="mt-2">
                Sua empresa foi cadastrada e está aguardando a aprovação de um administrador. Você será notificado quando sua conta for ativada.
              </CardDescription>
            </CardHeader>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar Fixo para Desktop */}
      {!isMobile && (
        <aside className="w-64 flex-shrink-0 sticky top-0 h-screen">
          <MenuLateral />
        </aside>
      )}
      
      <div className="flex-1 flex flex-col">
        {/* Header/Menu Sanduíche para Mobile */}
        {isMobile && <MenuLateral />}
        
        <main className={cn("flex-1 overflow-y-auto", isMobile ? "p-4" : "p-8")}>
          {children}
        </main>
      </div>
    </div>
  );
};

export default LayoutPrincipal;