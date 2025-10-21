import React from 'react';
import { Link } from 'react-router-dom';
import { Home, DollarSign, TrendingUp, Banknote, FileText, Upload, Settings, LogOut, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { showError } from '@/utils/toast';

interface ItemNavegacaoProps {
  icone: React.ElementType;
  nome: string;
  caminho: string;
  ativo: boolean;
}

const ItemNavegacao: React.FC<ItemNavegacaoProps> = ({ icone: Icone, nome, caminho, ativo }) => (
  <Link
    to={caminho}
    className={cn(
      "flex items-center gap-3 rounded-lg px-3 py-2 transition-all",
      ativo
        ? "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent/90"
        : "text-sidebar-foreground hover:bg-sidebar-accent/50"
    )}
  >
    <Icone className="h-5 w-5" />
    {nome}
  </Link>
);

const NavegacaoLateral: React.FC = () => {
  const { usuario, logout } = useAuth();
  const caminhoAtual = window.location.pathname;

  const itensAdmin = [
    { nome: "Painel", icone: Home, caminho: "/" },
    { nome: "Administração", icone: Users, caminho: "/admin/usuarios" },
    { nome: "Configurações", icone: Settings, caminho: "/configuracoes" },
  ];

  const itensCliente = [
    { nome: "Painel", icone: Home, caminho: "/" },
    { nome: "Contas a Pagar", icone: DollarSign, caminho: "/contas-pagar" },
    { nome: "Contas a Receber", icone: TrendingUp, caminho: "/contas-receber" },
    { nome: "Bancos / Caixas", icone: Banknote, caminho: "/bancos" },
    { nome: "Conciliação", icone: FileText, caminho: "/conciliacao" },
    { nome: "Importar Dados", icone: Upload, caminho: "/importar" },
    { nome: "Relatórios", icone: FileText, caminho: "/relatorios" },
    { nome: "Configurações", icone: Settings, caminho: "/configuracoes" },
  ];

  const itensMenu = usuario?.tipo_usuario === 'admin' ? itensAdmin : itensCliente;

  const lidarComLogout = async () => {
    try {
      await logout();
    } catch (erro) {
      showError("Erro ao fazer logout.");
    }
  };

  return (
    <div className="flex h-full max-h-screen flex-col gap-2 bg-sidebar p-4 border-r border-sidebar-border">
      <div className="flex h-14 items-center border-b border-sidebar-border px-4 lg:h-[60px] lg:px-6">
        <Link to="/" className="flex items-center gap-2 font-semibold text-sidebar-primary-foreground">
          <DollarSign className="h-6 w-6" />
          <span className="text-lg">Fluxo de Caixa</span>
        </Link>
      </div>
      <div className="flex-1 overflow-auto py-2">
        <nav className="grid items-start gap-1 px-2 text-sm font-medium">
          {itensMenu.map((item) => (
            <ItemNavegacao
              key={item.nome}
              nome={item.nome}
              icone={item.icone}
              caminho={item.caminho}
              ativo={caminhoAtual === item.caminho}
            />
          ))}
        </nav>
      </div>
      <div className="mt-auto p-2 border-t border-sidebar-border">
        {usuario && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-sidebar-foreground/70 truncate">
              Logado como: {usuario.nome} ({usuario.tipo_usuario})
            </p>
            <Button 
              variant="ghost" 
              className="w-full justify-start text-red-400 hover:text-red-500"
              onClick={lidarComLogout}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default NavegacaoLateral;