import LayoutPrincipal from '@/components/LayoutPrincipal';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile, UsuarioProfile, AdminUsuarioProfile } from '@/types/usuario';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link, useNavigate } from 'react-router-dom';
import { Package, Loader2 } from 'lucide-react';
import DashboardFinanceiro from '@/components/DashboardFinanceiro';
import React, { useEffect } from 'react';

const Painel = () => {
  const { role, perfil, carregando } = useSessao();
  const navigate = useNavigate();

  // flags de permissões
  let hasFinancePermissions = false;
  let hasPontoPermission = false;
  let hasSuportePermission = false;
  let isClientApproved = true;

  // roles definidos no SessionContext
  const isAdmin = role === 'Admin';
  const isUsuarioDoAdmin = role === 'UsuarioDoAdmin';
  const isClient = role === 'Cliente';
  const isUsuarioDoCliente = role === 'UsuarioDoCliente';
  
  // Helper para garantir que as permissões sejam um objeto
  const getPermissoesFromPerfil = (p: any) => {
    if (!p) return {};
    if (p.permissoes && typeof p.permissoes === 'object') return p.permissoes;
    try {
      return JSON.parse(p.permissoes || '{}');
    } catch {
      return {};
    }
  };

  // Caso Admin → acesso total
  if (isAdmin) {
    hasFinancePermissions = true;
    hasPontoPermission = true;
    hasSuportePermission = true;
    isClientApproved = true;
  }

  // Usuário do Admin → obedece permissões do próprio registro admin_usuarios (visão herdada do admin)
  if (isUsuarioDoAdmin) {
    const perfilAdminUsuario = perfil as AdminUsuarioProfile;
    const permissoes = getPermissoesFromPerfil(perfilAdminUsuario);
    // Se o admin_usuario tiver permissoes explícitas, aplicamos
    hasFinancePermissions = !!(permissoes.contas_pagar || permissoes.contas_receber || permissoes.bancos || permissoes.conciliacao || permissoes.plano_contas || permissoes.importar || permissoes.relatorios);
    hasPontoPermission = !!(permissoes.folha_ponto || permissoes.visualizar_proprio_ponto || permissoes.ponto_eletronico);
    hasSuportePermission = !!permissoes.gestao_suporte;
    isClientApproved = true; // funcionário válido
    console.log('Painel: usuario do admin - permissoes:', permissoes);
  }

  // Cliente → suas permissões (tbl_clientes)
  if (isClient) {
    const clienteProfile = perfil as ClienteProfile;
    isClientApproved = clienteProfile?.aprovado ?? false;
    if (isClientApproved) {
      const permissoes = getPermissoesFromPerfil(clienteProfile);
      hasFinancePermissions = !!(permissoes.contas_pagar || permissoes.contas_receber || permissoes.bancos || permissoes.conciliacao || permissoes.plano_contas || permissoes.importar || permissoes.relatorios);
      hasPontoPermission = !!(permissoes.folha_ponto || permissoes.visualizar_proprio_ponto || permissoes.ponto_eletronico);
      hasSuportePermission = !!permissoes.gestao_suporte;
    }
  }

  // Usuario do Cliente → usa permissoes do seu perfil (tbl_usuarios)
  if (isUsuarioDoCliente) {
    const usuarioProfile = perfil as UsuarioProfile;
    const permissoes = getPermissoesFromPerfil(usuarioProfile);
    isClientApproved = true;
    hasFinancePermissions = !!(permissoes.contas_pagar || permissoes.contas_receber || permissoes.bancos || permissoes.conciliacao || permissoes.plano_contas || permissoes.importar || permissoes.relatorios);
    hasPontoPermission = !!(permissoes.folha_ponto || permissoes.visualizar_proprio_ponto || permissoes.ponto_eletronico);
    hasSuportePermission = !!permissoes.gestao_suporte;
    console.log('Painel: usuario do cliente - permissoes:', permissoes);
  }

  // Roteamento condicional
  useEffect(() => {
    if (carregando) return;
    // Usuários não vinculados não devem ser redirecionados
    if (!isClientApproved) return;

    // Admins e UsuárioDoAdmin ficam no painel administrativo se tiverem acesso
    if (isAdmin || isUsuarioDoAdmin) {
      // ficam no painel (acesso ao DashboardFinanceiro se for finance)
      return;
    }

    // UsuárioDoCliente: lógica de prioridades
    if (isUsuarioDoCliente) {
      if (hasFinancePermissions) return; // mantém no painel com dashboard financeiro
      if (hasSuportePermission) {
        navigate('/admin/suporte', { replace: true });
        return;
      }
      if (hasPontoPermission) {
        navigate('/folha-ponto?mode=self', { replace: true });
        return;
      }
      // sem permissões: fica no painel com mensagem de acesso restrito
    }
  }, [carregando, isAdmin, isUsuarioDoAdmin, isUsuarioDoCliente, isClientApproved, hasFinancePermissions, hasSuportePermission, hasPontoPermission, navigate]);

  if (carregando) {
    return (
      <LayoutPrincipal>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </LayoutPrincipal>
    );
  }

  const welcomeMessage = (isAdmin || isUsuarioDoAdmin) ? 'Painel Administrativo' : 'Fluxo de Caixa';

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

          {(isAdmin || isUsuarioDoAdmin || hasFinancePermissions) ? (
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
        <p className="text-lg text-muted-foreground">Aguardando aprovação da empresa.</p>
      )}
    </LayoutPrincipal>
  );
};

export default Painel;