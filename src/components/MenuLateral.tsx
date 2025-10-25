import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { LayoutDashboard, DollarSign, ArrowUpCircle, ArrowDownCircle, Banknote, FileText, Upload, Settings, LogOut, BookOpen, Users, Building2, Clock, Contact, Menu, Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTheme } from 'next-themes';
import React, { useState } from 'react';

interface ItemMenu {
  nome: string;
  caminho: string;
  icone: React.ElementType;
  perfis: ('Admin' | 'Cliente' | 'Usuario')[];
  permissionKey?: string;
}

const itensMenu: ItemMenu[] = [
  { nome: 'Painel', caminho: '/painel', icone: LayoutDashboard, perfis: ['Admin', 'Cliente', 'Usuario'] },
  { nome: 'Ponto Eletrônico', caminho: '/ponto-eletronico', icone: Clock, perfis: ['Usuario'], permissionKey: 'ponto_eletronico' },
  { nome: 'Contas a Pagar', caminho: '/contas-pagar', icone: ArrowDownCircle, perfis: ['Admin', 'Cliente', 'Usuario'], permissionKey: 'contas_pagar' },
  { nome: 'Contas a Receber', caminho: '/contas-receber', icone: ArrowUpCircle, perfis: ['Admin', 'Cliente', 'Usuario'], permissionKey: 'contas_receber' },
  { nome: 'Clientes', caminho: '/clientes', icone: Contact, perfis: ['Admin', 'Cliente', 'Usuario'], permissionKey: 'contas_receber' },
  { nome: 'Bancos / Caixas', caminho: '/bancos', icone: Banknote, perfis: ['Admin', 'Cliente', 'Usuario'], permissionKey: 'bancos' },
  { nome: 'Plano de Contas', caminho: '/plano-contas', icone: BookOpen, perfis: ['Admin', 'Cliente', 'Usuario'], permissionKey: 'plano_contas' },
  { nome: 'Conciliação', caminho: '/conciliacao', icone: DollarSign, perfis: ['Admin', 'Cliente', 'Usuario'], permissionKey: 'conciliacao' },
  { nome: 'Importar', caminho: '/importar', icone: Upload, perfis: ['Admin', 'Cliente', 'Usuario'], permissionKey: 'importar' },
  { nome: 'Relatórios', caminho: '/relatorios', icone: FileText, perfis: ['Admin', 'Cliente', 'Usuario'], permissionKey: 'relatorios' },
  { nome: 'Gerenciar', caminho: '/gerenciar-usuarios', icone: Users, perfis: ['Admin', 'Cliente'] },
  { nome: 'Configurações', caminho: '/configuracoes', icone: Settings, perfis: ['Admin', 'Cliente', 'Usuario'], permissionKey: 'configuracoes' },
];

const ThemeToggle = () => {
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="w-full justify-start"
    >
      {isDark ? (
        <Sun className="w-5 h-5 mr-3 text-yellow-400" />
      ) : (
        <Moon className="w-5 h-5 mr-3" />
      )}
      {isDark ? 'Modo Claro' : 'Modo Escuro'}
    </Button>
  );
};

interface NavContentProps {
  onLinkClick?: () => void;
}

const NavContent: React.FC<NavContentProps> = ({ onLinkClick }) => {
  const localizacao = useLocation();
  const { role, perfil } = useSessao();

  const isUnassignedUser = role === 'Usuario' && !(perfil as UsuarioProfile)?.cliente_id;
  const isPendingClient = role === 'Cliente' && !(perfil as ClienteProfile)?.aprovado;
  const userProfile = perfil as UsuarioProfile;
  const clientProfile = perfil as ClienteProfile;

  const lidarComSair = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b">
        <h1 className="text-xl font-bold text-primary dark:text-sidebar-primary">Fluxo de Caixa</h1>
      </div>
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {isUnassignedUser && (
          <Link
            to="/cadastrar-empresa"
            onClick={onLinkClick}
            className={cn(
              "flex items-center p-3 rounded-lg transition-colors font-semibold text-primary bg-primary/10",
              "hover:bg-primary/20"
            )}
          >
            <Building2 className="w-5 h-5 mr-3" />
            Cadastrar Empresa
          </Link>
        )}
        {itensMenu.map((item) => {
          if (!role || !item.perfis.includes(role) || (isPendingClient && item.caminho !== '/painel')) {
            return null;
          }

          // Lógica de permissão para o perfil 'Cliente'
          if (role === 'Cliente' && item.permissionKey && !clientProfile.permissoes?.[item.permissionKey]) {
            return null;
          }

          // Lógica de permissão para o perfil 'Usuario'
          if (role === 'Usuario' && item.permissionKey && !userProfile.permissoes?.[item.permissionKey]) {
            return null;
          }

          const estaAtivo = localizacao.pathname === item.caminho;
          const Icone = item.icone;
          return (
            <Link
              key={item.nome}
              to={item.caminho}
              onClick={onLinkClick}
              className={cn(
                "flex items-center p-3 rounded-lg transition-colors",
                estaAtivo
                  ? "bg-accent text-accent-foreground font-semibold dark:bg-sidebar-accent dark:text-sidebar-accent-foreground"
                  : "hover:bg-accent/50 hover:text-foreground dark:hover:bg-sidebar-accent/50 dark:hover:text-sidebar-foreground",
              )}
            >
              <Icone className="w-5 h-5 mr-3" />
              {item.nome}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t space-y-2">
        <ThemeToggle />
        <Button 
          onClick={lidarComSair}
          variant="ghost" 
          className="w-full justify-start text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50"
        >
          <LogOut className="w-5 h-5 mr-3" />
          Sair
        </Button>
      </div>
    </div>
  );
};

const MenuLateral = () => {
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);

  if (isMobile) {
    return (
      <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6 justify-between">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-64">
            <NavContent onLinkClick={() => setSheetOpen(false)} />
          </SheetContent>
        </Sheet>
        <h1 className="text-xl font-bold text-primary dark:text-white">Fluxo de Caixa</h1>
        <div className="w-10"></div> {/* Placeholder para centralizar o título */}
      </header>
    );
  }

  // Desktop View
  return (
    <div className="flex flex-col h-full border-r bg-sidebar dark:bg-sidebar-background text-sidebar-foreground">
      <NavContent />
    </div>
  );
};

export default MenuLateral;