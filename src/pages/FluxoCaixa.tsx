import React, { useState } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { useSessao } from '@/hooks/use-sessao';
import { Loader2, TrendingUp, PlusCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import useSaldoContaCalculado from '@/hooks/use-saldo-conta-calculado';
import FluxoCaixaDetalhe from '@/components/contabilidade/FluxoCaixaDetalhe';
import { ClienteProfile, UsuarioProfile, AdminUsuarioProfile } from '@/types/usuario';
import { useOwnerBranding } from '@/hooks/use-owner-branding';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import FormMovimentacaoDiretaDialog from '@/components/formularios/FormMovimentacaoDiretaDialog'; // IMPORT ADICIONADO
import { useOwner } from '@/hooks/use-owner'; // NOVO IMPORT

const FluxoCaixa: React.FC = () => {
  const { usuario, perfil, role, carregando: carregandoSessao } = useSessao();
  const { ownerId } = useOwner(); // USANDO useOwner
  const { logoUrl, ownerName } = useOwnerBranding();
  const [dialogAberto, setDialogAberto] = useState(false);
  
  const empresaId = ownerId; // USANDO ownerId

  // Usamos o hook de saldo calculado para obter todas as contas e o saldo total
  const { contas, totalSaldo, carregando: carregandoSaldos, refetch: refetchSaldos } = useSaldoContaCalculado(
      'todos', 
      'todos', 
      '', 
      'bancos', // ESCOPO: Apenas contas marcadas como Caixa/Banco
      false // isBancoOnly: false (queremos Caixa E Banco)
  );

  const handleSaveComplete = () => {
    setDialogAberto(false);
    refetchSaldos(); // Recarrega os saldos e o detalhe do fluxo de caixa
  };

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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
  <h1 className="text-3xl font-bold flex items-center" >
             <TrendingUp className="w-6 h-6 mr-2" />Fluxo de Caixa
        </h1>
        
        <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto">
              <PlusCircle className="w-4 h-4 mr-2" />
              Nova Movimentação
            </Button>
          </DialogTrigger>
          {/* Usando o FormMovimentacaoDiretaDialog para encapsular o formulário */}
          <FormMovimentacaoDiretaDialog onSaveComplete={handleSaveComplete} open={dialogAberto} onOpenChange={setDialogAberto} />
        </Dialog>
      </div>
      
      <FluxoCaixaDetalhe 
        empresaId={empresaId}
        contas={contas}
        totalSaldo={totalSaldo}
        logoUrl={logoUrl}
        ownerName={ownerName}
        refetchSaldos={refetchSaldos}
      />
    </LayoutPrincipal>
  );
};

export default FluxoCaixa;