import LayoutPrincipal from '@/components/LayoutPrincipal';
import ReportCard from '@/components/ReportCard';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { ArrowDownCircle, ArrowUpCircle, BarChart3, FileText, Scale, TrendingUp, FileBarChart } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const REPORTS = [
  {
    title: "Fluxo de Caixa",
    description: "Visualize entradas e saídas por período e o saldo atual das contas.",
    icon: TrendingUp,
    link: "/relatorios/fluxo-caixa", 
    permissionKey: 'bancos',
    permissionLabel: 'Bancos / Caixas',
  },
  {
    title: "Contas a Receber",
    description: "Relatório detalhado de parcelas, status de pagamento e clientes.",
    icon: ArrowUpCircle,
    link: "/contas-receber", 
    permissionKey: 'contas_receber',
    permissionLabel: 'Contas a Receber',
  },
  {
    title: "Contas a Pagar",
    description: "Relatório detalhado de parcelas, status de pagamento e fornecedores.",
    icon: ArrowDownCircle,
    link: "/contas-pagar", 
    permissionKey: 'contas_pagar',
    permissionLabel: 'Contas a Pagar',
  },
  {
    title: "Balanço Patrimonial (Simplificado)",
    description: "Visão geral dos ativos e passivos da empresa.",
    icon: Scale,
    link: "/relatorios/balanco",
    permissionKey: 'relatorios',
    permissionLabel: 'Relatórios',
  },
  {
    title: "Demonstração de Resultado (DRE)",
    description: "Análise de receitas e despesas para cálculo do lucro/prejuízo.",
    icon: BarChart3,
    link: "/relatorios/dre",
    permissionKey: 'relatorios',
    permissionLabel: 'Relatórios',
  },
  {
    title: "Exportação Calima",
    description: "Gere arquivos para importação no sistema contábil Calima.",
    icon: FileText,
    link: "/relatorios/calima",
    permissionKey: 'relatorios',
    permissionLabel: 'Relatórios',
  },
];

const Relatorios = () => {
  const { role, perfil } = useSessao();
  
  const getPermissions = (): Record<string, boolean> => {
    if (role === 'Admin') return REPORTS.reduce((acc, r) => ({ ...acc, [r.permissionKey]: true }), {});
    if (role === 'Cliente') return (perfil as ClienteProfile)?.permissoes || {};
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.permissoes || {};
    return {};
  };
  
  const userPermissions = getPermissions();
  
  // Correção 1: Acesso seguro à propriedade 'relatorios'
  const canAccessPage = userPermissions.relatorios === true || role === 'Admin';

  // Correção 2: Se !canAccessPage for verdadeiro, e role não for Admin, bloqueia.
  if (!canAccessPage) {
    return (
      <LayoutPrincipal>
        <Card><CardHeader><CardTitle>Acesso Negado</CardTitle></CardHeader><CardContent><p>Você não tem permissão para acessar a área de relatórios.</p></CardContent></Card>
      </LayoutPrincipal>
    );
  }

  return (
    <LayoutPrincipal>
      <h1 className="text-2xl md:text-3xl font-bold mb-8 flex items-center">
        <FileBarChart className="w-6 h-6 mr-2" /> Dashboard de Relatórios Financeiros
      </h1>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {REPORTS.map((report) => {
          // Correção 3: Acesso seguro à chave usando userPermissions[report.permissionKey]
          const hasPermission = userPermissions[report.permissionKey] === true;
          const isDisabled = !hasPermission && role !== 'Admin';
          
          // Exceção: Se o link for para Contas a Pagar/Receber, a permissão é verificada lá,
          // mas aqui usamos a permissão do módulo para habilitar o card.
          
          return (
            <ReportCard
              key={report.title}
              title={report.title}
              description={report.description}
              icon={report.icon}
              link={report.link}
              isDisabled={isDisabled}
              permissionLabel={report.permissionLabel}
            />
          );
        })}
      </div>
    </LayoutPrincipal>
  );
};

export default Relatorios;