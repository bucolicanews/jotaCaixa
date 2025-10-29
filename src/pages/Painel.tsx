import LayoutPrincipal from '@/components/LayoutPrincipal';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
      hasFinancePermissions = permissoes.contas_pagar || permissoes.contas_receber;
    }
  } else if (role === 'Usuario') {
    const usuarioProfile = perfil as UsuarioProfile;
    const permissoes = usuarioProfile?.permissoes || {};
    hasFinancePermissions = permissoes.contas_pagar || permissoes.contas_receber;
  }

  return (
    <LayoutPrincipal>
      <h1 className="text-2xl md:text-3xl font-bold mb-6">Painel de Controle</h1>
      
      {isClientApproved ? (
        <>
          <p className="text-lg text-muted-foreground mb-8">
            Bem-vindo ao {role === 'Admin' ? 'Painel Administrativo' : 'Fluxo de Caixa'}.
          </p>

          {hasFinancePermissions ? (
            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader><CardTitle className="text-xl font-semibold">Saldo Atual</CardTitle></CardHeader>
                <CardContent><p className="text-3xl mt-2 text-green-600">R$ 0,00</p></CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-xl font-semibold">Contas a Vencer (30 dias)</CardTitle></CardHeader>
                <CardContent><p className="text-3xl mt-2 text-red-600">R$ 0,00</p></CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-xl font-semibold">Conciliações Pendentes</CardTitle></CardHeader>
                <CardContent><p className="text-3xl mt-2 text-yellow-600">0</p></CardContent>
              </Card>
            </div>
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
        // Este caso já é tratado pelo LayoutPrincipal, mas mantemos a clareza
        <p className="text-lg text-muted-foreground">Aguardando aprovação da empresa.</p>
      )}
    </LayoutPrincipal>
  );
};

export default Painel;