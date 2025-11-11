import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, BookOpen } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import FormPlanoContas from '@/components/formularios/FormPlanoContas';
import ImportarPlanoContas from '@/components/contabilidade/ImportarPlanoContas';
import PlanoContasFilters from '@/components/contabilidade/PlanoContasFilters';
import PlanoContasTable from '@/components/contabilidade/PlanoContasTable';
import { usePlanoContasData } from '@/hooks/use-plano-contas-data';

const PlanoContasPage = () => {
  const {
    // Dados e Estado
    contas,
    carregandoContas,
    proprietarioId,
    mascaraAtiva,
    
    // Filtros
    filtroTexto, setFiltroTexto,
    filtroTipoConta, setFiltroTipoConta,
    filtroAnalitica, setFiltroAnalitica,
    
    // Ações de Formulário
    contaSelecionada,
    setContaSelecionada,
    novaContaInicial,
    setNovaContaInicial,
    dialogAberto, setDialogAberto,
    handleSaveComplete,
    handleEdit,
    handleDelete,
    refreshData,
    
    // Ações Hierárquicas
    contaClicada,
    popoverOpen, setPopoverOpen,
    handleContaClick,
    handleNovaContaAbaixo,
    handleNovaContaNivel,
  } = usePlanoContasData();

  const handleImportComplete = () => {
    refreshData();
  };
  
  const handleInlineSaveSuccess = () => {
    refreshData();
  };

  return (
    <LayoutPrincipal>
      <h1 className="text-2xl md:text-3xl font-bold mb-6 flex items-center">
        <BookOpen className="w-6 h-6 mr-2" /> Plano de Contas
      </h1>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-xl font-medium">
            Contas Contábeis ({contas.length})
          </CardTitle>
          <div className="flex space-x-2">
            <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
              <DialogTrigger asChild>
                <Button 
                  size="sm" 
                  className="h-8 gap-1"
                  onClick={() => {
                    setContaSelecionada(null);
                    setNovaContaInicial(null);
                  }}
                >
                  <PlusCircle className="h-4 w-4" />
                  <span className="hidden sm:inline">Nova Conta</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                  <DialogTitle>{contaSelecionada ? 'Editar Conta' : 'Cadastrar Nova Conta'}</DialogTitle>
                </DialogHeader>
                {proprietarioId && (
                  <FormPlanoContas 
                    proprietarioId={proprietarioId}
                    initialData={contaSelecionada || novaContaInicial}
                    onSaveSuccess={handleSaveComplete}
                    mascaraAtiva={mascaraAtiva}
                  />
                )}
              </DialogContent>
            </Dialog>
            
            {proprietarioId && (
              <ImportarPlanoContas 
                proprietarioId={proprietarioId} 
                onImportComplete={handleImportComplete} 
              />
            )}
          </div>
        </CardHeader>
        <CardContent>
          
          <PlanoContasFilters
            filtroTexto={filtroTexto}
            setFiltroTexto={setFiltroTexto}
            filtroTipoConta={filtroTipoConta}
            setFiltroTipoConta={setFiltroTipoConta}
            filtroAnalitica={filtroAnalitica}
            setFiltroAnalitica={setFiltroAnalitica}
          />
          
          <PlanoContasTable
            contas={contas}
            carregandoContas={carregandoContas}
            handleContaClick={handleContaClick}
            handleEdit={handleEdit}
            handleDelete={handleDelete}
            handleInlineSaveSuccess={handleInlineSaveSuccess}
            
            contaClicada={contaClicada}
            popoverOpen={popoverOpen}
            setPopoverOpen={setPopoverOpen}
            handleNovaContaAbaixo={handleNovaContaAbaixo}
            handleNovaContaNivel={handleNovaContaNivel}
          />
          
        </CardContent>
      </Card>
    </LayoutPrincipal>
  );
};

export default PlanoContasPage;