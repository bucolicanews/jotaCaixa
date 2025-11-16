import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from '@/contexts/ThemeProvider';
import { Button } from '@/components/ui/button';
import { Sun, Moon, LogOut, Menu, User, Settings, Key, CalendarCheck, Package, DollarSign, MessageSquare, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import MenuLateral from './MenuLateral';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useSessao } from '@/hooks/use-sessao';
import UserAvatar from './UserAvatar';
import { Link } from 'react-router-dom';
import { UsuarioProfile, ClienteProfile, AdminProfile, AdminUsuarioProfile } from '@/types/usuario';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BASE_URL } from '@/config/app-config';
import { useTicketNotifications } from '@/hooks/use-ticket-notifications';

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
  const { perfil, role, usuario } = useSessao();
  const [planoDetalhes, setPlanoDetalhes] = useState<{ nome: string, preco: number } | null>(null);
  const [adminBranding, setAdminBranding] = useState<{ logoUrl: string | null, nome: string | null } | null>(null);
  const [loadingBranding, setLoadingBranding] = useState(true);
  
  // NOVO: Hook de Notificações (usando mensagensParaResponder)
  const { mensagensParaResponder, carregando: carregandoNotificacoes } = useTicketNotifications();

  const isClient = role === 'Cliente';
  const isAdmin = role === 'Admin';
  const clienteProfile = perfil as ClienteProfile;
  const userProfile = perfil as UsuarioProfile | AdminUsuarioProfile;
  
  const isUserOfAdmin = role === 'Usuario' && 'admin_id' in userProfile && !!userProfile.admin_id;
  
  // Determina o ID do Admin para buscar o branding
  const targetAdminId = isAdmin ? perfil?.id : (isUserOfAdmin ? (perfil as AdminUsuarioProfile).admin_id : null);

  const fetchAdminBranding = useCallback(async () => {
      if (!targetAdminId) {
          setLoadingBranding(false);
          setAdminBranding(null);
          return;
      }
      
      setLoadingBranding(true);
      
      // Busca o perfil do Admin (que contém logo_url e nome)
      const { data, error } = await supabase
          .from('tbl_admins')
          .select('nome, logo_url')
          .eq('id', targetAdminId)
          .single();
          
      if (error) {
          console.error('Erro ao buscar branding do Admin:', error);
          setAdminBranding(null);
      } else {
          setAdminBranding({ logoUrl: data.logo_url, nome: data.nome });
      }
      setLoadingBranding(false);
  }, [targetAdminId]);

  useEffect(() => {
      fetchAdminBranding();
  }, [fetchAdminBranding]);


  useEffect(() => {
    const updatePlanoDetails = async () => {
      if (!perfil || !role) {
        setPlanoDetalhes(null);
        return;
      }
      
      let currentPlanoId: string | null = null;

      if (isClient) {
        currentPlanoId = clienteProfile.plano_id || null; 
      } else if (role === 'Usuario' && userProfile.cliente_id) {
        // Funcionário de Cliente: Busca o plano do Cliente
        const proprietarioId = userProfile.cliente_id;
        const { data: clienteData } = await supabase
            .from('tbl_clientes')
            .select('plano_id')
            .eq('id', proprietarioId)
            .single();
            
        currentPlanoId = clienteData?.plano_id || null;
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
    
    updatePlanoDetails();
  }, [perfil, role, isClient, clienteProfile, userProfile]);


  const lidarComSair = async () => {
    await supabase.auth.signOut();
  };
  
  const handlePasswordReset = async () => {
    if (!perfil?.email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(perfil.email, { redirectTo: `${BASE_URL}/atualizar-senha` });
    if (error) console.error('Falha ao enviar email de reset:', error);
    else alert('Link de redefinição de senha enviado para seu email.');
  };
  
  const dataFimAcesso = clienteProfile?.data_fim_acesso;
  const dataFimFormatada = dataFimAcesso ? format(parseISO(dataFimAcesso), 'dd/MM/yyyy', { locale: ptBR }) : null;
  
  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  
  // Lógica para o Título Principal
  const clientLogoUrl = isClient ? clienteProfile?.logo_url : null;
  
  // Se for funcionário do Admin, usa o branding do Admin
  const finalLogoUrl = isUserOfAdmin ? adminBranding?.logoUrl : clientLogoUrl || adminBranding?.logoUrl;
  
  let textTitle = 'Fluxo de Caixa';
  
  if (isClient) {
      // Cliente: Nome da Empresa
      textTitle = clienteProfile?.nome || 'Minha Empresa';
  } else if (isAdmin || role === 'Usuario') {
      // Admin ou Usuário: Nome do Usuário Logado
      textTitle = perfil?.nome || 'Administrador';
  }


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
            <MenuLateral 
                onLinkClick={() => setSheetOpen(false)} 
                adminBranding={adminBranding} // PASSANDO O BRANDING
                loadingBranding={loadingBranding} // PASSANDO O LOADING
            />
          </SheetContent>
        </Sheet>
        
        {/* Título Principal (Logo ou Nome) */}
        <h1 
            data-dyad-id="src\components\Header.tsx:197:8" 
            data-dyad-name="h1" 
            className="text-xl font-bold text-primary truncate max-w-[200px] sm:max-w-none" 
            title={textTitle}
        >
            {loadingBranding ? (
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
            ) : finalLogoUrl ? (
                <img 
                    src={finalLogoUrl} 
                    alt={textTitle} 
                    className="h-8 w-auto object-contain" 
                    style={{ maxWidth: '100%' }}
                />
            ) : (
                // Exibe o nome do Admin Proprietário em texto-primary (amarelo/laranja)
                <span className="text-primary">
                    {textTitle}
                </span>
            )}
        </h1>
      </div>
      
      <div className="flex items-center space-x-2">
        <ThemeToggle />
        
        {perfil && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-8 w-8 rounded-full p-0">
                <UserAvatar profile={perfil} className="h-8 w-8" />
                {/* Indicador de Notificação */}
                {mensagensParaResponder > 0 && !carregandoNotificacoes && (
                    <span className="absolute top-0 right-0 h-3 w-3 rounded-full bg-red-500 border-2 border-background flex items-center justify-center text-white text-[8px] font-bold">
                        {mensagensParaResponder > 9 ? '9+' : mensagensParaResponder}
                    </span>
                )}
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
              
              {/* NOVO ITEM: Notificações de Suporte */}
              {mensagensParaResponder > 0 && (
                  <DropdownMenuItem asChild className="bg-red-500/10 text-red-600 font-semibold">
                      <Link to={role === 'Admin' ? '/admin/suporte' : '/suporte'}>
                          <MessageSquare className="mr-2 h-4 w-4" />
                          {mensagensParaResponder} Tickets para Responder
                      </Link>
                  </DropdownMenuItem>
              )}
              
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