import { useState, useMemo } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { useSessao } from '@/hooks/use-sessao';
import { PlanoContas } from '@/types/plano-contas';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import FormPlanoContas from '@/components/formularios/FormPlanoContas';
import { usePlanoContasData } from '@/hooks/use-plano-contas-data';
import PlanoContasHeader from '@/components/contabilidade/PlanoContasHeader';
import PlanoContasFilters from '@/components/contabilidade/PlanoContasFilters';
import PlanoContasTable from '@/components/contabilidade/PlanoContasTable';

// Tipo para inicializar o formulário de nova conta
interface NovaContaInicial {
    Conta: string;
    Analitica: 'Sim' | 'Não';
}

// Tipo para os dados que o FormPlanoContas realmente precisa para inicializar
type FormInitialData = PlanoContas | (NovaContaInicial & {
    codigo_reduzido: string;
    Descricao: string;
    is_conta_caixa_banco: boolean;
    is_conta_patrimonial: boolean;
    is_conta_resultado: boolean;
});


const PlanoContasPage = () => {
  const { carregando: carregandoSessao } = useSessao();
  
  // Hook de dados e lógica
  const {
    contas,
    carregando,
    proprietarioId,
    mascaraAtiva,
    refetch,
    filtroTexto,
    setFiltroTexto,
    filtroTipoConta,
    setFiltroTipoConta,
    filtroAnalitica,
    setFiltroAnalitica,
    handleDelete,
    handleSaveSuccess,
  } = usePlanoContasData();
  
  // Estados de UI para o formulário
  const [dialogAberto, setDialogAberto] = useState(false);
  const [contaSelecionada, setContaSelecionada] = useState<PlanoContas | null>(null);
  const [novaContaInicial, setNovaContaInicial] = useState<NovaContaInicial | null>(null);

  const handleNewAccount = () => {
    setContaSelecionada(null);
    setNovaContaInicial(null);
    setDialogAberto(true);
  };
  
  const handleEdit = (conta: PlanoContas) => {
    setContaSelecionada(conta);
    setNovaContaInicial(null);
    setDialogAberto(true);
  };

  const handleSaveComplete = () => {
    setDialogAberto(false);
    setContaSelecionada(null);
    setNovaContaInicial(null);
    handleSaveSuccess(); // Chama o refetch do hook
  };
  
  // Determina os valores iniciais do formulário de diálogo
  const initialFormValues: PlanoContas | FormInitialData | null = useMemo(() => {
    if (contaSelecionada) return contaSelecionada;
    if (novaContaInicial) {
        return { 
            Conta: novaContaInicial.Conta, 
            Analitica: novaContaInicial.Analitica,
            codigo_reduzido: '', 
            Descricao: '', 
            is_conta_caixa_banco: false,
            is_conta_patrimonial: false,
            is_conta_resultado: false 
        } as FormInitialData;
    }
    return null;
  }, [contaSelecionada, novaContaInicial]);


  if (carregandoSessao) {
    return (
      <LayoutPrincipal>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </LayoutPrincipal>
    );
  }

  if (!proprietarioId) {
    return (
      <LayoutPrincipal>
        <Card>
          <CardHeader>
            <CardTitle>Plano de Contas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-500">Não foi possível carregar o ID da empresa/proprietário. Verifique se o usuário está vinculado.</p>
          </CardContent>
        </Card>
      </LayoutPrincipal>
    );
  }

  return (
    <LayoutPrincipal>
      
      <PlanoContasHeader 
        onNewAccount={handleNewAccount} 
        onImportComplete={refetch} 
      />

      <div className="space-y-6">
        
        <PlanoContasFilters
            filtroTexto={filtroTexto}
            setFiltroTexto={setFiltroTexto}
            filtroTipoConta={filtroTipoConta}
            setFiltroTipoConta={setFiltroTipoConta}
            filtroAnalitica={filtroAnalitica}
            setFiltroAnalitica={setFiltroAnalitica}
            mascaraAtiva={mascaraAtiva}
        />

        <PlanoContasTable
            contas={contas}
            carregando={carregando}
            mascaraAtiva={mascaraAtiva}
            handleEdit={handleEdit}
            handleDelete={handleDelete}
            handleInlineSaveSuccess={handleSaveSuccess}
            setContaSelecionada={setContaSelecionada}
            setNovaContaInicial={setNovaContaInicial}
            setDialogAberto={setDialogAberto}
        />
      </div>
      
      {/* Diálogo de Criação/Edição */}
      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{(initialFormValues as PlanoContas)?.id ? 'Editar Conta' : 'Nova Conta'}</DialogTitle>
          </DialogHeader>
          <FormPlanoContas 
            proprietarioId={proprietarioId}
            contaInicial={initialFormValues as PlanoContas | null}
            onSaveComplete={handleSaveComplete}
          />
        </DialogContent>
      </Dialog>
    </LayoutPrincipal>
  );
};

export default PlanoContasPage;