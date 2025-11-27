import React from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, PlusCircle } from 'lucide-react';
import FormLancamentoManual from '@/components/formularios/FormLancamentoManual';
import { useSessao } from '@/hooks/use-sessao';
import { ClienteProfile } from '@/types/usuario';

const Lancamentos: React.FC = () => {
  const { role, perfil } = useSessao();
  
  const canAccess = role === 'Admin' || (role === 'Cliente' && (perfil as ClienteProfile)?.permissoes?.plano_contas === true);

  if (!canAccess) {
    return (
      <LayoutPrincipal>
        <Card><CardHeader><CardTitle>Acesso Negado</CardTitle></CardHeader><CardContent><p>Você não tem permissão para realizar lançamentos contábeis.</p></CardContent></Card>
      </LayoutPrincipal>
    );
  }
  
  const handleSaveComplete = () => {
    // TODO: Adicionar lógica de recarga de dados se necessário
  };

  return (
    <LayoutPrincipal>
      <h1 className="text-2xl md:text-3xl font-bold mb-6 flex items-center">
        <DollarSign className="w-6 h-6 mr-2" /> Lançamentos Manuais
      </h1>
      
      <Card className="max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle className="text-xl flex items-center">
            <PlusCircle className="w-5 h-5 mr-2" /> Registrar Partida Dobrada
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FormLancamentoManual onSaveComplete={handleSaveComplete} />
        </CardContent>
      </Card>
    </LayoutPrincipal>
  );
};

export default Lancamentos;