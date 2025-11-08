import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Menu, Zap, LogIn } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { name: 'Início', href: '/' },
  { name: 'Sistema', href: '/#sistema' },
  { name: 'Preços', href: '/vendas' },
  { name: 'Suporte', href: '/#suporte' },
  { name: 'Sobre Nós', href: '/#sobre' },
];

const SiteHeader: React.FC = () => {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <header className={cn(
      "sticky top-0 z-30 flex h-16 items-center justify-between border-b px-4 md:px-8",
      "bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
    )}>
      <div className="flex items-center space-x-4">
        <Link to="/" className="flex items-center text-xl font-bold text-primary">
          <Zap className="h-6 w-6 mr-2" /> Fluxo de Caixa
        </Link>
      </div>
      
      {/* Navegação Desktop */}
      <nav className="hidden md:flex items-center space-x-6">
        {NAV_ITEMS.map(item => (
          <Link 
            key={item.name} 
            to={item.href} 
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {item.name}
          </Link>
        ))}
      </nav>
      
      <div className="flex items-center space-x-2">
        <Link to="/login">
          <Button variant="default" size="sm">
            <LogIn className="w-4 h-4 mr-2" /> Login
          </Button>
        </Link>
        
        {/* Menu Mobile */}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild className="md:hidden">
            <Button variant="ghost" size="icon" aria-label="Abrir Menu">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="p-4 w-64">
            <nav className="flex flex-col space-y-4 pt-8">
              {NAV_ITEMS.map(item => (
                <Link 
                  key={item.name} 
                  to={item.href} 
                  onClick={() => setSheetOpen(false)}
                  className="text-lg font-medium text-foreground hover:text-primary transition-colors"
                >
                  {item.name}
                </Link>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
};

export default SiteHeader;