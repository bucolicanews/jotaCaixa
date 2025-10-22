import React from 'react';
import MenuLateral from './MenuLateral';
import { useSessao } from '@/hooks/use-sessao';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { ClienteProfile } from '@/types/usuario';
import { Card, CardDescription, CardHeader, CardTitle } from './ui/card';

interface LayoutPrincipalProps {
  children: React.ReactNode;
}

const LayoutPrincipal: React.FC<LayoutPrincipalProps> = ({ children }) => {
  const { usuario, carregando, role, perfil } = useSessao();
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

  const isPendingClient = role === 'Cliente' && !(perfil as ClienteProfile)?.aprovado;

  if (isPendingClient) {
    return (
      <div className="flex min-h-screen bg-background">
        <aside className="w-64 flex-shrink-0">
          <MenuLateral />
        </aside>
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
      <aside className="w-64 flex-shrink-0">
        <MenuLateral />
      </aside>
      <main className="flex-1 p-8 overflow-y-auto">
        {children}
      </main>
    </div>
  );
};

export default LayoutPrincipal;