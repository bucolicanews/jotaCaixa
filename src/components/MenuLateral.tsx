import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { LayoutDashboard, DollarSign, ArrowUpCircle, ArrowDownCircle, Banknote, FileText, Upload, Settings, BookOpen, Users, Building2, Clock, Contact, CalendarCheck, User, FileSignature, Tag, FileTextIcon, Package, History, FileDown, MessageSquare, Loader2, Scale, TrendingUp, Eye, Check, BarChart3 } from 'lucide-react';
import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile, UsuarioProfile, AdminProfile, AdminUsuarioProfile } from '@/types/usuario';
import { format, parseISO, isPast } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useTicketNotifications } from '@/hooks/use-ticket-notifications';
import { useOwnerBranding } from '@/hooks/use-owner-branding';
import { useTheme } from '@/contexts/ThemeProvider';

interface ItemMenu {
  nome: string;
  caminho: string;
  icone: React.ElementType;
  perfis: ('Admin' | 'Cliente' | 'UsuarioDoAdmin' | 'UsuarioDoCliente')[]; // TIPAGEM ATUALIZADA
  permissionKey?: string;
}

interface MenuSection {
    titulo: string;
    itens: ItemMenu[];
    perfis: ('Admin' | 'Cliente' | 'UsuarioDoAdmin' | 'UsuarioDoCliente')[]; // TIPAGEM ATUALIZADA
}

const SECOES_MENU: MenuSection[] = [
    {
        titulo: 'Geral',
        perfis: ['Admin', 'Cliente', 'UsuarioDoAdmin', 'UsuarioDoCliente'],
        itens: [
            { nome: 'Painel', caminho: '/painel', icone: LayoutDashboard, perfis: ['Admin', 'Cliente', 'UsuarioDoAdmin', 'UsuarioDoCliente'] },
        ]
    },
    {
        titulo: 'Ponto Eletrônico',
        perfis: ['Admin', 'Cliente', 'UsuarioDoAdmin', 'UsuarioDoCliente'],
        itens: [
            { nome: 'Bater Ponto', caminho: '/ponto-eletronico', icone: Clock, perfis: ['UsuarioDoAdmin', 'UsuarioDoCliente'], permissionKey: 'ponto_eletronico' },
            { nome: 'Meu Ponto', caminho: '/folha-ponto?mode=self', icone: User, perfis: ['UsuarioDoAdmin', 'UsuarioDoCliente'], permissionKey: 'visualizar_proprio_ponto' },
            { nome: 'Acompanhar Ponto', caminho: '/folha-ponto', icone: CalendarCheck, perfis: ['Admin', 'Cliente', 'UsuarioDoAdmin'], permissionKey: 'folha_ponto' },
        ]
    },
    {
        titulo: 'Financeiro',
        perfis: ['Admin', 'Cliente', 'UsuarioDoAdmin', 'UsuarioDoCliente'],
        itens: [
            { nome: 'Contas a Pagar', caminho: '/contas-pagar', icone: ArrowDownCircle, perfis: ['Admin', 'Cliente', 'UsuarioDoAdmin', 'UsuarioDoCliente'], permissionKey: 'contas_pagar' },
            { nome: 'Contas a Receber', caminho: '/contas-receber', icone: ArrowUpCircle, perfis: ['Admin', 'Cliente', 'UsuarioDoAdmin', 'UsuarioDoCliente'], permissionKey: 'contas_receber' },
            { nome: 'Fluxo de Caixa', caminho: '/relatorios/fluxo-caixa', icone: TrendingUp, perfis: ['Admin', 'Cliente', 'UsuarioDoAdmin', 'UsuarioDoCliente'], permissionKey: 'bancos' },
        ]
    },
    {
        titulo: 'Banco',
        perfis: ['Admin', 'Cliente', 'UsuarioDoAdmin', 'UsuarioDoCliente'],
        itens: [
            { nome: 'Bancos / Caixas', caminho: '/bancos', icone: Banknote, perfis: ['Admin', 'Cliente', 'UsuarioDoAdmin', 'UsuarioDoCliente'], permissionKey: 'bancos' },
            { nome: 'Conciliação', caminho: '/conciliacao', icone: Check, perfis: ['Admin', 'Cliente', 'UsuarioDoAdmin', 'UsuarioDoCliente'], permissionKey: 'conciliacao' },
            { nome: 'Extratos Salvos', caminho: '/extratos', icone: Eye, perfis: ['Admin', 'Cliente', 'UsuarioDoAdmin', 'UsuarioDoCliente'], permissionKey: 'bancos' },
        ]
    },
    {
        titulo: 'Lançamentos',
        perfis: ['Admin', 'Cliente', 'UsuarioDoAdmin', 'UsuarioDoCliente'],
        itens: [
            { nome: 'Novo Lançamento', caminho: '/lancamentos', icone: DollarSign, perfis: ['Admin', 'Cliente', 'UsuarioDoAdmin', 'UsuarioDoCliente'], permissionKey: 'plano_contas' },
        ]
    },
    {
        titulo: 'Contabilidade',
        perfis: ['Admin', 'Cliente', 'UsuarioDoAdmin', 'UsuarioDoCliente'],
        itens: [
            { nome: 'Plano de Contas', caminho: '/plano-contas', icone: BookOpen, perfis: ['Admin', 'Cliente', 'UsuarioDoAdmin', 'UsuarioDoCliente'], permissionKey: 'plano_contas' },
            { nome: 'Contas Patrimoniais', caminho: '/contas-patrimoniais', icone: Scale, perfis: ['Admin', 'Cliente', 'UsuarioDoAdmin', 'UsuarioDoCliente'], permissionKey: 'bancos' },
            { nome: 'Balanço Patrimonial', caminho: '/relatorios/balanco', icone: Scale, perfis: ['Admin', 'Cliente', 'UsuarioDoAdmin', 'UsuarioDoCliente'], permissionKey: 'relatorios' },
            { nome: 'DRE', caminho: '/relatorios/dre', icone: BarChart3, perfis: ['Admin', 'Cliente', 'UsuarioDoAdmin', 'UsuarioDoCliente'], permissionKey: 'relatorios' },
            { nome: 'Balancete', caminho: '/relatorios/balancete', icone: FileTextIcon, perfis: ['Admin', 'Cliente', 'UsuarioDoAdmin', 'UsuarioDoCliente'], permissionKey: 'relatorios' },
            { nome: 'Razão', caminho: '/relatorios/razao', icone: BookOpen, perfis: ['Admin', 'Cliente', 'UsuarioDoAdmin', 'UsuarioDoCliente'], permissionKey: 'relatorios' },
            { nome: 'Gerenciar Históricos', caminho: '/historicos', icone: History, perfis: ['Admin', 'Cliente', 'UsuarioDoAdmin', 'UsuarioDoCliente'], permissionKey: 'configuracoes' },
        ]
    },
    {
        titulo: 'Contratos',
        perfis: ['Admin', 'Cliente', 'UsuarioDoAdmin', 'UsuarioDoCliente'],
        itens: [
            { nome: 'Gerenciar Contratos', caminho: '/contratos', icone: FileSignature, perfis: ['Admin', 'Cliente', 'UsuarioDoAdmin', 'UsuarioDoCliente'], permissionKey: 'contratos' },
            { nome: 'Cadastrar Tags', caminho: '/contratos/tags', icone: Tag, perfis: ['Admin', 'Cliente', 'UsuarioDoAdmin', 'UsuarioDoCliente'], permissionKey: 'contratos' },
            { nome: 'Cadastrar Modelos', caminho: '/contratos/modelos', icone: FileTextIcon, perfis: ['Admin', 'Cliente', 'UsuarioDoAdmin', 'UsuarioDoCliente'], permissionKey: 'contratos' },
        ]
    },
    {
        titulo: 'Documentos Societários',
        perfis: ['Admin', 'Cliente', 'UsuarioDoAdmin', 'UsuarioDoCliente'],
        itens: [
            { nome: 'Documentos Gerados', caminho: '/documentos-societarios', icone: FileText, perfis: ['Admin', 'Cliente', 'UsuarioDoAdmin', 'UsuarioDoCliente'], permissionKey: 'contratos' },
            { nome: 'Gerenciar Modelos', caminho: '/documentos-societarios/modelos', icone: FileTextIcon, perfis: ['Admin', 'Cliente', 'UsuarioDoAdmin', 'UsuarioDoCliente'], permissionKey: 'contratos' },
            { nome: 'Gerenciar Blocos', caminho: '/documentos-societarios/blocos', icone: Tag, perfis: ['Admin', 'Cliente', 'UsuarioDoAdmin', 'UsuarioDoCliente'], permissionKey: 'contratos' },
        ]
    },
    {
        titulo: 'Suporte',
        perfis: ['Admin', 'Cliente', 'UsuarioDoAdmin', 'UsuarioDoCliente'],
        itens: [
            { nome: 'Meus Tickets', caminho: '/suporte', icone: MessageSquare, perfis: ['Cliente', 'UsuarioDoCliente'] },
            { nome: 'Gestão de Tickets', caminho: '/admin/suporte', icone: MessageSquare, perfis: ['Admin', 'UsuarioDoAdmin'], permissionKey: 'gestao_suporte' },
        ]
    },
    {
        titulo: 'Administração',
        perfis: ['Admin', 'Cliente', 'UsuarioDoAdmin', 'UsuarioDoCliente'],
        itens: [
            { nome: 'Minha Assinatura', caminho: '/minha-assinatura', icone: DollarSign, perfis: ['Cliente'] },
            { nome: 'Clientes', caminho: '/clientes', icone: Building2, perfis: ['Admin', 'Cliente', 'UsuarioDoAdmin'], permissionKey: 'contas_receber' },
            { nome: 'Gerenciar Usuários', caminho: '/gerenciar-usuarios', icone: Users, perfis: ['Admin', 'Cliente', 'UsuarioDoAdmin'], permissionKey: 'cadastrar_usuarios' },
            { nome: 'Gerenciar Planos', caminho: '/planos', icone: Package, perfis: ['Admin', 'UsuarioDoAdmin'] }, 
            { nome: 'Relatórios', caminho: '/relatorios', icone: FileText, perfis: ['Admin', 'Cliente', 'UsuarioDoAdmin', 'UsuarioDoCliente'], permissionKey: 'relatorios' },
            { nome: 'Importar Dados', caminho: '/importar', icone: Upload, perfis: ['Admin', 'Cliente', 'UsuarioDoAdmin', 'UsuarioDoCliente'], permissionKey: 'importar' },
            { nome: 'Exportar Dados', caminho: '/exportar', icone: FileDown, perfis: ['Admin', 'Cliente', 'UsuarioDoAdmin', 'UsuarioDoCliente'], permissionKey: 'relatorios' },
            { nome: 'Configurações', caminho: '/configuracoes', icone: Settings, perfis: ['Admin', 'Cliente', 'UsuarioDoAdmin', 'UsuarioDoCliente'], permissionKey: 'configuracoes' },
        ]
    }
];

interface MenuLateralProps {
  onLinkClick?: () => void;
  adminBranding: { logoUrl: string | null, nome: string | null } | null;
  loadingBranding: boolean;
}

const MenuLateral: React.FC<MenuLateralProps> = ({ onLinkClick, adminBranding, loadingBranding }) => {
  const localizacao = useLocation();
  const { role, perfil, carregando } = useSessao();
  
  // --- Definições seguras de perfil e roles ---
  const isAdmin = role === 'Admin';
  const isClient = role === 'Cliente';
  const isUsuarioDoAdminRole = role === 'UsuarioDoAdmin';
  const isUsuarioDoClienteRole = role === 'UsuarioDoCliente';
  
  const clientProfile = isClient ? perfil as ClienteProfile : null;
  const userProfile = (isUsuarioDoClienteRole || isUsuarioDoAdminRole) ? perfil as UsuarioProfile | AdminUsuarioProfile : null;
  
  const isUnassignedUser = isUsuarioDoClienteRole && userProfile && !userProfile.cliente_id;
  const isPendingClient = isClient && clientProfile && !clientProfile.aprovado;
  
  const isAccessExpired = isClient && clientProfile?.data_fim_acesso && isPast(parseISO(clientProfile.data_fim_acesso));
  
  const getPermissoes = useCallback(() => {
      if (isAdmin) return {}; // Admin tem acesso total
      
      // Perfis que possuem o campo 'permissoes'
      if (clientProfile) return clientProfile.permissoes || {};
      if (userProfile && 'permissoes' in userProfile) return userProfile.permissoes || {};
      
      return {};
  }, [isAdmin, clientProfile, userProfile]);
  
  const userPermissions = getPermissoes();
  // -----------------------------------------------
  
  const isPreAuthFlow = localizacao.pathname === '/selecao-perfil';
  
  // Lógica para a URL da Logo e Título
  let finalLogoUrl = adminBranding?.logoUrl;
  let textTitle = adminBranding?.nome || 'Fluxo de Caixa';
  let profileDescription = '';
  
  // LÓGICA DE DESCRIÇÃO AJUSTADA
  if (isAdmin) {
      profileDescription = 'Administrador do Sistema';
  } else if (isUsuarioDoAdminRole) {
      profileDescription = 'Usuário Administrativo';
  } else if (isClient) {
      profileDescription = 'Cliente Principal';
  } else if (isUsuarioDoClienteRole) {
      profileDescription = `Funcionário: ${perfil?.nome || 'N/A'}`;
  } else if (perfil?.nome) {
      profileDescription = perfil.nome;
  }
  
  const shouldShowSuporte = isAdmin || isClient || isUsuarioDoAdminRole || isUsuarioDoClienteRole;
  const { mensagensParaResponder } = useTicketNotifications();


  const checkPermission = (item: ItemMenu) => {
    if (!role || !item.perfis.includes(role as any)) return false;

    if (isAccessExpired) {
        return item.caminho === '/painel' || item.caminho === '/minha-assinatura';
    }

    if (isPreAuthFlow) {
        return item.caminho === '/painel';
    }

    // 1. Admin tem acesso total
    if (isAdmin) {
        return true;
    }

    // 2. Usuário do Admin, Cliente, Usuário do Cliente: Verifica a permissão explícita
    if (item.permissionKey) {
        // Se a chave de permissão existir e for true no perfil, permite o acesso
        return userPermissions[item.permissionKey] === true;
    }
    
    // 3. Itens sem permissionKey (ex: Minha Assinatura, Suporte)
    return true;
  };

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      <div className="p-4 border-b flex flex-col items-center justify-center space-y-2">
        {loadingBranding && carregando ? (
            <div data-dyad-id="src\components\MenuLateral.tsx:217:12" data-dyad-name="h1" className="h-16 flex items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
            <>
                {finalLogoUrl ? (
                    <img 
                        src={finalLogoUrl} 
                        alt={textTitle} 
                        className="object-contain max-h-16 w-auto" 
                        style={{ maxWidth: '100%' }}
                    />
                ) : (
                    <Building2 className="w-10 h-10 text-primary" />
                )}
                <h1 data-dyad-id="src\components\MenuLateral.tsx:217:12" data-dyad-name="h1" className="text-xl font-bold text-foreground text-center">
                    {textTitle}
                </h1>
                <p className="text-sm text-muted-foreground text-center">
                    {profileDescription}
                </p>
            </>
        )}
      </div>
      <nav className="flex-1 p-2 space-y-4 overflow-y-auto">
        {/* Item de Cadastro de Empresa (Visível apenas para Usuário não vinculado) */}
        {isUnassignedUser && (
          <Link
            to="/cadastrar-empresa"
            onClick={onLinkClick}
            className={cn(
              "flex items-center p-3 rounded-lg transition-colors font-semibold text-primary bg-primary/10",
              localizacao.pathname === '/cadastrar-empresa' ? "bg-accent text-accent-foreground" : "hover:bg-primary/20"
            )}
          >
            <Building2 className="w-5 h-5 mr-3" />
            Cadastrar Empresa
          </Link>
        )}
        
        {SECOES_MENU.map(secao => {
            if (!role || !secao.perfis.includes(role as any)) return null;
            
            if (secao.titulo === 'Suporte' && !shouldShowSuporte) {
                return null;
            }
            
            const itensVisiveis = secao.itens.filter(item => 
                item.perfis.includes(role as any) && 
                checkPermission(item)
            );

            if (itensVisiveis.length === 0) return null;

            return (
                <div key={secao.titulo} className="space-y-1">
                    <h3 className="text-sm font-semibold text-muted-foreground px-3 pt-2">{secao.titulo}</h3>
                    {itensVisiveis.map((item) => {
                        const estaAtivo = localizacao.pathname === item.caminho || localizacao.pathname + localizacao.search === item.caminho;
                        const Icone = item.icone;
                        
                        const isDisabled = isAccessExpired && item.caminho !== '/painel' && item.caminho !== '/minha-assinatura';
                        
                        // Lógica de Notificação para Suporte
                        let notificationBadge = null;
                        const isSuporteItem = item.caminho === '/suporte' || item.caminho === '/admin/suporte';
                        
                        if (isSuporteItem && mensagensParaResponder > 0) {
                            // Se for Cliente/UsuarioDoCliente, mostra no /suporte
                            if (item.caminho === '/suporte' && (isClient || isUsuarioDoClienteRole)) {
                                notificationBadge = (
                                    <span className="ml-auto h-5 w-5 rounded-full bg-red-500 flex items-center justify-center text-white text-xs font-bold">
                                        {mensagensParaResponder > 9 ? '9+' : mensagensParaResponder}
                                    </span>
                                );
                            }
                            // Se for Admin/UsuarioDoAdmin, mostra no /admin/suporte
                            if (item.caminho === '/admin/suporte' && (isAdmin || isUsuarioDoAdminRole)) {
                                notificationBadge = (
                                    <span className="ml-auto h-5 w-5 rounded-full bg-red-500 flex items-center justify-center text-white text-xs font-bold">
                                        {mensagensParaResponder > 9 ? '9+' : mensagensParaResponder}
                                    </span>
                                );
                            }
                        }

                        return (
                            <Link
                                key={item.nome}
                                to={isDisabled ? localizacao.pathname : item.caminho}
                                onClick={isDisabled ? (e) => e.preventDefault() : onLinkClick}
                                className={cn(
                                    "flex items-center p-3 rounded-lg transition-colors",
                                    estaAtivo
                                        ? "bg-accent text-accent-foreground font-semibold"
                                        : "hover:bg-accent/50 hover:text-foreground",
                                    isDisabled && "opacity-50 cursor-not-allowed hover:bg-transparent hover:text-foreground"
                                )}
                                title={isDisabled ? "Acesso expirado. Renove seu plano." : item.nome}
                            >
                                <Icone className="w-5 h-5 mr-3" />
                                {item.nome}
                                {notificationBadge}
                            </Link>
                        );
                    })}
                </div>
            );
        })}
      </nav>
    </div>
  );
};

export default MenuLateral;