import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { LayoutDashboard, DollarSign, ArrowUpCircle, ArrowDownCircle, Banknote, FileText, Upload, Settings, BookOpen, Users, Building2, Clock, Contact, CalendarCheck, User, FileSignature, Tag, FileTextIcon, Package, History, FileDown, MessageSquare, Scale, Loader2 } from 'lucide-react';
import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile, UsuarioProfile, AdminProfile, AdminUsuarioProfile } from '@/types/usuario';
import { isPast, parseISO } from 'date-fns';
import { useTicketNotifications } from '@/hooks/use-ticket-notifications';
import { supabase } from '@/integrations/supabase/client'; // Importando supabase

interface ItemMenu {
  nome: string;
  caminho: string;
  icone: React.ElementType;
  perfis: ('Admin' | 'Cliente' | 'Usuario')[];
  permissionKey?: string;
}

interface MenuSection {
    titulo: string;
    itens: ItemMenu[];
    perfis: ('Admin' | 'Cliente' | 'Usuario')[];
}

const SECOES_MENU: MenuSection[] = [
    {
        titulo: 'Geral',
        perfis: ['Admin', 'Cliente', 'Usuario'],
        itens: [
            { nome: 'Painel', caminho: '/painel', icone: LayoutDashboard, perfis: ['Admin', 'Cliente', 'Usuario'] },
        ]
    },
    {
        titulo: 'Ponto Eletrônico',
        perfis: ['Admin', 'Cliente', 'Usuario'],
        itens: [
            { nome: 'Bater Ponto', caminho: '/ponto-eletronico', icone: Clock, perfis: ['Usuario'], permissionKey: 'ponto_eletronico' },
            // CORREÇÃO AQUI: Mudar para /folha-ponto com parâmetro de modo
            { nome: 'Meu Ponto', caminho: '/folha-ponto?mode=self', icone: User, perfis: ['Usuario'], permissionKey: 'visualizar_proprio_ponto' },
            { nome: 'Acompanhar Ponto', caminho: '/folha-ponto', icone: CalendarCheck, perfis: ['Admin', 'Cliente'], permissionKey: 'folha_ponto' },
        ]
    },
    {
        titulo: 'Financeiro',
        perfis: ['Admin', 'Cliente', 'Usuario'],
        itens: [
            // Admin agora tem acesso a estes módulos para gerenciar seus próprios lançamentos
            { nome: 'Contas a Pagar', caminho: '/contas-pagar', icone: ArrowDownCircle, perfis: ['Admin', 'Cliente', 'Usuario'], permissionKey: 'contas_pagar' },
            { nome: 'Contas a Receber', caminho: '/contas-receber', icone: ArrowUpCircle, perfis: ['Admin', 'Cliente', 'Usuario'], permissionKey: 'contas_receber' },
            { nome: 'Contas e Saldos', caminho: '/bancos', icone: Banknote, perfis: ['Admin', 'Cliente', 'Usuario'], permissionKey: 'bancos' },
            { nome: 'Contas Patrimoniais', caminho: '/contas-patrimoniais', icone: Scale, perfis: ['Admin', 'Cliente', 'Usuario'], permissionKey: 'bancos' },
            { nome: 'Conciliação', caminho: '/conciliacao', icone: DollarSign, perfis: ['Admin', 'Cliente', 'Usuario'], permissionKey: 'conciliacao' },
        ]
    },
    {
        titulo: 'Contratos',
        perfis: ['Admin', 'Cliente'],
        itens: [
            { nome: 'Gerenciar Contratos', caminho: '/contratos', icone: FileSignature, perfis: ['Admin', 'Cliente'], permissionKey: 'contratos' },
            { nome: 'Cadastrar Tags', caminho: '/contratos/tags', icone: Tag, perfis: ['Admin', 'Cliente'], permissionKey: 'contratos' },
            { nome: 'Cadastrar Modelos', caminho: '/contratos/modelos', icone: FileTextIcon, perfis: ['Admin', 'Cliente'], permissionKey: 'contratos' },
        ]
    },
    {
        titulo: 'Documentos Societários',
        perfis: ['Admin', 'Cliente'],
        itens: [
            { nome: 'Documentos Gerados', caminho: '/documentos-societarios', icone: FileText, perfis: ['Admin', 'Cliente'], permissionKey: 'contratos' },
            { nome: 'Gerenciar Modelos', caminho: '/documentos-societarios/modelos', icone: FileTextIcon, perfis: ['Admin', 'Cliente'], permissionKey: 'contratos' },
            { nome: 'Gerenciar Blocos', caminho: '/documentos-societarios/blocos', icone: Tag, perfis: ['Admin', 'Cliente'], permissionKey: 'contratos' },
        ]
    },
    {
        titulo: 'Suporte', // NOVA SEÇÃO
        perfis: ['Admin', 'Cliente', 'Usuario'],
        itens: [
            { nome: 'Meus Tickets', caminho: '/suporte', icone: MessageSquare, perfis: ['Cliente', 'Usuario'] },
            { nome: 'Gestão de Tickets', caminho: '/admin/suporte', icone: MessageSquare, perfis: ['Admin'] },
        ]
    },
    {
        titulo: 'Administração',
        perfis: ['Admin', 'Cliente', 'Usuario'],
        itens: [
            { nome: 'Minha Assinatura', caminho: '/minha-assinatura', icone: DollarSign, perfis: ['Cliente'] },
            { nome: 'Clientes', caminho: '/clientes', icone: Building2, perfis: ['Admin', 'Cliente'], permissionKey: 'contas_receber' }, // ITEM RESTAURADO
            { nome: 'Gerenciar Usuários', caminho: '/gerenciar-usuarios', icone: Users, perfis: ['Admin', 'Cliente'], permissionKey: 'cadastrar_usuarios' },
            { nome: 'Plano de Contas', caminho: '/plano-contas', icone: BookOpen, perfis: ['Admin', 'Cliente', 'Usuario'], permissionKey: 'plano_contas' }, // ITEM RESTAURADO
            { nome: 'Gerenciar Planos', caminho: '/planos', icone: Package, perfis: ['Admin'] }, 
            { nome: 'Relatórios', caminho: '/relatorios', icone: FileText, perfis: ['Admin', 'Cliente', 'Usuario'], permissionKey: 'relatorios' },
            { nome: 'Importar Dados', caminho: '/importar', icone: Upload, perfis: ['Admin', 'Cliente', 'Usuario'], permissionKey: 'importar' },
            { nome: 'Exportar Dados', caminho: '/exportar', icone: FileDown, perfis: ['Admin', 'Cliente', 'Usuario'], permissionKey: 'relatorios' },
            { nome: 'Gerenciar Históricos', caminho: '/historicos', icone: History, perfis: ['Admin', 'Cliente', 'Usuario'], permissionKey: 'configuracoes' },
            { nome: 'Configurações', caminho: '/configuracoes', icone: Settings, perfis: ['Admin', 'Cliente', 'Usuario'], permissionKey: 'configuracoes' },
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
  const [clientBranding, setClientBranding] = useState<{ logoUrl: string | null, nome: string | null } | null>(null);
  
  const { ticketsAbertos, ticketsEmProgresso, ticketsPausados, mensagensParaResponder, carregando: carregandoNotificacoes } = useTicketNotifications();

  const isUnassignedUser = role === 'Usuario' && !(perfil as UsuarioProfile)?.cliente_id && !(perfil as AdminUsuarioProfile)?.admin_id;
  const isPendingClient = role === 'Cliente' && !(perfil as ClienteProfile)?.aprovado;
  
  const userProfile = perfil as UsuarioProfile | AdminUsuarioProfile;
  const clientProfile = perfil as ClienteProfile;
  
  const isAccessExpired = role === 'Cliente' && clientProfile?.data_fim_acesso && isPast(parseISO(clientProfile.data_fim_acesso));
  const isPreAuthFlow = localizacao.pathname === '/selecao-perfil';
  
  const isAdmin = role === 'Admin';
  const isClient = role === 'Cliente';
  const isUserOfClient = role === 'Usuario' && 'cliente_id' in userProfile && !!userProfile.cliente_id;
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
  
  const fetchClientBranding = useCallback(async () => {
      if (isUserOfClient && userProfile.cliente_id) {
          const { data, error } = await supabase
              .from('tbl_clientes')
              .select('nome, logo_url')
              .eq('id', userProfile.cliente_id)
              .single();
              
          if (error) {
              console.error('Erro ao buscar branding do Cliente:', error);
              setClientBranding(null);
          } else {
              setClientBranding({ logoUrl: data.logo_url, nome: data.nome });
          }
      } else {
          setClientBranding(null);
      }
  }, [isUserOfClient, userProfile]);

  useEffect(() => {
      if (!carregando) {
          fetchAdminBranding();
          fetchClientBranding();
      }
  }, [carregando, fetchAdminBranding, fetchClientBranding]);


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
        const proprietarioId = userProfile.cliente_id;
        const { data: clienteData } = await supabase
            .from('tbl_clientes')
            .select('plano_id')
            .eq('id', proprietarioId)
            .single();
            
        currentPlanoId = clienteData?.plano_id || null;
      }
      
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
  let textTitle = 'Fluxo de Caixa';
  
  if (isAdmin) {
      textTitle = adminBranding?.nome || perfil?.nome || 'Administrador';
  } else if (isClient) {
      textTitle = clienteProfile?.nome || 'Minha Empresa';
  } else if (isUserOfClient) {
      textTitle = clientBranding?.nome || 'Empresa Cliente';
  } else if (isUserOfAdmin) {
      textTitle = adminBranding?.nome || 'Admin';
  } else if (perfil?.nome) {
      textTitle = perfil.nome;
  }


  const checkPermission = (item: ItemMenu) => {
    if (!item.permissionKey) return true;

    if (isAccessExpired) {
        return item.caminho === '/painel' || item.caminho === '/minha-assinatura';
    }

    if (isPreAuthFlow) {
        return item.caminho === '/painel';
    }

    if (role === 'Admin') {
        return true;
    }

    if (role === 'Cliente') {
        if (isPendingClient) {
            return item.caminho === '/painel';
        }
        if (item.caminho.includes('/folha-ponto?mode=self')) {
            return false;
        }
        return clientProfile.permissoes?.[item.permissionKey] === true;
    }

    if (role === 'Usuario') {
        if (isUnassignedUser) {
            return item.caminho === '/painel' || item.caminho === '/cadastrar-empresa';
        }
        
        if (item.caminho === '/folha-ponto') {
            return false;
        }
        
        if (item.permissionKey) {
            return userProfile.permissoes?.[item.permissionKey] === true;
        }
        return false;
    }
    return false;
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
                    {mainTitle}
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
            if (!role || !secao.perfis.includes(role)) return null;
            
            if (secao.titulo === 'Suporte' && !shouldShowSuporte) {
                return null;
            }
            
            const itensVisiveis = secao.itens.filter(item => 
                item.perfis.includes(role) && 
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
                        if (item.caminho === '/suporte' && mensagensParaResponder > 0 && !isAdmin) {
                            notificationBadge = (
                                <span className="ml-auto h-5 w-5 rounded-full bg-red-500 flex items-center justify-center text-white text-xs font-bold">
                                    {mensagensParaResponder > 9 ? '9+' : mensagensParaResponder}
                                </span>
                            );
                        } else if (item.caminho === '/admin/suporte' && mensagensParaResponder > 0 && isAdmin) {
                            notificationBadge = (
                                <span className="ml-auto h-5 w-5 rounded-full bg-red-500 flex items-center justify-center text-white text-xs font-bold">
                                    {mensagensParaResponder > 9 ? '9+' : mensagensParaResponder}
                                </span>
                            );
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