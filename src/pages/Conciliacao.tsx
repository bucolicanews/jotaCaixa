import LayoutPrincipal from '@/components/LayoutPrincipal';
import { useState, useEffect, useCallback } from 'react';
import { Loader2, Link2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import FormConciliacaoConfig from '@/components/formularios/FormConciliacaoConfig';
import HistoricoConciliacaoDialog from '@/components/conciliacao/HistoricoConciliacaoDialog';
import ModalMapeamentoParcela from '@/components/conciliacao/ModalMapeamentoParcela';
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
import { useConciliacao } from '@/hooks/useConciliacao';
import { useSessao } from '@/hooks/use-sessao';
import { formatCurrency } from '@/utils/formatters';
import { showError, showSuccess } from '@/utils/toast';
import { 
  buscarParcelasCandidatas, 
  confirmarMapeamento, 
  buscarTransacoesPendentes,
  ParcelaCandidato,
  TransacaoComId 
} from '@/hooks/conciliacao/useMapeamentoParcelas';

const Conciliacao = () => {
  const { role } = useSessao();
  const isAdmin = role === 'Admin';
  
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
  } = useConciliacao(true);
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [configParaEditar, setConfigParaEditar] = useState<any>(null);
  
  const [transacoesPendentes, setTransacoesPendentes] = useState<TransacaoComId[]>([]);
  const [transacaoAtual, setTransacaoAtual] = useState<TransacaoComId | null>(null);
  const [candidatosAtuais, setCandidatosAtuais] = useState<ParcelaCandidato[]>([]);
  const [modalMapeamentoOpen, setModalMapeamentoOpen] = useState(false);
  const [carregandoCandidatos, setCarregandoCandidatos] = useState(false);
  const [indiceAtual, setIndiceAtual] = useState(1);
  const [historicoMapeamento, setHistoricoMapeamento] = useState<TransacaoComId[]>([]);

  const fetchPendentes = useCallback(async () => {
    if (!proprietarioDaConfiguracao) return;
    const pendentes = await buscarTransacoesPendentes(proprietarioDaConfiguracao);
    setTransacoesPendentes(pendentes);
  }, [proprietarioDaConfiguracao]);

  useEffect(() => {
    if (proprietarioDaConfiguracao) {
      fetchPendentes();
    }
  }, [proprietarioDaConfiguracao, fetchPendentes]);

  const iniciarMapeamento = useCallback(async () => {
    if (transacoesPendentes.length === 0) return;

    const primeira = transacoesPendentes[0];
    setTransacaoAtual(primeira);
    setIndiceAtual(1);
    setCarregandoCandidatos(true);
    setModalMapeamentoOpen(true);

    try {
      const candidatos = await buscarParcelasCandidatas(primeira, proprietarioDaConfiguracao!, isAdmin);
      setCandidatosAtuais(candidatos);
    } catch (error) {
      console.error('Erro ao buscar candidatos:', error);
      setCandidatosAtuais([]);
    } finally {
      setCarregandoCandidatos(false);
    }
  }, [transacoesPendentes, proprietarioDaConfiguracao, isAdmin]);

  const handleConfirmarMapeamento = useCallback(async (parcelaId: string) => {
    if (!transacaoAtual || !proprietarioDaConfiguracao) return;

    const tipo = transacaoAtual.tipo === 'Entrada' ? 'CR' : 'CP';
    const result = await confirmarMapeamento(transacaoAtual.id, parcelaId, tipo, isAdmin, proprietarioDaConfiguracao);

    if (result.needsAccountSelection) {
      showError(
        `Saldo insuficiente na conta "${result.contaAtualNome}". ` +
        `Saldo: ${formatCurrency(result.saldoAtual || 0)}, ` +
        `Valor necessário: ${formatCurrency((result.saldoAtual || 0) + (result.valorFaltante || 0))}. ` +
        `Faltam: ${formatCurrency(result.valorFaltante || 0)}. ` +
        `Adicione saldo ou registre o pagamento manualmente pela tela de Contas a Pagar.`
      );
      return;
    }

    if (!result.success) {
      showError('Erro ao mapear: ' + result.error);
      return;
    }

    showSuccess('Mapeamento confirmado e parcela quitada!');
    
    const novasPendentes = transacoesPendentes.filter(t => t.id !== transacaoAtual.id);
    setTransacoesPendentes(novasPendentes);

    if (novasPendentes.length > 0) {
      const proxima = novasPendentes[0];
      setTransacaoAtual(proxima);
      setIndiceAtual(prev => prev + 1);
      setCarregandoCandidatos(true);
      
      try {
        const candidatos = await buscarParcelasCandidatas(proxima, proprietarioDaConfiguracao!, isAdmin);
        setCandidatosAtuais(candidatos);
      } catch (error) {
        setCandidatosAtuais([]);
      } finally {
        setCarregandoCandidatos(false);
      }
    } else {
      setModalMapeamentoOpen(false);
      showSuccess('Todas as transações foram mapeadas!');
    }
  }, [transacaoAtual, transacoesPendentes, proprietarioDaConfiguracao, isAdmin]);

  const handlePularTransacao = useCallback(async () => {
    const restantes = transacoesPendentes.filter(t => t.id !== transacaoAtual?.id);
    setTransacoesPendentes(restantes);

    if (restantes.length > 0) {
      if (transacaoAtual) {
        setHistoricoMapeamento([...historicoMapeamento, transacaoAtual]);
      }
      const proxima = restantes[0];
      setTransacaoAtual(proxima);
      setIndiceAtual(prev => prev + 1);
      setCarregandoCandidatos(true);
      
      try {
        const candidatos = await buscarParcelasCandidatas(proxima, proprietarioDaConfiguracao!, isAdmin);
        setCandidatosAtuais(candidatos);
      } catch (error) {
        setCandidatosAtuais([]);
      } finally {
        setCarregandoCandidatos(false);
      }
    } else {
      setModalMapeamentoOpen(false);
    }
  }, [transacoesPendentes, transacaoAtual, proprietarioDaConfiguracao, isAdmin, historicoMapeamento]);

  const handleVoltarTransacao = useCallback(async () => {
    if (historicoMapeamento.length === 0) return;

    const anterior = historicoMapeamento[historicoMapeamento.length - 1];
    setHistoricoMapeamento(historicoMapeamento.slice(0, -1));
    
    setTransacaoAtual(anterior);
    setIndiceAtual(prev => Math.max(1, prev - 1));
    setTransacoesPendentes([anterior, ...transacoesPendentes]);
    setCarregandoCandidatos(true);

    try {
      const candidatos = await buscarParcelasCandidatas(anterior, proprietarioDaConfiguracao!, isAdmin);
      setCandidatosAtuais(candidatos);
    } catch (error) {
      setCandidatosAtuais([]);
    } finally {
      setCarregandoCandidatos(false);
    }
  }, [historicoMapeamento, transacoesPendentes, proprietarioDaConfiguracao, isAdmin]);

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
            {/* NOVO LAYOUT DE DUAS COLUNAS: lg:grid-cols-3 para a estrutura principal */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* COLUNA ESQUERDA: Passos de Configuração (Ocupa 1/3 no desktop) */}
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
                
                {/* COLUNA DIREITA: Tabela de Mapeamento (Ocupa 2/3 no desktop) */}
                {transacoes.length > 0 && (
                    <div className="lg:col-span-2">
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
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
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
      
      <ModalMapeamentoParcela
        open={modalMapeamentoOpen}
        onOpenChange={setModalMapeamentoOpen}
        transacao={transacaoAtual}
        candidatos={candidatosAtuais}
        onConfirmar={handleConfirmarMapeamento}
        onPular={handlePularTransacao}
        onVoltar={handleVoltarTransacao}
        totalPendentes={transacoesPendentes.length + indiceAtual - 1}
        indiceAtual={indiceAtual}
        carregando={carregandoCandidatos}
      />
    </LayoutPrincipal>
  );
};

export default Conciliacao;