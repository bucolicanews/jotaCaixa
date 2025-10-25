import React, { useState } from 'react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Sun, Moon, LogOut, Menu } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import MenuLateral from './MenuLateral';

const ThemeToggle = () => {
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label="Alternar tema"
    >
      {isDark ? (
        <Sun className="w-5 h-5 text-yellow-400" />
      ) : (
        <Moon className="w-5 h-5" />
      )}
    </Button>
  );
};

const Header: React.FC = () => {
  const [sheetOpen, setSheetOpen] = useState(false);

  const lidarComSair = async () => {
    await supabase.auth.signOut();
  };

  return (
    <header className={cn(
      "sticky top-0 z-20 flex h-16 items-center justify-between border-b px-4 md:px-8",
      "bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
    )}>
      <div className="flex items-center space-x-4">
        {/* Menu Sanduíche */}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Abrir Menu">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-64">
            <MenuLateral onLinkClick={() => setSheetOpen(false)} />
          </SheetContent>
        </Sheet>
        
        <h1 className="text-xl font-bold text-primary">Fluxo de Caixa</h1>
      </div>
      
      <div className="flex items-center space-x-2">
        <ThemeToggle />
        <Button 
          onClick={lidarComSair}
          variant="ghost" 
          size="icon"
          className="text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50"
          aria-label="Sair"
        >
          <LogOut className="w-5 h-5" />
        </Button>
      </div>
    </header>
  );
};

export default Header;