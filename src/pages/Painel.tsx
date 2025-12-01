import LayoutPrincipal from '@/components/LayoutPrincipal';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile, UsuarioProfile, AdminUsuarioProfile } from '@/types/usuario';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link, useNavigate } from 'react-router-dom';
import { Package, Loader2 } from 'lucide-react';
import DashboardFinanceiro from '@/components/DashboardFinanceiro';
import React, { useEffect } from 'react'; // Importando useEffect

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

  if (isAdmin) {
    hasFinancePermissions = true;
  } else if (isClient) {
    const clienteProfile = perfil as ClienteProfile;
    isClientApproved = clienteProfile?.aprovado ?? false;
    if (isClientApproved) {
      const permissoes = clienteProfile?.permissoes || {};
      hasFinancePermissions = permissoes.contas_pagar || permissoes.contas_receber || permissoes.bancos || permissoes.conciliacao || permissoes.plano_contas;
    }
  } else if (isUsuario) {
    const usuarioProfile = perfil as UsuarioProfile | AdminUsuarioProfile;
    
    // Verifica se o usuário está vinculado (tratado como aprovado se vinculado)
    if (('admin_id' in usuarioProfile && usuarioProfile.admin_id) || ('cliente_id' in usuarioProfile && usuarioProfile.cliente_id)) {
        isClientApproved = true; 
    } else {
        isClientApproved = false;
    }
    
    const permissoes = usuarioProfile?.permissoes || {};
    
    // Permissões Financeiras
    hasFinancePermissions = permissoes.contas_pagar || permissoes.contas_receber || permissoes.bancos || permissoes.conciliacao || permissoes.plano_contas;
    
    // Permissões de RH
    hasPontoPermission = permissoes.folha_ponto || permissoes.visualizar_proprio_ponto;
    
    // Permissões de Suporte
    hasSuportePermission = permissoes.gestao_suporte === true;
  }
  
  // --- Lógica de Roteamento Condicional para Usuários ---
  useEffect(() => {
      if (carregando || !isClientApproved || !isUsuario) return;
      
      // 1. Prioridade Máxima: Gestão de Suporte
      if (hasSuportePermission) {
          navigate('/admin/suporte', { replace: true });
          return;
      }
      
      // 2. Prioridade Secundária: Financeiro (Se tiver permissão financeira, fica no painel)
      if (hasFinancePermissions) {
          // Fica no Painel para ver o DashboardFinanceiro
          return;
      }
      
      // 3. Prioridade Terciária: Ponto Eletrônico (Se tiver apenas permissão de ponto)
      if (hasPontoPermission) {
          navigate('/folha-ponto?mode=self', { replace: true });
          return;
      }
      
      // 4. Se não tiver nenhuma permissão relevante, fica no painel vazio (ou redireciona para o perfil)
      // Mantemos no painel para exibir a mensagem de acesso restrito.
      
  }, [carregando, isUsuario, isClientApproved, hasSuportePermission, hasFinancePermissions, hasPontoPermission, navigate]);
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
  if (isUsuario && isClientApproved && (hasSuportePermission || hasPontoPermission)) {
      return (
        <LayoutPrincipal>
            <div className="flex justify-center items-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        </LayoutPrincipal>
      );
  }

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
            Bem-vindo ao {isAdmin ? 'Painel Administrativo' : 'Fluxo de Caixa'}.
          </p>

          {/* Renderiza o DashboardFinanceiro se for Admin OU se tiver permissões financeiras */}
          {isAdmin || hasFinancePermissions ? (
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