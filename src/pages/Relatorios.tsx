import LayoutPrincipal from '@/components/LayoutPrincipal';
import ReportCard from '@/components/ReportCard';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { ArrowDownCircle, ArrowUpCircle, BarChart3, Scale, TrendingUp, FileBarChart, Users, Clock, Search, Filter, FileTextIcon, BookOpen, DollarSign } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';

const REPORTS_DATA = [
  {
    title: "Folha de Ponto",
    description: "Acompanhe a jornada de trabalho, horas extras e faltas dos funcionários.",
    icon: Clock,
    link: "/folha-ponto", 
    permissionKey: 'folha_ponto',
    permissionLabel: 'Acompanhar Ponto (Gestor)',
  },
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
    title: "Clientes e Empresas",
    description: "Lista e status de todas as empresas e clientes cadastrados (Ativos, Inativos, Avulsos).",
    icon: Users, 
    link: "/clientes", 
    permissionKey: 'contas_receber', 
    permissionLabel: 'Contas a Receber',
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
    title: "Balancete de Verificação",
    description: "Relatório contábil completo com saldos iniciais, movimentos e saldos finais.",
    icon: FileTextIcon,
    link: "/relatorios/balancete",
    permissionKey: 'relatorios',
    permissionLabel: 'Relatórios',
  },
  {
    title: "Livro Razão",
    description: "Detalhe de todos os lançamentos e saldos acumulados por conta analítica.",
    icon: BookOpen,
    link: "/relatorios/razao",
    permissionKey: 'relatorios',
    permissionLabel: 'Relatórios',
  },
  {
    title: "Todos os Lançamentos",
    description: "Relatório completo de todas as partidas dobradas (Débito/Crédito) do sistema.",
    icon: DollarSign,
    link: "/lancamentos?tab=todos",
    permissionKey: 'plano_contas',
    permissionLabel: 'Plano de Contas',
  },
];

const Relatorios = () => {
  const { role, perfil } = useSessao();
  const [filtroBusca, setFiltroBusca] = useState('');
  
  const getPermissions = (): Record<string, boolean> => {
    if (role === 'Admin') return REPORTS_DATA.reduce((acc, r) => ({ ...acc, [r.permissionKey]: true }), {});
    if (role === 'Cliente') return (perfil as ClienteProfile)?.permissoes || {};
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.permissoes || {};
    return {};
  };
  
  const userPermissions = getPermissions();
  
  const canAccessPage = userPermissions.relatorios === true || role === 'Admin';

  const relatoriosFiltrados = useMemo(() => {
    let filtered = REPORTS_DATA;
    
    // 1. Filtrar por texto
    if (filtroBusca) {
        const termo = filtroBusca.toLowerCase();
        filtered = filtered.filter(r => 
            r.title.toLowerCase().includes(termo) || 
            r.description.toLowerCase().includes(termo)
        );
    }
    
    // 2. Ordenar alfabeticamente
    return filtered.sort((a, b) => a.title.localeCompare(b.title));
  }, [filtroBusca]);


  if (!canAccessPage) {
    return (
      <LayoutPrincipal>
        <Card><CardHeader><CardTitle>Acesso Negado</CardTitle></CardHeader><CardContent><p>Você não tem permissão para acessar a área de relatórios.</p></CardContent></Card>
      </LayoutPrincipal>
    );
  }

  return (
    <LayoutPrincipal>
      <h1 className="text-2xl md:text-3xl font-bold mb-6 flex items-center">
        <FileBarChart className="w-6 h-6 mr-2" /> Dashboard de Relatórios Financeiros
      </h1>
      
      <Card className="mb-6">
        <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center"><Filter className="w-4 h-4 mr-2" /> Filtros</CardTitle>
        </CardHeader>
        <CardContent>
            <div className="relative w-full max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Buscar relatório por nome ou descrição..."
                    value={filtroBusca}
                    onChange={(e) => setFiltroBusca(e.target.value)}
                    className="pl-10"
                />
            </div>
        </CardContent>
      </Card>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {relatoriosFiltrados.map((report) => {
          const hasPermission = userPermissions[report.permissionKey] === true;
          const isDisabled = !hasPermission && role !== 'Admin';
          
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
      
      {relatoriosFiltrados.length === 0 && (
          <Card className="mt-6">
              <CardContent className="p-6 text-center text-muted-foreground">
                  Nenhum relatório encontrado com o termo de busca.
              </CardContent>
          </Card>
      )}
    </LayoutPrincipal>
  );
};

export default Relatorios;