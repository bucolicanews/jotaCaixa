import LayoutPrincipal from '@/components/LayoutPrincipal';
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Link2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import FormConciliacaoConfig from '@/components/formularios/FormConciliacaoConfig';
import HistoricoConciliacaoDialog from '@/components/conciliacao/HistoricoConciliacaoDialog';
import ModalMapeamentoParcela from '@/components/conciliacao/ModalMapeamentoParcela';
import ModalBuscaManualParcelas from '@/components/conciliacao/ModalBuscaManualParcelas';
import ModalCategorizacaoDireta from '@/components/conciliacao/ModalCategorizacaoDireta';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

import ConciliacaoHeader from '@/components/conciliacao/ConciliacaoHeader';
import Step1SelectAccount from '@/components/conciliacao/Step1SelectAccount';
import Step2SelectConfig from '@/components/conciliacao/Step2SelectConfig';
import Step3ImportFile from '@/components/conciliacao/Step3ImportFile';
import Step4MappingTable from '@/components/conciliacao/Step4MappingTable';
import HistoricoTab from '@/components/conciliacao/HistoricoTab';
import { useConciliacaoLogic } from '@/hooks/conciliacao/useConciliacaoLogic';
import { useHistoricoConciliacao } from '@/hooks/conciliacao/useHistoricoConciliacao';
import { useMapeamentoParcelas } from '@/hooks/conciliacao/useMapeamentoParcelas';
import { useBuscaManualParcelas } from '@/hooks/conciliacao/useBuscaManualParcelas';
import { useConciliacaoDireta } from '@/hooks/conciliacao/useConciliacaoDireta';
import { useSessao } from '@/hooks/use-sessao';

const Conciliacao = () => {
  const { role } = useSessao();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAdmin = role === 'Admin';
  
  const {
    loading,
    isSaving,
    activeTab,
    contas,
    configs,
    contasContabeis,
    contaSelecionadaId,
    configSelecionada,
    file,
    transacoes,
    transacoesSelecionadas,
    contaContabilLote,
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
    fetchConfigs,
  } = useConciliacaoLogic(true);

  const {
    historico,
    isDeletingHistorico,
    historicoSelecionado,
    historicoDetalhesOpen,
    fetchHistorico,
    handleDeleteHistorico,
    handleViewHistoricoDetails,
    setHistoricoDetalhesOpen,
  } = useHistoricoConciliacao();

  const {
    transacoesPendentes,
    transacaoAtual,
    candidatosAtuais,
    modalMapeamentoOpen,
    carregandoCandidatos,
    indiceAtual,
    fetchPendentes,
    iniciarMapeamento,
    handleConfirmarMapeamento,
    handlePularTransacao,
    handleVoltarTransacao,
    setModalMapeamentoOpen,
  } = useMapeamentoParcelas();

  const {
    modalBuscaManualOpen,
    handleAbrirBuscaManual,
    handleFecharBuscaManual,
    handleBuscarTodasParcelas,
    setModalBuscaManualOpen,
  } = useBuscaManualParcelas();

  const {
    modalCategorizacaoDiretaOpen,
    handleAbrirCategorizacaoDireta,
    handleFecharCategorizacaoDireta,
    handleConfirmarCategorizacaoDireta,
    setModalCategorizacaoDiretaOpen,
  } = useConciliacaoDireta(
      transacaoAtual,
      transacoesPendentes,
      (updater) => setTransacoesPendentes(updater(transacoesPendentes)),
      setTransacaoAtual,
      setIndiceAtual,
      setCarregandoCandidatos,
      setCandidatosAtuais,
      setModalMapeamentoOpen
  );
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [configParaEditar, setConfigParaEditar] = useState<any>(null);
  
  const dialogParam = searchParams.get('dialog');

  const clearDialogParam = useCallback(() => {
    if (searchParams.has('dialog')) {
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('dialog');
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (
      dialogParam === 'nova-configuracao' &&
      contaSelecionadaId &&
      proprietarioDaConfiguracao
    ) {
      setConfigParaEditar(null);
      setDialogOpen(true);
      clearDialogParam();
    }
  }, [dialogParam, contaSelecionadaId, proprietarioDaConfiguracao, clearDialogParam]);

  const handleDialogOpenChange = useCallback((open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      clearDialogParam();
    }
  }, [clearDialogParam]);

  useEffect(() => {
    if (proprietarioDaConfiguracao) {
      fetchPendentes();
    }
  }, [proprietarioDaConfiguracao, fetchPendentes]);

  const handleOpenConfigDialog = (config: any) => {
    setConfigParaEditar(config);
    setDialogOpen(true);
  };
  
  const handleConfigSaveComplete = () => {
    setDialogOpen(false);
    clearDialogParam();
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
      
      {transacoesPendentes.length > 0 && (
        <Card className="mb-6 border-l-4 border-orange-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center justify-between">
              <div className="flex items-center">
                <Link2 className="w-5 h-5 mr-2 text-orange-500" />
                Transações Pendentes de Mapeamento
              </div>
              <Badge variant="warning" className="text-lg px-3 py-1">
                {transacoesPendentes.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Existem transações de extrato que precisam ser vinculadas às parcelas de Contas a Receber ou Contas a Pagar.
            </p>
            <Button onClick={iniciarMapeamento} variant="default">
              <Link2 className="w-4 h-4 mr-2" />
              Mapear Agora
            </Button>
          </CardContent>
        </Card>
      )}
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="conciliacao">Nova Conciliação</TabsTrigger>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>
        
        <TabsContent value="conciliacao" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="space-y-6 lg:col-span-1">
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
                    <div className="lg:col-span-2">
                        <Step4MappingTable
                            transacoes={transacoes}
                            contasContabeis={contasContabeis}
                            transacoesSelecionadas={transacoesSelecionadas}
                            contaContabilLote={contaContabilLote}
                            isSaving={isSaving}
                            contaSelecionadaId={contaSelecionadaId}
                            onToggleSelection={handleToggleSelection}
                            onSelectAll={handleSelectAll}
                            onContaContabilChange={handleContaContabilChange}
                            onContaContabilLoteChange={handleContaContabilLoteChange}
                            onApplyLote={handleApplyLote}
                            onSaveConciliacao={handleSaveConciliacao}
                        />
                    </div>
                )}
            </div>
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
        <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{configParaEditar ? 'Editar' : 'Nova'} Configuração do Extrato</DialogTitle></DialogHeader>
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
      
      <ModalMapeamentoParcela
        open={modalMapeamentoOpen}
        onClose={() => setModalMapeamentoOpen(false)}
        transacao={transacaoAtual}
        candidatos={candidatosAtuais}
        onConfirmar={handleConfirmarMapeamento}
        onPular={handlePularTransacao}
        onVoltar={handleVoltarTransacao}
        totalPendentes={transacoesPendentes.length + indiceAtual - 1}
        indiceAtual={indiceAtual}
        carregando={carregandoCandidatos}
        onBuscarManual={handleAbrirBuscaManual}
        onConciliarDireta={handleAbrirCategorizacaoDireta}
        onBuscarTodasParcelas={handleBuscarTodasParcelas}
      />

      {transacaoAtual && (
        <>
          <ModalBuscaManualParcelas
            open={modalBuscaManualOpen}
            onClose={handleFecharBuscaManual}
            transacao={transacaoAtual}
            tipo={transacaoAtual.tipo === 'Entrada' ? 'CR' : 'CP'}
            onConfirmar={handleConfirmarMapeamento}
            isAdmin={isAdmin}
            ownerId={proprietarioDaConfiguracao || ''}
          />

          <ModalCategorizacaoDireta
            open={modalCategorizacaoDiretaOpen}
            onClose={handleFecharCategorizacaoDireta}
            transacao={transacaoAtual}
            candidatos={candidatosAtuais}
            loadingCandidatos={carregandoCandidatos}
            onConfirmarVinculo={handleConfirmarMapeamento}
            onConfirmarCategorizacao={handleConfirmarCategorizacaoDireta}
            ownerId={proprietarioDaConfiguracao || ''}
            isAdmin={isAdmin}
          />
        </>
      )}
    </LayoutPrincipal>
  );
};

export default Conciliacao;