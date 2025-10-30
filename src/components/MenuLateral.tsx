import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { LayoutDashboard, DollarSign, ArrowUpCircle, ArrowDownCircle, Banknote, FileText, Upload, Settings, BookOpen, Users, Building2, Clock, Contact, CalendarCheck, User, FileSignature } from 'lucide-react';
import React from 'react';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';

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
            { nome: 'Contas a Pagar', caminho: '/contas-pagar', icone: ArrowDownCircle, perfis: ['Admin', 'Cliente', 'Usuario'], permissionKey: 'contas_pagar' },
            { nome: 'Contas a Receber', caminho: '/contas-receber', icone: ArrowUpCircle, perfis: ['Admin', 'Cliente', 'Usuario'], permissionKey: 'contas_receber' },
            { nome: 'Bancos / Caixas', caminho: '/bancos', icone: Banknote, perfis: ['Admin', 'Cliente', 'Usuario'], permissionKey: 'bancos' },
            { nome: 'Conciliação', caminho: '/conciliacao', icone: DollarSign, perfis: ['Admin', 'Cliente', 'Usuario'], permissionKey: 'conciliacao' },
            { nome: 'Relatórios', caminho: '/relatorios', icone: FileText, perfis: ['Admin', 'Cliente', 'Usuario'], permissionKey: 'relatorios' },
        ]
    },
    {
        titulo: 'Contratos',
        perfis: ['Admin', 'Cliente'],
        itens: [
            { nome: 'Gerenciar Contratos', caminho: '/contratos', icone: FileSignature, perfis: ['Admin', 'Cliente'] },
        ]
    },
    {
        titulo: 'Cadastros',
        perfis: ['Admin', 'Cliente', 'Usuario'],
        itens: [
            { nome: 'Clientes', caminho: '/clientes', icone: Contact, perfis: ['Admin', 'Cliente', 'Usuario'], permissionKey: 'contas_receber' },
            { nome: 'Plano de Contas', caminho: '/plano-contas', icone: BookOpen, perfis: ['Admin', 'Cliente', 'Usuario'], permissionKey: 'plano_contas' },
            { nome: 'Importar', caminho: '/importar', icone: Upload, perfis: ['Admin', 'Cliente', 'Usuario'], permissionKey: 'importar' },
        ]
    },
    {
        titulo: 'Administração',
        perfis: ['Admin', 'Cliente'],
        itens: [
            { nome: 'Gerenciar Usuários', caminho: '/gerenciar-usuarios', icone: Users, perfis: ['Admin', 'Cliente'] },
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

  const checkPermission = (item: ItemMenu) => {
    if (!item.permissionKey) return true;

    if (role === 'Admin') return true;

    if (role === 'Cliente') {
        // Se for 'Meu Ponto', oculta para Cliente (que usa Acompanhar Ponto)
        if (item.caminho === '/perfil' && item.permissionKey === 'visualizar_proprio_ponto') {
            return false;
        }
        return clientProfile.permissoes?.[item.permissionKey] === true;
    }

    if (role === 'Usuario') {
        // Se for 'Acompanhar Ponto' (FolhaPonto), oculta para Usuário.
        if (item.caminho === '/folha-ponto') {
            return false;
        }
        // Se for 'Meu Ponto', verifica a permissão específica
        if (item.caminho === '/perfil' && item.permissionKey === 'visualizar_proprio_ponto') {
            return userProfile.permissoes?.[item.permissionKey] === true;
        }
        // Para Ponto Eletrônico e outros módulos, verifica a permissão.
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
        
        {SECOES_MENU.map(secao => {
            if (!role || !secao.perfis.includes(role)) return null;
            
            const itensVisiveis = secao.itens.filter(item => 
                item.perfis.includes(role) && 
                !isPendingClient && 
                checkPermission(item)
            );

            if (itensVisiveis.length === 0) return null;

            return (
                <div key={secao.titulo} className="space-y-1">
                    <h3 className="text-sm font-semibold text-muted-foreground px-3 pt-2">{secao.titulo}</h3>
                    {itensVisiveis.map((item) => {
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
                                        ? "bg-accent text-accent-foreground font-semibold"
                                        : "hover:bg-accent/50 hover:text-foreground",
                                )}
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