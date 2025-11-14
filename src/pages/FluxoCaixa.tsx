import React from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { useSessao } from '@/hooks/use-sessao';
import { Loader2, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import useSaldoContaCalculado from '@/hooks/use-saldo-conta-calculado';
import FluxoCaixaDetalhe from '@/components/contabilidade/FluxoCaixaDetalhe';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';

const FluxoCaixa: React.FC = () => {
  const { usuario, perfil, role, carregando: carregandoSessao } = useSessao();
  
  const getEmpresaId = () => {
    if (role === 'Admin') return usuario?.id || null;
    if (role === 'Cliente') return (perfil as ClienteProfile)?.id || null;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id || null; // FIX: proprietario_id -> cliente_id
    return null;
  };
  
  const empresaId = getEmpresaId();
  
  // Usamos o hook de saldo calculado para obter todas as contas e o saldo total
  const { contas, totalSaldo, carregando: carregandoSaldos } = useSaldoContaCalculado('todos', 'todos', '', 'bancos');

  if (carregandoSessao || carregandoSaldos) {
    return (
      <LayoutPrincipal>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </LayoutPrincipal>
    );
  }
  
  if (!empresaId) {
    return (
      <LayoutPrincipal>
        <Card><CardHeader><CardTitle>Acesso Negado</CardTitle></CardHeader><CardContent><p>Você não está vinculado a uma empresa para visualizar o fluxo de caixa.</p></CardContent></Card>
      </LayoutPrincipal>
    );
  }

  return (
    <LayoutPrincipal>
      <h1 className="text-2xl md:text-3xl font-bold mb-6 flex items-center">
        <TrendingUp className="w-6 h-6 mr-2" /> Relatório de Fluxo de Caixa
      </h1>
      
      <FluxoCaixaDetalhe 
        empresaId={empresaId}
        contas={contas}
        totalSaldo={totalSaldo}
      />
    </LayoutPrincipal>
  );
};

export default FluxoCaixa;