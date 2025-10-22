import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { LayoutDashboard, DollarSign, ArrowUpCircle, ArrowDownCircle, Banknote, FileText, Upload, Settings, LogOut, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';

interface ItemMenu {
  nome: string;
  caminho: string;
  icone: React.ElementType;
}

const itensMenu: ItemMenu[] = [
  { nome: 'Painel', caminho: '/painel', icone: LayoutDashboard },
  { nome: 'Contas a Pagar', caminho: '/contas-pagar', icone: ArrowDownCircle },
  { nome: 'Contas a Receber', caminho: '/contas-receber', icone: ArrowUpCircle },
  { nome: 'Bancos / Caixas', caminho: '/bancos', icone: Banknote },
  { nome: 'Plano de Contas', caminho: '/plano-contas', icone: BookOpen }, // Novo item
  { nome: 'Conciliação', caminho: '/conciliacao', icone: DollarSign },
  { nome: 'Importar', caminho: '/importar', icone: Upload },
  { nome: 'Relatórios', caminho: '/relatorios', icone: FileText },
  { nome: 'Configurações', caminho: '/configuracoes', icone: Settings },
];

/**
 * Menu lateral de navegação.
 */
const MenuLateral = () => {
  const localizacao = useLocation();

  const lidarComSair = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      const errorMessage = (error as Error).message;
      
      // Se a sessão já estiver faltando (o que pode acontecer se ela expirou ou foi limpa),
      // tratamos como um logout local bem-sucedido para evitar mostrar um erro confuso.
      if (errorMessage.includes('Auth session missing')) {
        console.warn('Sign out falhou porque a sessão já estava ausente. Redirecionamento esperado.');
        // O LayoutPrincipal deve detectar a sessão nula e redirecionar.
      } else {
        showError('Erro ao sair: ' + errorMessage);
      }
    }
  };

  return (
    <div className="flex flex-col h-full border-r bg-sidebar dark:bg-sidebar-background text-sidebar-foreground">
      <div className="p-4 border-b">
        <h1 className="text-xl font-bold text-sidebar-primary">Fluxo de Caixa</h1>
      </div>
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {itensMenu.map((item) => {
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