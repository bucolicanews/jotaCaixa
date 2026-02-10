import React from 'react';
import { useSessao } from '@/hooks/use-sessao';
import { useNavigate } from 'react-router-dom';
import { Loader2, Package, Phone, AlertTriangle, Settings as SettingsIcon, Info } from 'lucide-react';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { Card, CardDescription, CardHeader, CardTitle, CardContent } from './ui/card';
import { cn } from '@/lib/utils';
import Header from './Header';
import TrialBanner from './TrialBanner';
import TrialButton from './TrialButton';
import { isPast, parseISO } from 'date-fns';
import { Link } from 'react-router-dom';
import { Button } from './ui/button';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { SetupChecklistList } from './SetupBlocker';

interface LayoutPrincipalProps {
  children: React.ReactNode;
}

const LayoutPrincipal: React.FC<LayoutPrincipalProps> = ({ children }) => {
  const { usuario, carregando, role, perfil, refetch, setupStatus } = useSessao();
  const navegar = useNavigate();

  const isClient = role === 'Cliente';
  const isClientUser =
    role === 'Usuario' &&
    perfil &&
    'cliente_id' in perfil &&
    Boolean((perfil as UsuarioProfile)?.cliente_id);
  const clienteProfile = perfil as ClienteProfile;
  const isPendingClient = isClient && !(clienteProfile?.aprovado);
  
  const dataFimAcesso = clienteProfile?.data_fim_acesso ? parseISO(clienteProfile.data_fim_acesso) : null;

  const isAccessExpired = isClient && clienteProfile?.aprovado && dataFimAcesso && isPast(dataFimAcesso);
  const isAccessBlocked = isClient && clienteProfile?.aprovado && dataFimAcesso === null;

  const perms = (perfil as any)?.permissoes || {};
  const hasOnlyFiscal = perms.emissao_nf === true && perms.contas_receber !== true && perms.contas_pagar !== true && perms.plano_contas !== true;

  const shouldShowSetupBanner =
    (isClient || isClientUser) && setupStatus && !setupStatus.isComplete && !hasOnlyFiscal;

  const shouldShowFirstLaunchNotice =
    (isClient || isClientUser) &&
    Boolean(setupStatus?.isComplete) &&
    !setupStatus?.firstLaunchCompleted && !hasOnlyFiscal;

  if (carregando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!usuario) {
    navegar('/login', { replace: true });
    return null;
  }

  if (isPendingClient) {
    return (
      <div className="flex flex-col min-h-screen w-full bg-background">
        <Header />
        <main className="flex-1 p-4 md:p-8 overflow-y-auto flex items-center justify-center w-full">
          <Card className="w-full max-w-lg text-center">
            <CardHeader>
              <CardTitle className="text-2xl">Aguardando Aprovação</CardTitle>
              <CardDescription className="mt-2">
                Sua empresa foi cadastrada e está aguardando a aprovação de um administrador. Você será notificado quando sua conta for ativada.
              </CardDescription>
            </CardHeader>
            <CardContent>
                {/* Adicionando o botão de Trial */}
                <TrialButton 
                    clienteProfile={clienteProfile} 
                    onTrialActivated={refetch} 
                />
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }
  
  if (isAccessExpired || isAccessBlocked) {
      return (
        <div className="flex flex-col min-h-screen w-full bg-background">
          <Header />
          <main className="flex-1 p-4 md:p-8 overflow-y-auto flex items-center justify-center w-full">
            <Card className="w-full max-w-lg text-center border-red-500">
              <CardHeader>
                <CardTitle className="text-2xl text-destructive">Acesso Bloqueado</CardTitle>
                <CardDescription className="mt-2">
                  {isAccessBlocked 
                    ? 'Seu acesso foi desativado pelo suporte. Entre em contato para reativar seu plano.'
                    : 'Seu período de acesso (Trial ou Plano) terminou. Para continuar utilizando o sistema, por favor, renove sua assinatura.'
                  }
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                  <Link to="/vendas">
                      <Button variant="default" className="w-full">
                          <Package className="w-4 h-4 mr-2" />
                          Renovar Assinatura
                      </Button>
                  </Link>
                  <Button variant="outline" className="w-full">
                      <Phone className="w-4 h-4 mr-2" />
                      Contatar Suporte
                  </Button>
              </CardContent>
            </Card>
          </main>
        </div>
      );
  }

  return (
    <div className="flex flex-col min-h-screen w-full bg-background">
      {/* Header Fixo no Topo */}
      <Header />
      
      {/* Banner de Trial (Aparece apenas para Clientes em Trial) */}
      <TrialBanner />
      {shouldShowSetupBanner && (
        <div className="px-4 md:px-8">
          <Alert variant="destructive" className="mb-4">
            <AlertTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Configuração inicial pendente
            </AlertTitle>
            <AlertDescription className="space-y-2">
              <p className="text-sm">
                Complete as etapas abaixo para liberar o painel e os lançamentos.
              </p>
              <SetupChecklistList missingSteps={setupStatus.missingSteps} compact />

              <div className="flex flex-wrap gap-2 pt-1">
                <Button variant="secondary" size="sm" asChild>
                  <Link to="/configuracoes">
                    <SettingsIcon className="h-4 w-4 mr-1" />
                    Abrir Configurações
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/plano-contas">Plano de Contas</Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/historicos">Históricos</Link>
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      )}
      
      {!shouldShowSetupBanner && shouldShowFirstLaunchNotice && (
        <div className="px-4 md:px-8">
          <Alert className="mb-4 border-primary/30 bg-primary/5">
            <AlertTitle className="flex items-center gap-2 text-primary">
              <Info className="h-4 w-4" />
              Lancamento inicial obrigatorio
            </AlertTitle>
            <AlertDescription className="space-y-2 text-sm">
              <p>
                Configuracao concluida! Antes de usar os modulos, registre o primeiro lancamento
                manual exigido pelo sistema:
              </p>
              <div className="rounded-md border border-primary/30 bg-background px-4 py-2 font-mono text-sm">
                D: Caixa/Banco<br />
                C: Capital Social
              </div>
              <p>
                Esse lancamento valida o saldo inicial e libera definitivamente o uso do sistema.
              </p>
              <div className="pt-1">
                <Button size="sm" asChild>
                  <Link to="/lancamentos">Fazer Lançamento</Link>
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* Conteúdo Principal (Rolável) */}
      <main className={cn("flex-1 p-4 md:p-8 w-full")}>
        {children}
      </main>
      
    </div>
  );
};

export default LayoutPrincipal;