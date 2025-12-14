import LayoutPrincipal from '@/components/LayoutPrincipal';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile, UsuarioProfile, AdminUsuarioProfile } from '@/types/usuario';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { Package, Loader2, Scale, Clock, Users, FileText, MessageSquare, PlusCircle, Building2 } from 'lucide-react';
import DashboardFinanceiro from '@/components/DashboardFinanceiro';
import React from 'react';

type DashboardType = 'financeiro' | 'contabilidade' | 'folha' | 'rh' | 'geral' | 'restrito';

const Painel = () => {
  const { role, perfil, carregando } = useSessao();

  const isClient = role === 'Cliente';
  const isAdmin = role === 'Admin';
  const isUsuario = role === 'Usuario';

  const isUsuarioDoAdmin = 
    isUsuario && 
    perfil && 
    ('admin_id' in perfil) && 
    (perfil as AdminUsuarioProfile).admin_id !== null;

  const getPermissoes = (): Record<string, boolean> => {
    if (isAdmin) return {};
    if (isUsuarioDoAdmin) {
      return (perfil as AdminUsuarioProfile)?.permissoes || {};
    }
    if (isClient) {
      return (perfil as ClienteProfile)?.permissoes || {};
    }
    if (isUsuario) {
      return (perfil as UsuarioProfile)?.permissoes || {};
    }
    return {};
  };

  const permissoes = getPermissoes();

  const hasFinanceiroPermission = 
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
    permissoes.documentos_societarios === true ||
    permissoes.gestao_suporte === true ||
    permissoes.gerenciar_clientes === true;

  const getDashboardType = (): DashboardType => {
    if (isAdmin) return 'financeiro';
    
    if (isClient) {
      const clienteProfile = perfil as ClienteProfile;
      if (!clienteProfile?.aprovado) return 'restrito';
      return 'financeiro';
    }
    
    if (hasFinanceiroPermission) return 'financeiro';
    if (hasContabilidadePermission) return 'contabilidade';
    if (hasRHPermission) return 'rh';
    if (hasFolhaPermission) return 'folha';
    if (hasGeralPermission) return 'geral';
    
    return 'restrito';
  };

  const dashboardType = getDashboardType();

  console.log('DEBUG PAINEL:', {
    role,
    isAdmin,
    isUsuarioDoAdmin,
    permissoes,
    hasFinanceiroPermission,
    hasContabilidadePermission,
    hasFolhaPermission,
    hasRHPermission,
    hasGeralPermission,
    dashboardType,
  });

  const getWelcomeMessage = (): string => {
    switch (dashboardType) {
      case 'financeiro': return 'Painel Financeiro';
      case 'contabilidade': return 'Painel Contabil';
      case 'folha': return 'Meu Ponto';
      case 'rh': return 'Gestao de RH';
      case 'geral': return 'Painel Geral';
      default: return 'Painel de Controle';
    }
  };

  if (carregando) {
    return (
      <LayoutPrincipal>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </LayoutPrincipal>
    );
  }

  const renderDashboard = () => {
    switch (dashboardType) {
      case 'financeiro':
        return <DashboardFinanceiro />;
        
      case 'contabilidade':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Link to="/relatorios/balanco">
              <Card className="hover:shadow-lg transition-shadow cursor-pointer border-l-4 border-blue-500">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Scale className="w-5 h-5 mr-2" />
                    Balanco Patrimonial
                  </CardTitle>
                  <CardDescription>Visualize a posicao patrimonial</CardDescription>
                </CardHeader>
              </Card>
            </Link>
            <Link to="/relatorios/dre">
              <Card className="hover:shadow-lg transition-shadow cursor-pointer border-l-4 border-green-500">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Scale className="w-5 h-5 mr-2" />
                    DRE
                  </CardTitle>
                  <CardDescription>Demonstracao do Resultado</CardDescription>
                </CardHeader>
              </Card>
            </Link>
            <Link to="/relatorios/balancete">
              <Card className="hover:shadow-lg transition-shadow cursor-pointer border-l-4 border-purple-500">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <FileText className="w-5 h-5 mr-2" />
                    Balancete
                  </CardTitle>
                  <CardDescription>Balancete de verificacao</CardDescription>
                </CardHeader>
              </Card>
            </Link>
            <Link to="/relatorios/razao">
              <Card className="hover:shadow-lg transition-shadow cursor-pointer border-l-4 border-orange-500">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <FileText className="w-5 h-5 mr-2" />
                    Razao
                  </CardTitle>
                  <CardDescription>Livro Razao por conta</CardDescription>
                </CardHeader>
              </Card>
            </Link>
            <Link to="/lancamentos">
              <Card className="hover:shadow-lg transition-shadow cursor-pointer border-l-4 border-teal-500">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <PlusCircle className="w-5 h-5 mr-2" />
                    Novo Lancamento
                  </CardTitle>
                  <CardDescription>Registrar lancamento manual</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          </div>
        );
        
      case 'folha':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {permissoes.ponto_eletronico && (
              <Link to="/ponto-eletronico">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer border-l-4 border-green-500">
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Clock className="w-5 h-5 mr-2" />
                      Bater Ponto
                    </CardTitle>
                    <CardDescription>Registre sua entrada e saida</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            )}
            {permissoes.visualizar_proprio_ponto && (
              <Link to="/folha-ponto?mode=self">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer border-l-4 border-blue-500">
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Clock className="w-5 h-5 mr-2" />
                      Acompanhar Meu Ponto
                    </CardTitle>
                    <CardDescription>Visualize seus registros de ponto</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            )}
          </div>
        );
        
      case 'rh':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {permissoes.folha_ponto && (
              <Link to="/folha-ponto">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer border-l-4 border-blue-500">
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Clock className="w-5 h-5 mr-2" />
                      Acompanhar Ponto (Gestor)
                    </CardTitle>
                    <CardDescription>Gerencie o ponto dos funcionarios</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            )}
            {permissoes.cadastrar_usuarios && (
              <Link to="/gerenciar-usuarios">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer border-l-4 border-purple-500">
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Users className="w-5 h-5 mr-2" />
                      Gerenciar Usuarios
                    </CardTitle>
                    <CardDescription>Cadastre e gerencie funcionarios</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            )}
          </div>
        );
        
      case 'geral':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {permissoes.documentos_societarios && (
              <Link to="/documentos-societarios">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer border-l-4 border-indigo-500">
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <FileText className="w-5 h-5 mr-2" />
                      Documentos Societarios
                    </CardTitle>
                    <CardDescription>Gerencie seus documentos societarios</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            )}
            {permissoes.gestao_suporte && (
              <Link to="/admin/suporte">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer border-l-4 border-orange-500">
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <MessageSquare className="w-5 h-5 mr-2" />
                      Gestao de Tickets
                    </CardTitle>
                    <CardDescription>Atenda os tickets de suporte</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            )}
            {permissoes.gerenciar_clientes && (
              <Link to="/clientes">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer border-l-4 border-green-500">
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Building2 className="w-5 h-5 mr-2" />
                      Gerenciar Clientes
                    </CardTitle>
                    <CardDescription>Gerencie seus clientes</CardDescription>
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
              <p className="text-muted-foreground">Voce nao possui permissoes ativas. Entre em contato com o administrador.</p>
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
