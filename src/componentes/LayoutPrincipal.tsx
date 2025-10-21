import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
import NavegacaoLateral from './NavegacaoLateral';
import { MadeWithDyad } from './made-with-dyad';

const LayoutPrincipal: React.FC = () => {
  const { usuario, carregando } = useAuth();

  if (carregando) {
    // Pode ser substituído por um Skeleton ou Spinner
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }

  if (!usuario) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="grid min-h-screen w-full md:grid-cols-[220px_1fr] lg:grid-cols-[280px_1fr]">
      <div className="hidden md:block">
        <NavegacaoLateral />
      </div>
      <div className="flex flex-col">
        <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6 overflow-auto">
          <Outlet />
        </main>
        <MadeWithDyad />
      </div>
    </div>
  );
};

export default LayoutPrincipal;