import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { LayoutDashboard, DollarSign, ArrowUpCircle, ArrowDownCircle, Banknote, FileText, Upload, Settings, BookOpen, Users, Building2, Clock, Contact, CalendarCheck, User, FileSignature, Tag, FileTextIcon, Package, History, FileDown, MessageSquare, Scale } from 'lucide-react';
import React from 'react';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { isPast, parseISO } from 'date-fns';

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
            { nome: 'Meu Ponto', caminho: '/perfil', icone: User, perfis: ['Usuario'], permissionKey: 'visualizar_proprio_ponto' },
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
            { nome: 'Contas Patrimoniais', caminho: '/contas-patrimoniais', icone: Scale, perfis: ['Admin', 'Cliente', 'Usuario'], permissionKey: 'bancos' }, // NOVO ITEM
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
        titulo: 'Cadastros',
        perfis: ['Admin', 'Cliente', 'Usuario'],
        itens: [
            // Clientes está vinculado a 'contas_receber'
            { nome: 'Clientes', caminho: '/clientes', icone: Contact, perfis: ['Admin', 'Cliente', 'Usuario'], permissionKey: 'contas_receber' },
            { nome: 'Plano de Contas', caminho: '/plano-contas', icone: BookOpen, perfis: ['Admin', 'Cliente', 'Usuario'], permissionKey: 'plano_contas' },
            { nome: 'Históricos', caminho: '/historicos', icone: History, perfis: ['Admin', 'Cliente', 'Usuario'], permissionKey: 'plano_contas' },
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
            { nome: 'Gerenciar Usuários', caminho: '/gerenciar-usuarios', icone: Users, perfis: ['Admin', 'Cliente'], permissionKey: 'cadastrar_usuarios' },
            { nome: 'Gerenciar Planos', caminho: '/planos', icone: Package, perfis: ['Admin'] }, 
            { nome: 'Relatórios', caminho: '/relatorios', icone: FileText, perfis: ['Admin', 'Cliente', 'Usuario'], permissionKey: 'relatorios' },
            { nome: 'Importar Dados', caminho: '/importar', icone: Upload, perfis: ['Admin', 'Cliente', 'Usuario'], permissionKey: 'importar' },
            { nome: 'Exportar Dados', caminho: '/exportar', icone: FileDown, perfis: ['Admin', 'Cliente', 'Usuario'], permissionKey: 'relatorios' },
            { nome: 'Configurações', caminho: '/configuracoes', icone: Settings, perfis: ['Admin', 'Cliente', 'Usuario'], permissionKey: 'configuracoes' },
        ]
    }
];

interface MenuLateralProps {
  onLinkClick?: () => void;
}

const MenuLateral: React.FC<MenuLateralProps> = ({ onLinkClick }) => {
  const localizacao = useLocation();
  const { role, perfil } = useSessao();

  const isUnassignedUser = role === 'Usuario' && !(perfil as UsuarioProfile)?.cliente_id;
  const isPendingClient = role === 'Cliente' && !(perfil as ClienteProfile)?.aprovado;
  const userProfile = perfil as UsuarioProfile;
  const clientProfile = perfil as ClienteProfile;
  
  // Lógica de Expiração: Se for Cliente, aprovado, e a data de fim de acesso for passada.
  const dataFimAcesso = clientProfile?.data_fim_acesso ? parseISO(clientProfile.data_fim_acesso) : null;
  const isAccessExpired = role === 'Cliente' && clientProfile?.aprovado && dataFimAcesso && isPast(dataFimAcesso);
  
  // Se o usuário for recém-cadastrado e estiver na tela de seleção de perfil,
  // ele não deve ver o menu completo.
  const isPreAuthFlow = localizacao.pathname === '/selecao-perfil';

  const checkPermission = (item: ItemMenu) => {
    if (!item.permissionKey) return true;

    // Se o acesso expirou, bloqueia todos os módulos, exceto Painel e Minha Assinatura
    if (isAccessExpired) {
        return item.caminho === '/painel' || item.caminho === '/minha-assinatura';
    }

    // Se estiver no fluxo de seleção de perfil, só permite Painel (que é o LayoutPrincipal)
    if (isPreAuthFlow) {
        return item.caminho === '/painel';
    }

    // O Admin agora tem acesso a todos os módulos listados, pois ele precisa gerenciar seus próprios lançamentos.
    if (role === 'Admin') {
        return true;
    }

    if (role === 'Cliente') {
        // Clientes pendentes só veem Painel (que mostra a mensagem de aprovação)
        if (isPendingClient) {
            return item.caminho === '/painel';
        }
        // Se for 'Meu Ponto', oculta para Cliente (que usa Acompanhar Ponto)
        if (item.caminho === '/perfil' && item.permissionKey === 'visualizar_proprio_ponto') {
            return false;
        }
        // Verifica a permissão do Cliente
        // Se a permissão for explicitamente false ou não existir, bloqueia.
        return clientProfile.permissoes?.[item.permissionKey] === true;
    }

    if (role === 'Usuario') {
        // Usuários não vinculados só veem Cadastrar Empresa e Painel
        if (isUnassignedUser) {
            return item.caminho === '/painel';
        }
        
        // Se for 'Acompanhar Ponto' (FolhaPonto), oculta para Usuário.
        if (item.caminho === '/folha-ponto') {
            return false;
        }
        // Verifica a permissão do Usuário
        if (item.caminho === '/perfil' && item.permissionKey === 'visualizar_proprio_ponto') {
            return userProfile.permissoes?.[item.permissionKey] === true;
        }
        return userProfile.permissoes?.[item.permissionKey] === true;
    }
    return false;
  };

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      <div className="p-4 border-b">
        <h1 className="text-xl font-bold text-primary">Navegação</h1>
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
            
            const itensVisiveis = secao.itens.filter(item => 
                item.perfis.includes(role) && 
                checkPermission(item)
            );

            if (itensVisiveis.length === 0) return null;

            return (
                <div key={secao.titulo} className="space-y-1">
                    <h3 className="text-sm font-semibold text-muted-foreground px-3 pt-2">{secao.titulo}</h3>
                    {itensVisiveis.map((item) => {
                        const estaAtivo = localizacao.pathname === item.caminho;
                        const Icone = item.icone;
                        
                        // Se o acesso expirou e não é Painel ou Minha Assinatura, desabilita o link
                        const isDisabled = isAccessExpired && item.caminho !== '/painel' && item.caminho !== '/minha-assinatura';

                        return (
                            <Link
                                key={item.nome}
                                to={isDisabled ? localizacao.pathname : item.caminho} // Se desabilitado, linka para a página atual
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