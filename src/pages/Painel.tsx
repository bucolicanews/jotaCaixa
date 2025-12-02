import LayoutPrincipal from '@/components/LayoutPrincipal';
import RegistroPonto from '@/components/ponto/RegistroPonto';
import { useSessao } from '@/hooks/use-sessao';
import { UsuarioProfile, ClienteProfile, AdminUsuarioProfile } from '@/types/usuario';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link, useNavigate } from 'react-router-dom';
import { Package, Loader2 } from 'lucide-react';
import DashboardFinanceiro from '@/components/DashboardFinanceiro';
import React, { useEffect } from 'react';

const Painel = () => {
  const { role, perfil, carregando } = useSessao();
  const navigate = useNavigate();

  let hasFinancePermissions = false;
  let hasPontoPermission = false;
  let hasSuportePermission = false;
  let isClientApproved = true;
  
  const isClient = role === 'Cliente';
  const isAdmin = role === 'Admin';
  const isUsuario = role === 'Usuario';

  // 🔥 NOVO: Diferenciação de Usuário (Funcionário)
  const isUsuarioDoAdmin = 
    isUsuario && 
    perfil && 
    ('admin_id' in perfil) && 
    perfil.admin_id !== null;

  const isUsuarioDeCliente = 
    isUsuario &&
    perfil &&
    ('cliente_id' in perfil) &&
    perfil.cliente_id !== null;
  // FIM NOVO

  if (isAdmin || isUsuarioDoAdmin) { // 🔥 TRATA USUÁRIO DO ADMIN COMO ADMIN
    hasFinancePermissions = true;
    hasPontoPermission = true;
    hasSuportePermission = true;
    isClientApproved = true;
    if (isUsuarioDoAdmin) {
        console.log("Usuário do Admin detectado → Acesso total ao painel administrativo");
    }
  } else if (isClient) {
    const clienteProfile = perfil as ClienteProfile;
    isClientApproved = clienteProfile?.aprovado ?? false;
    if (isClientApproved) {
      const permissoes = clienteProfile?.permissoes || {};
      hasFinancePermissions = permissoes.contas_pagar || permissoes.contas_receber || permissoes.bancos || permissoes.conciliacao || permissoes.plano_contas || permissoes.importar || permissoes.relatorios;
    }
  } else if (isUsuarioDeCliente) { // 🔥 APENAS USUÁRIO DE CLIENTE
    const usuarioProfile = perfil as UsuarioProfile;
    
    // Verifica se o usuário está vinculado (tratado como aprovado se vinculado)
    isClientApproved = true; 
    
    // CRÍTICO: Garante que as permissões sejam lidas corretamente do perfil
    const permissoes = usuarioProfile?.permissoes || {};
    
    // Permissões Financeiras
    hasFinancePermissions = permissoes.contas_pagar || permissoes.contas_receber || permissoes.bancos || permissoes.conciliacao || permissoes.plano_contas || permissoes.importar || permissoes.relatorios;
    
    // Permissões de RH
    hasPontoPermission = permissoes.folha_ponto || permissoes.visualizar_proprio_ponto;
    
    // Permissões de Suporte
    hasSuportePermission = permissoes.gestao_suporte === true;

    // LOG DE DEBBUG
    console.log("DEBUG PAINEL: Role:", role, "Aprovado:", isClientApproved, "Permissões Financeiras:", hasFinancePermissions, "Permissões:", permissoes);
  }
  
  // --- Lógica de Roteamento Condicional para Usuários ---
  useEffect(() => {
      if (carregando || !isClientApproved || !isUsuario) return;
      
      // Se for Usuário do Admin, ele já tem acesso total e fica no painel
      if (isUsuarioDoAdmin) return;
      
      // 1. Prioridade Máxima: Financeiro (Se tiver permissão financeira, fica no painel)
      if (hasFinancePermissions) {
          // Fica no Painel para ver o DashboardFinanceiro
          return;
      }
      
      // 2. Prioridade Secundária: Gestão de Suporte (Se não for financeiro, mas tiver suporte)
      if (hasSuportePermission) {
          navigate('/admin/suporte', { replace: true });
          return;
      }
      
      // 3. Prioridade Terciária: Ponto Eletrônico (Se não for financeiro nem suporte, mas tiver ponto)
      if (hasPontoPermission) {
          navigate('/folha-ponto?mode=self', { replace: true });
          return;
      }
      
      // 4. Se não tiver nenhuma permissão relevante, fica no painel vazio.
      
  }, [carregando, isUsuario, isClientApproved, isUsuarioDoAdmin, hasSuportePermission, hasFinancePermissions, hasPontoPermission, navigate]);
  // ------------------------------------------------------


  if (carregando) {
    return (
      <LayoutPrincipal>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </LayoutPrincipal>
    );
  }
  
  // Se for usuário e estiver carregando a lógica de redirecionamento, mostra o loader
  if (isUsuario && isClientApproved && !hasFinancePermissions && (hasSuportePermission || hasPontoPermission)) {
      return (
        <LayoutPrincipal>
            <div className="flex justify-center items-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        </LayoutPrincipal>
      );
  }

  const welcomeMessage = isAdmin || isUsuarioDoAdmin ? 'Painel Administrativo' : 'Fluxo de Caixa';

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
      
      {isClientApproved ? (
        <>
          <p className="text-lg text-muted-foreground mb-8">
            Bem-vindo ao {welcomeMessage}.
          </p>

          {/* Renderiza o DashboardFinanceiro se for Admin OU Usuário do Admin OU se tiver permissões financeiras */}
          {isAdmin || isUsuarioDoAdmin || hasFinancePermissions ? (
            <DashboardFinanceiro />
          ) : (
            <Card className="mt-8">
              <CardHeader>
                <CardTitle>Acesso Restrito</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Você não possui permissões ativas para visualizar dados financeiros ou de gestão.</p>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        // Este caso só deve ser alcançado por um Cliente Pendente (que é tratado no LayoutPrincipal)
        <p className="text-lg text-muted-foreground">Aguardando aprovação da empresa.</p>
      )}
    </LayoutPrincipal>
  );
};

export default Painel;