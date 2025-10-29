import React, { useState } from 'react';
import { useTheme } from '@/contexts/ThemeProvider';
import { Button } from '@/components/ui/button';
import { Sun, Moon, LogOut, Menu, User, Settings, Key } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import MenuLateral from './MenuLateral';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useSessao } from '@/hooks/use-sessao';
import UserAvatar from './UserAvatar';
import { Link } from 'react-router-dom'; // Importando Link

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
  const { perfil, role } = useSessao();

  const lidarComSair = async () => {
    await supabase.auth.signOut();
  };
  
  const handlePasswordReset = async () => {
    if (!perfil?.email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(perfil.email, { redirectTo: `${window.location.origin}/atualizar-senha` });
    if (error) console.error('Falha ao enviar email de reset:', error);
    else alert('Link de redefinição de senha enviado para seu email.');
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
        
        {perfil && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-8 w-8 rounded-full p-0">
                <UserAvatar profile={perfil} className="h-8 w-8" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{perfil.nome}</p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {perfil.email}
                  </p>
                  <p className="text-xs leading-none text-primary mt-1">
                    {role}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/perfil">
                  <User className="mr-2 h-4 w-4" />
                  Editar Perfil
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handlePasswordReset}>
                <Key className="mr-2 h-4 w-4" />
                Redefinir Senha
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => alert('TODO: Implementar configurações')}>
                <Settings className="mr-2 h-4 w-4" />
                Configurações
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={lidarComSair} className="text-red-500 focus:text-red-600">
                <LogOut className="mr-2 h-4 w-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
};

export default Header;