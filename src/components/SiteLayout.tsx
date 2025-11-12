import React from 'react';
import SiteHeader from './SiteHeader';
import { MadeWithDyad } from './made-with-dyad';
import { Outlet } from 'react-router-dom'; // Importando Outlet

interface SiteLayoutProps {
  children?: React.ReactNode; // Tornando children opcional
}

const SiteLayout: React.FC<SiteLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen flex flex-col w-full bg-background">
      <SiteHeader />
      <main className="flex-1 w-full">
        {children || <Outlet />} {/* Renderiza children se fornecido, senão usa Outlet */}
      </main>
      <footer className="border-t bg-secondary/50 p-4 md:p-6 text-center text-sm text-muted-foreground w-full">
        <p>&copy; {new Date().getFullYear()} Fluxo de Caixa. Todos os direitos reservados.</p>
        <MadeWithDyad />
      </footer>
    </div>
  );
};

export default SiteLayout;