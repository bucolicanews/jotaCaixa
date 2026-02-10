import LayoutPrincipal from '@/components/LayoutPrincipal';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile, UsuarioProfile, AdminUsuarioProfile } from '@/types/usuario';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { Package, Loader2, Scale, Clock, Users, FileText, MessageSquare, PlusCircle, Building2, Receipt, CheckSquare } from 'lucide-react';
import DashboardFinanceiro from '@/components/DashboardFinanceiro';
import React from 'react';
import SetupBlocker from '@/components/SetupBlocker';
import FormCapitalSocial from '@/components/formularios/FormCapitalSocial';

type DashboardType = 'financeiro' | 'contabilidade' | 'folha' | 'rh' | 'geral' | 'restrito';

const Painel = () => {
  const { role, perfil, carregando, setupStatus, refetch } = useSessao();

  const isClient = role === 'Cliente';
  const isAdmin = role === 'Admin';
  const isUsuario = role === 'Usuario';

  const getPermissoes = (): Record<string, boolean> => {
    if (isAdmin) return {};
    if (isUsuario) return (perfil as any)?.permissoes || {};
    if (isClient) return (perfil as ClienteProfile)?.permissoes || {};
    return {};
  };

  const permissoes = getPermissoes();

  // Dashboard Financeiro (KPIs e Saldos) apenas para quem tem acesso às contas
  const hasFinanceiroDashboard = 
    isAdmin || 
    isClient || 
    permissoes.contas_pagar === true || 
    permissoes.contas_receber === true;

  const hasContabilidadePermission =
    permissoes.lancamentos === true ||
    permissoes.balanco === true || 
    permissoes.contas_patrimoniais === true || 
    permissoes.dre === true || 
    permissoes.balancete === true || 
    permissoes.razao === true || 
    permissoes.historicos === true ||
    permissoes.plano_contas === true ||
    permissoes.configuracoes === true ||
    permissoes.exportar === true ||
    permissoes.importar === true ||
    permissoes.relatorios === true;

  const hasFolhaPermission = 
    permissoes.ponto_eletronico === true || 
    permissoes.visualizar_proprio_ponto === true;

  const hasRHPermission = 
    permissoes.cadastrar_usuarios === true || 
    permissoes.folha_ponto === true;

  const hasGeralPermission =
    permissoes.emissao_nf === true ||
    permissoes.documentos_societarios === true ||
    permissoes.gestao_suporte === true ||
    permissoes.gerenciar_clientes === true ||
    permissoes.protocolos === true;

  const getDashboardType = (): DashboardType => {
    if (isAdmin) return 'financeiro';
    
    if (isClient) {
      const clienteProfile = perfil as ClienteProfile;
      if (!clienteProfile?.aprovado) return 'restrito';
      return 'financeiro';
    }
    
    // Se o funcionário tem acesso a contas, mostra o dashboard financeiro completo
    if (hasFinanceiroDashboard) return 'financeiro';
    
    // Caso contrário, se tiver qualquer outra permissão, mostra o painel de cards (geral)
    if (hasGeralPermission || hasContabilidadePermission || hasRHPermission || hasFolhaPermission) return 'geral';
    
    return 'restrito';
  };

  const dashboardType = getDashboardType();

  const getWelcomeMessage = (): string => {
    switch (dashboardType) {
      case 'financeiro': return 'Painel Financeiro';
      case 'contabilidade': return 'Painel Contábil';
      case 'folha': return 'Meu Ponto';
      case 'rh': return 'Gestão de RH';
      case 'geral': return 'Painel de Módulos';
      default: return 'Painel de Controle';
    }
  };

  const isClientUser =
    role === 'Usuario' &&
    perfil &&
    'cliente_id' in perfil &&
    Boolean((perfil as UsuarioProfile)?.cliente_id);
    
  const shouldBlockSetup =
    (isClient || isClientUser) &&
    setupStatus &&
    !setupStatus.isComplete &&
    permissoes.emissao_nf !== true;
    
  const shouldBlockFirstLaunch =
    (isClient || isClientUser) &&
    setupStatus &&
    setupStatus.isComplete &&
    !setupStatus.firstLaunchCompleted &&
    permissoes.emissao_nf !== true;

  if (carregando) {
    return (
      <LayoutPrincipal>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </LayoutPrincipal>
    );
  }

  if (shouldBlockSetup) {
    return (
      <LayoutPrincipal>
        <SetupBlocker missingSteps={setupStatus?.missingSteps ?? []} />
      </LayoutPrincipal>
    );
  }
  
  if (shouldBlockFirstLaunch) {
      return (
          <LayoutPrincipal>
              <div className="max-w-xl mx-auto">
                  <FormCapitalSocial onSaveComplete={refetch} />
              </div>
          </LayoutPrincipal>
      );
  }

  const renderDashboard = () => {
    switch (dashboardType) {
      case 'financeiro':
        return <DashboardFinanceiro />;
        
      case 'geral':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* CARD FISCAL */}
            {permissoes.emissao_nf && (
              <Link to="/emissao-notas">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer border-l-4 border-blue-600">
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Receipt className="w-5 h-5 mr-2 text-blue-600" />
                      Emissão de Notas
                    </CardTitle>
                    <CardDescription>Gerencie e envie notas fiscais</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            )}

            {/* CARD DOCUMENTOS */}
            {permissoes.documentos_societarios && (
              <Link to="/documentos-societarios">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer border-l-4 border-indigo-500">
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <FileText className="w-5 h-5 mr-2 text-indigo-500" />
                      Documentos Societários
                    </CardTitle>
                    <CardDescription>Gerencie atas e contratos sociais</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            )}

            {/* CARD SUPORTE */}
            {permissoes.gestao_suporte && (
              <Link to="/admin/suporte">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer border-l-4 border-orange-500">
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <MessageSquare className="w-5 h-5 mr-2 text-orange-500" />
                      Gestão de Tickets
                    </CardTitle>
                    <CardDescription>Atenda chamados de suporte</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            )}

            {/* CARD CLIENTES */}
            {permissoes.gerenciar_clientes && (
              <Link to="/clientes">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer border-l-4 border-green-500">
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Building2 className="w-5 h-5 mr-2 text-green-500" />
                      Gerenciar Clientes
                    </CardTitle>
                    <CardDescription>Cadastro de empresas e contatos</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            )}

            {/* CARD PROTOCOLOS */}
            {permissoes.protocolos && (
              <Link to="/protocolos">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer border-l-4 border-purple-500">
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Package className="w-5 h-5 mr-2 text-purple-500" />
                      Protocolos
                    </CardTitle>
                    <CardDescription>Controle de entregas e recebimentos</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            )}

            {/* CARD PONTO (GESTOR) */}
            {permissoes.folha_ponto && (
              <Link to="/folha-ponto">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer border-l-4 border-cyan-500">
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Clock className="w-5 h-5 mr-2 text-cyan-500" />
                      Acompanhar Ponto
                    </CardTitle>
                    <CardDescription>Gestão de jornada dos funcionários</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            )}
          </div>
        );
        
      default:
        return (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle>Acesso Restrito</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Você não possui permissões ativas para visualizar módulos neste painel. Entre em contato com o administrador.</p>
            </CardContent>
          </Card>
        );
    }
  };

  return (
    <LayoutPrincipal>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">Painel de Controle</h1>
        {isClient && (
          <Link to="/vendas">
            <Button variant="default">
              <Package className="w-4 h-4 mr-2" />
              Atualizar Plano
            </Button>
          </Link>
        )}
      </div>
      
      <p className="text-lg text-muted-foreground mb-8">
        Bem-vindo ao {getWelcomeMessage()}.
      </p>

      {renderDashboard()}
    </LayoutPrincipal>
  );
};

export default Painel;