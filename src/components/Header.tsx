import React, { useState, useEffect } from 'react';
import { useTheme } from '@/contexts/ThemeProvider';
import { Button } from '@/components/ui/button';
import { Sun, Moon, LogOut, Menu, User, Settings, Key, CalendarCheck, Package, DollarSign } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import MenuLateral from './MenuLateral';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useSessao } from '@/hooks/use-sessao';
import UserAvatar from './UserAvatar';
import { Link } from 'react-router-dom';
import { UsuarioProfile, ClienteProfile } from '@/types/usuario';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BASE_URL } from '@/config/app-config'; // Importando BASE_URL

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
  const [tituloApp, setTituloApp] = useState('Fluxo de Caixa');
  const [planoDetalhes, setPlanoDetalhes] = useState<{ nome: string, preco: number } | null>(null);

  useEffect(() => {
    const updateTitle = async () => {
      if (!perfil || !role) {
        setTituloApp('Fluxo de Caixa');
        return;
      }

      let currentPlanoId: string | null = null;

      if (role === 'Admin') {
        setTituloApp('Admin Dashboard');
      } else if (role === 'Cliente') {
        const clienteProfile = perfil as ClienteProfile;
        setTituloApp(clienteProfile.nome);
        currentPlanoId = clienteProfile.plano_id || null; 
      } else if (role === 'Usuario') {
        const usuarioProfile = perfil as UsuarioProfile;
        if (usuarioProfile.cliente_id) {
          // Buscar o nome da empresa (Cliente)
          const { data } = await supabase
            .from('tbl_clientes')
            .select('nome, plano_id')
            .eq('id', usuarioProfile.cliente_id)
            .single();
          
          if (data) {
            setTituloApp(data.nome);
            currentPlanoId = data.plano_id || null;
          } else {
            setTituloApp('Usuário - Sem Empresa');
          }
        } else {
          setTituloApp('Usuário Não Vinculado');
        }
      }
      
      // Buscar nome e preço do plano
      if (currentPlanoId) {
          const { data: planoData } = await supabase
              .from('planos')
              .select('nome, preco_mensal')
              .eq('id', currentPlanoId)
              .single();
          
          if (planoData) {
              setPlanoDetalhes({ nome: planoData.nome, preco: planoData.preco_mensal });
          } else {
              setPlanoDetalhes(null);
          }
      } else {
          setPlanoDetalhes(null);
      }
    };
    updateTitle();
  }, [perfil, role]);

  const lidarComSair = async () => {
    await supabase.auth.signOut();
  };
  
  const handlePasswordReset = async () => {
    if (!perfil?.email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(perfil.email, { redirectTo: `${BASE_URL}/atualizar-senha` }); // Usando BASE_URL
    if (error) console.error('Falha ao enviar email de reset:', error);
    else alert('Link de redefinição de senha enviado para seu email.');
  };
  
  const clienteProfile = perfil && 'limite_usuarios' in perfil ? perfil as ClienteProfile : null;
  const dataFimAcesso = clienteProfile?.data_fim_acesso;
  const dataFimFormatada = dataFimAcesso ? format(parseISO(dataFimAcesso), 'dd/MM/yyyy', { locale: ptBR }) : null;
  
  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

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
        
        <h1 className="text-xl font-bold text-primary truncate max-w-[200px] sm:max-w-none" title={tituloApp}>
          {tituloApp}
        </h1>
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
              
              {/* NOVO ITEM: Plano Atual */}
              {planoDetalhes && (
                  <DropdownMenuItem className="text-xs text-muted-foreground cursor-default" disabled>
                      <Package className="mr-2 h-4 w-4" />
                      Plano: {planoDetalhes.nome} ({formatCurrency(planoDetalhes.preco)})
                  </DropdownMenuItem>
              )}
              
              {/* NOVO ITEM: Data de Expiração do Acesso (Apenas para Clientes) */}
              {clienteProfile && dataFimFormatada && (
                  <DropdownMenuItem className="text-xs text-muted-foreground cursor-default" disabled>
                      <CalendarCheck className="mr-2 h-4 w-4" />
                      Expira em: {dataFimFormatada}
                  </DropdownMenuItem>
              )}
              
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/perfil">
                  <User className="mr-2 h-4 w-4" />
                  Editar Perfil
                </Link>
              </DropdownMenuItem>
              
              {/* Link para Minha Assinatura (Apenas Cliente) */}
              {role === 'Cliente' && (
                  <DropdownMenuItem asChild>
                      <Link to="/minha-assinatura">
                          <DollarSign className="mr-2 h-4 w-4" />
                          Minha Assinatura
                      </Link>
                  </DropdownMenuItem>
              )}
              
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