import LayoutPrincipal from '@/components/LayoutPrincipal';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import FormConciliacaoConfig from '@/components/formularios/FormConciliacaoConfig';
import HistoricoConciliacaoDialog from '@/components/HistoricoConciliacaoDialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Componentes Modulares
import ConciliacaoHeader from '@/components/conciliacao/ConciliacaoHeader';
import Step1SelectAccount from '@/components/conciliacao/Step1SelectAccount';
import Step2SelectConfig from '@/components/conciliacao/Step2SelectConfig';
import Step3ImportFile from '@/components/conciliacao/Step3ImportFile';
import Step4MappingTable from '@/components/conciliacao/Step4MappingTable';
import HistoricoTab from '@/components/conciliacao/HistoricoTab';
import { useConciliacao } from '@/hooks/useConciliacao';

const Conciliacao = () => {
  const {
    loading,
    isSaving,
    isDeletingHistorico,
    activeTab,
    contas,
    configs,
    contasContabeis,
    historico,
    contaSelecionadaId,
    configSelecionada,
    file,
    transacoes,
    transacoesSelecionadas,
    contaContabilLote,
    historicoSelecionado,
    historicoDetalhesOpen,
    proprietarioDaConfiguracao,
    
    setActiveTab,
    handleReset,
    handleSelectAccount,
    handleSelectConfig,
    handleFileChange,
    handleParseFile,
    handleContaContabilChange,
    handleToggleSelection,
    handleSelectAll,
    handleContaContabilLoteChange,
    handleApplyLote,
    handleSaveConciliacao,
    handleDeleteHistorico,
    handleViewHistoricoDetails,
    setHistoricoDetalhesOpen,
    fetchConfigs,
  } = useConciliacao();
  
  // Estado local para o diálogo de configuração (para edição/criação)
  const [dialogOpen, setDialogOpen] = useState(false);
  const [configParaEditar, setConfigParaEditar] = useState<any>(null);

  const handleOpenConfigDialog = (config: any) => {
    setConfigParaEditar(config);
    setDialogOpen(true);
  };
  
  const handleConfigSaveComplete = () => {
    setDialogOpen(false);
    fetchConfigs();
  };

  if (loading) {
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
      <ConciliacaoHeader onReset={handleReset} />
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="conciliacao">Nova Conciliação</TabsTrigger>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>
        
        <TabsContent value="conciliacao" className="mt-4">
            {/* Ajustado para grid-cols-1 em mobile e md:grid-cols-3 em desktop */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Step1SelectAccount
                    contas={contas}
                    loading={loading}
                    onSelectAccount={handleSelectAccount}
                    contaSelecionadaId={contaSelecionadaId}
                />
                
                {contaSelecionadaId && (
                    <Step2SelectConfig
                        configs={configs}
                        configSelecionada={configSelecionada}
                        onSelectConfig={handleSelectConfig}
                        onOpenDialog={handleOpenConfigDialog}
                    />
                )}
                
                {configSelecionada && (
                    <Step3ImportFile
                        file={file}
                        loading={loading}
                        onFileChange={handleFileChange}
                        onProcessFile={handleParseFile}
                    />
                )}
            </div>
            
            {transacoes.length > 0 && (
                <div className="mt-6">
                    <Step4MappingTable
                        transacoes={transacoes}
                        contasContabeis={contasContabeis}
                        transacoesSelecionadas={transacoesSelecionadas}
                        contaContabilLote={contaContabilLote}
                        isSaving={isSaving}
                        onToggleSelection={handleToggleSelection}
                        onSelectAll={handleSelectAll}
                        onContaContabilChange={handleContaContabilChange}
                        onContaContabilLoteChange={handleContaContabilLoteChange}
                        onApplyLote={handleApplyLote}
                        onSaveConciliacao={handleSaveConciliacao}
                    />
                </div>
            )}
        </TabsContent>
        
        <TabsContent value="historico" className="mt-4">
            <HistoricoTab 
                historico={historico}
                onViewDetails={handleViewHistoricoDetails}
                onDeleteAll={handleDeleteHistorico}
                isDeleting={isDeletingHistorico}
            />
        </TabsContent>
      </Tabs>
      
      {contaSelecionadaId && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          {/* Ajustado para sm:max-w-lg para melhor responsividade */}
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{configParaEditar ? 'Editar' : 'Nova'} Configuração de Mapeamento</DialogTitle></DialogHeader>
            <FormConciliacaoConfig 
              configInicial={configParaEditar}
              idSaldoContas={contaSelecionadaId} 
              proprietarioId={proprietarioDaConfiguracao}
              onSaveComplete={handleConfigSaveComplete} 
            />
          </DialogContent>
        </Dialog>
      )}
      
      <HistoricoConciliacaoDialog
        historico={historicoSelecionado}
        open={historicoDetalhesOpen}
        onOpenChange={setHistoricoDetalhesOpen}
      />
    </LayoutPrincipal>
  );
};

export default Conciliacao;