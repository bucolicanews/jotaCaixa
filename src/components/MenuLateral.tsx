import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { LayoutDashboard, DollarSign, ArrowUpCircle, ArrowDownCircle, Banknote, FileText, Upload, Settings, LogOut, BookOpen, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';

interface ItemMenu {
  nome: string;
  caminho: string;
  icone: React.ElementType;
  perfis: ('Admin' | 'Cliente' | 'Usuario')[]; // Quem pode ver este item
}

const itensMenu: ItemMenu[] = [
  { nome: 'Painel', caminho: '/painel', icone: LayoutDashboard, perfis: ['Admin', 'Cliente', 'Usuario'] },
  { nome: 'Contas a Pagar', caminho: '/contas-pagar', icone: ArrowDownCircle, perfis: ['Admin', 'Cliente', 'Usuario'] },
  { nome: 'Contas a Receber', caminho: '/contas-receber', icone: ArrowUpCircle, perfis: ['Admin', 'Cliente', 'Usuario'] },
  { nome: 'Bancos / Caixas', caminho: '/bancos', icone: Banknote, perfis: ['Admin', 'Cliente', 'Usuario'] },
  { nome: 'Plano de Contas', caminho: '/plano-contas', icone: BookOpen, perfis: ['Admin', 'Cliente'] },
  { nome: 'Conciliação', caminho: '/conciliacao', icone: DollarSign, perfis: ['Admin', 'Cliente', 'Usuario'] },
  { nome: 'Importar', caminho: '/importar', icone: Upload, perfis: ['Admin', 'Cliente'] },
  { nome: 'Relatórios', caminho: '/relatorios', icone: FileText, perfis: ['Admin', 'Cliente'] },
  { nome: 'Gerenciar Usuários', caminho: '/gerenciar-usuarios', icone: Users, perfis: ['Admin', 'Cliente'] },
  { nome: 'Configurações', caminho: '/configuracoes', icone: Settings, perfis: ['Admin', 'Cliente'] },
];

const MenuLateral = () => {
  const localizacao = useLocation();
  const { perfil } = useSessao();
  const perfilUsuario = perfil?.tbl_perfil?.nome;

  const lidarComSair = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="flex flex-col h-full border-r bg-sidebar dark:bg-sidebar-background text-sidebar-foreground">
      <div className="p-4 border-b">
        <h1 className="text-xl font-bold text-sidebar-primary">Fluxo de Caixa</h1>
      </div>
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {itensMenu.map((item) => {
          if (!perfilUsuario || !item.perfis.includes(perfilUsuario)) {
            return null; // Não renderiza o item se o perfil não tiver permissão
          }
          const estaAtivo = localizacao.pathname === item.caminho;
          const Icone = item.icone;
          return (
            <Link
              key={item.nome}
              to={item.caminho}
              className={cn(
                "flex items-center p-3 rounded-lg transition-colors",
                estaAtivo
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                  : "hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
              )}
            >
              <Icone className="w-5 h-5 mr-3" />
              {item.nome}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t">
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

export default MenuLateral;