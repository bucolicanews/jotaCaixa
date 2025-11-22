import LayoutPrincipal from '@/components/LayoutPrincipal';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile, UsuarioProfile, AdminUsuarioProfile } from '@/types/usuario';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { Package } from 'lucide-react';
import DashboardFinanceiro from '@/components/DashboardFinanceiro';

const Painel = () => {
  const { role, perfil } = useSessao();

  let hasFinancePermissions = false;
  let isClientApproved = true;

  if (role === 'Admin') {
    hasFinancePermissions = true; // Admin sempre tem acesso total
  } else if (role === 'Cliente') {
    const clienteProfile = perfil as ClienteProfile;
    isClientApproved = clienteProfile?.aprovado ?? false;
    if (isClientApproved) {
      const permissoes = clienteProfile?.permissoes || {};
      hasFinancePermissions = permissoes.contas_pagar || permissoes.contas_receber || permissoes.bancos;
    }
  } else if (role === 'Usuario') {
    const usuarioProfile = perfil as UsuarioProfile | AdminUsuarioProfile;
    
    // Se for AdminUsuarioProfile, ele é considerado aprovado se estiver vinculado
    if ('admin_id' in usuarioProfile && usuarioProfile.admin_id) {
        isClientApproved = true;
    } else if ('cliente_id' in usuarioProfile && usuarioProfile.cliente_id) {
        // Se for UsuarioProfile, assumimos que o cliente já foi aprovado (lógica no LayoutPrincipal)
        isClientApproved = true; 
    } else {
        // Usuário não vinculado
        isClientApproved = false;
    }
    
    const permissoes = usuarioProfile?.permissoes || {};
    hasFinancePermissions = permissoes.contas_pagar || permissoes.contas_receber || permissoes.bancos;
  }
  
  const isClient = role === 'Cliente';
  const isAdmin = role === 'Admin';

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
                <p className="text-muted-foreground">Você não possui permissões ativas para visualizar dados financeiros (Contas a Pagar ou Receber).</p>
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