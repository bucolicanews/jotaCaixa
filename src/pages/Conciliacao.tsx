import LayoutPrincipal from '@/components/LayoutPrincipal';
import { useState, useEffect, useCallback } from 'react';
import { useSessao } from '@/hooks/use-sessao';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { SaldoConta } from '@/types/saldo-conta';
import { ConfiguracaoConciliacao, TransacaoExtrato, ConciliacaoRegra, ConciliacaoHistorico } from '@/types/conciliacao';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import FormConciliacaoConfig from '@/components/FormConciliacaoConfig';
import Papa from 'papaparse';
import { PlanoContas } from '@/types/plano-contas';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';
import HistoricoConciliacaoDialog from '@/components/HistoricoConciliacaoDialog';

// Componentes Modulares
import ConciliacaoHeader from '@/components/conciliacao/ConciliacaoHeader';
import Step1SelectAccount from '@/components/conciliacao/Step1SelectAccount';
import Step2SelectConfig from '@/components/conciliacao/Step2SelectConfig';
import Step3ImportFile from '@/components/conciliacao/Step3ImportFile';
import Step4MappingTable from '@/components/conciliacao/Step4MappingTable';
import HistoricoTab from '@/components/conciliacao/HistoricoTab';

const Conciliacao = () => {
  const { usuario } = useSessao();
  const [contas, setContas] = useState<SaldoConta[]>([]);
  const [configs, setConfigs] = useState<ConfiguracaoConciliacao[]>([]);
  const [contasContabeis, setContasContabeis] = useState<PlanoContas[]>([]);
  const [historico, setHistorico] = useState<ConciliacaoHistorico[]>([]);
  
  const [contaSelecionadaId, setContaSelecionadaId] = useState<string | null>(null);
  const [configSelecionada, setConfigSelecionada] = useState<ConfiguracaoConciliacao | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [configParaEditar, setConfigParaEditar] = useState<ConfiguracaoConciliacao | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [transacoes, setTransacoes] = useState<TransacaoExtrato[]>([]);
  const [regras, setRegras] = useState<ConciliacaoRegra[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  
  const [transacoesSelecionadas, setTransacoesSelecionadas] = useState<number[]>([]);
  const [contaContabilLote, setContaContabilLote] = useState<string | null>(null);
  
  const [activeTab, setActiveTab] = useState('conciliacao');
  const [historicoDetalhesOpen, setHistoricoDetalhesOpen] = useState(false);
  const [historicoSelecionado, setHistoricoSelecionado] = useState<ConciliacaoHistorico | null>(null);

  const contaSelecionada = contas.find(c => c.id === contaSelecionadaId);
  const proprietarioDaConfiguracao = contaSelecionada?.empresa_id;

  // --- Funções de Busca de Dados ---

  const fetchContas = useCallback(async () => {
    if (!usuario?.id) return;
    setLoading(true);
    const { data, error } = await supabase.from('saldo_contas').select('*, conta_contabil_id').eq('empresa_id', usuario.id);
    if (error) showError('Erro ao carregar contas: ' + error.message);
    else setContas(data as SaldoConta[]);
    setLoading(false);
  }, [usuario]);

  const fetchConfigs = useCallback(async () => {
    if (!contaSelecionadaId) return;
    const { data, error } = await supabase.from('configuracao_conciliacao').select('*').eq('id_saldo_contas', contaSelecionadaId);
    if (error) showError('Erro ao carregar configurações: ' + error.message);
    else setConfigs(data as ConfiguracaoConciliacao[]);
  }, [contaSelecionadaId]);
  
  const fetchContasContabeis = useCallback(async () => {
    if (!proprietarioDaConfiguracao || !contaSelecionada) return;
    
    const { data, error } = await supabase
        .from('plano_contas')
        .select('id, Conta, Descricao, Analitica, is_conta_saldo, is_conta_resultado')
        .eq('proprietario_id', proprietarioDaConfiguracao)
        .eq('Analitica', 'Sim')
        .eq('is_conta_resultado', true)
        .order('Conta');
        
    if (error) {
        showError('Erro ao carregar Plano de Contas: ' + error.message);
        setContasContabeis([]);
    } else {
        const filteredContas = (data as PlanoContas[]).filter(c => 
            c.id !== contaSelecionada.conta_contabil_id
        );
        setContasContabeis(filteredContas);
    }
  }, [proprietarioDaConfiguracao, contaSelecionada]);
  
  const fetchRegras = useCallback(async () => {
    if (!proprietarioDaConfiguracao) return;
    const { data, error } = await supabase
        .from('conciliacao_regras')
        .select('*')
        .eq('proprietario_id', proprietarioDaConfiguracao);
    if (error) console.error('Erro ao carregar regras de conciliação:', error);
    else setRegras(data as ConciliacaoRegra[]);
  }, [proprietarioDaConfiguracao]);
  
  const fetchHistorico = useCallback(async () => {
    if (!usuario?.id) return;
    
    const { data, error } = await supabase
        .from('conciliacoes')
        .select(`
            *,
            saldo_contas:id_saldo_contas ( nome )
        `)
        .eq('empresa_id', usuario.id)
        .order('criado_em', { ascending: false });
        
    if (error) {
        showError('Erro ao carregar histórico de conciliações: ' + error.message);
        setHistorico([]);
    } else {
        setHistorico(data as ConciliacaoHistorico[]);
    }
  }, [usuario]);

  // --- Efeitos de Inicialização e Atualização ---

  useEffect(() => {
    fetchContas();
    fetchHistorico();
  }, [fetchContas, fetchHistorico]);
  
  useEffect(() => {
    if (contaSelecionadaId) {
        fetchContasContabeis();
        fetchRegras();
    }
  }, [contaSelecionadaId, fetchContasContabeis, fetchRegras]);

  useEffect(() => {
    fetchConfigs();
    setConfigSelecionada(null);
  }, [contaSelecionadaId, fetchConfigs]);

  // --- Lógica de Mapeamento e Processamento ---

  const applyRegras = useCallback((rawTransacoes: TransacaoExtrato[]): TransacaoExtrato[] => {
    return rawTransacoes.map(t => {
      // Se já foi marcada como duplicada, ignora a regra
      if (t.isDuplicated) return t;
      
      const regra = regras.find(r => 
        t.descricao.toLowerCase().includes(r.descricao_extrato.toLowerCase()) && r.tipo_lancamento === t.tipo
      );
      
      if (regra) {
        return { ...t, conciliada: true, conta_contabil_id: regra.conta_contabil_id };
      }
      return { ...t, conciliada: false, conta_contabil_id: null };
    });
  }, [regras]);

  const handleParseFile = async () => {
    if (!file || !configSelecionada || !contaSelecionadaId || !proprietarioDaConfiguracao) {
      showError('Selecione a conta, a configuração e o arquivo.');
      return;
    }
    const config = configSelecionada;
    
    setLoading(true);

    // 1. Buscar lançamentos existentes para a conta selecionada
    const { data: existingLancamentos, error: lancamentoError } = await supabase
        .from('lancamentos')
        .select('data_movimentacao, descricao, valor, tipo')
        .eq('conta_bancaria_id', contaSelecionadaId);
        
    if (lancamentoError) {
        showError('Erro ao buscar lançamentos existentes: ' + lancamentoError.message);
        setLoading(false);
        return;
    }
    
    // Cria o Set de chaves de unicidade (Data formatada, Descrição, Valor, Tipo)
    const existingSet = new Set(existingLancamentos.map(l => 
        `${format(new Date(l.data_movimentacao), 'yyyy-MM-dd')}|${l.descricao.toLowerCase().trim()}|${l.valor.toFixed(2)}|${l.tipo}`
    ));

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rawTransacoes: TransacaoExtrato[] = results.data.map((row: any) => {
          const valorStr = String(row[config.mapeamento.valor] || '0').replace(',', '.');
          let valor = parseFloat(valorStr);
          
          if (config.coluna_tipo_transacao && row[config.coluna_tipo_transacao] !== config.valor_credito) {
            valor = -Math.abs(valor);
          }
          
          const identificacao = config.mapeamento.identificacao 
            ? String(row[config.mapeamento.identificacao] || '') 
            : undefined;
            
          const tipo = (valor >= 0 ? 'Entrada' : 'Saida') as 'Entrada' | 'Saida';
          const dataMovimentacao = row[config.mapeamento.data];
          
          // Garante que a data importada seja formatada para yyyy-MM-dd para a chave de unicidade
          let formattedDate: string;
          try {
              // Tenta parsear a data do CSV (pode estar em dd/MM/yyyy ou yyyy-MM-dd)
              const dateParts = dataMovimentacao.split(/[\/\-]/);
              let dateObj: Date;
              
              if (dateParts.length === 3) {
                  // Assume dd/MM/yyyy se o primeiro componente for <= 31
                  if (Number(dateParts[0]) <= 31 && Number(dateParts[1]) <= 12) {
                      dateObj = new Date(Number(dateParts[2]), Number(dateParts[1]) - 1, Number(dateParts[0]));
                  } else {
                      // Assume yyyy-MM-dd
                      dateObj = new Date(Number(dateParts[0]), Number(dateParts[1]) - 1, Number(dateParts[2]));
                  }
              } else {
                  // Fallback para new Date()
                  dateObj = new Date(dataMovimentacao);
              }
              
              formattedDate = format(dateObj, 'yyyy-MM-dd');
          } catch (e) {
              console.error('Falha ao formatar data do CSV:', dataMovimentacao, e);
              formattedDate = dataMovimentacao; // Usa a string original como fallback
          }
          
          // Chave de unicidade para comparação
          const uniqueKey = `${formattedDate}|${String(row[config.mapeamento.descricao] || '').toLowerCase().trim()}|${Math.abs(valor).toFixed(2)}|${tipo}`;
          
          let isDuplicated = false;
          let motivoDuplicidade: string | null = null;
          
          if (existingSet.has(uniqueKey)) {
              isDuplicated = true;
              motivoDuplicidade = 'Transação já existe no histórico de lançamentos.';
          }

          return {
            data: dataMovimentacao, // Mantém a data original do CSV para exibição
            descricao: row[config.mapeamento.descricao],
            valor: valor,
            tipo: tipo,
            identificacao: identificacao,
            isDuplicated: isDuplicated,
            motivoDuplicidade: motivoDuplicidade,
          };
        }).filter(t => t.data && t.descricao);
        
        const transacoesValidas = rawTransacoes.filter(t => !t.isDuplicated);
        const transacoesRejeitadas = rawTransacoes.filter(t => t.isDuplicated);
        
        const transacoesMapeadas = applyRegras(transacoesValidas);
        
        setTransacoes([...transacoesMapeadas, ...transacoesRejeitadas]);
        setTransacoesSelecionadas([]);
        setContaContabilLote(null);
        
        showSuccess(`${transacoesValidas.length} transações válidas importadas. ${transacoesRejeitadas.length} duplicadas rejeitadas.`);
      },
      error: (err) => {
        showError('Erro ao processar o arquivo CSV: ' + err.message);
      }
    });
    setLoading(false);
  };

  const handleSaveConciliacao = async () => {
    if (!contaSelecionadaId || !proprietarioDaConfiguracao || !file) {
        showError('Conta bancária, proprietário ou arquivo não definidos.');
        return;
    }
    
    const transacoesParaSalvar = transacoes.filter(t => t.conta_contabil_id && !t.isDuplicated);
    
    if (transacoesParaSalvar.length === 0) {
        showError('Nenhuma transação mapeada para salvar.');
        return;
    }
    
    setIsSaving(true);
    
    try {
        const lancamentosPayload = transacoesParaSalvar.map(t => ({
            empresa_id: proprietarioDaConfiguracao,
            data_movimentacao: t.data,
            descricao: t.descricao,
            valor: Math.abs(t.valor),
            tipo: t.tipo,
            conta_bancaria_id: contaSelecionadaId,
            conta_contabil_id: t.conta_contabil_id,
            conciliado: true,
            origem: 'conciliacao_extrato',
            documento: t.identificacao || null,
        }));
        
        // 1. Inserir Lançamentos
        const { error: lancamentoError } = await supabase
            .from('lancamentos')
            .insert(lancamentosPayload);
            
        if (lancamentoError) throw lancamentoError;
        
        // 2. Inserir/Atualizar Regras de Mapeamento
        const regrasParaSalvar = transacoesParaSalvar
            .filter(t => !t.conciliada)
            .map(t => ({
                proprietario_id: proprietarioDaConfiguracao,
                descricao_extrato: t.descricao,
                conta_contabil_id: t.conta_contabil_id,
                tipo_lancamento: t.tipo,
            }));
            
        if (regrasParaSalvar.length > 0) {
            const { error: regraError } = await supabase
                .from('conciliacao_regras')
                .upsert(regrasParaSalvar, { onConflict: 'proprietario_id, descricao_extrato, tipo_lancamento' });
            
            if (regraError) console.error('Aviso: Falha ao salvar regras de mapeamento:', regraError);
        }
        
        // 3. Salvar o registro de conciliação (Histórico)
        const historicoPayload = {
            empresa_id: proprietarioDaConfiguracao,
            usuario_id: usuario?.id,
            id_saldo_contas: contaSelecionadaId,
            nome_arquivo: file.name,
            extrato_json: transacoesParaSalvar,
        };
        
        // Usando .insert() sem .select() para garantir que o objeto JSON seja salvo corretamente
        const { error: historicoError } = await supabase
            .from('conciliacoes')
            .insert(historicoPayload);
            
        if (historicoError) throw historicoError; // Lançar erro para notificar o usuário

        showSuccess(`${lancamentosPayload.length} lançamentos conciliados e salvos com sucesso!`);
        handleReset();
        fetchHistorico();
        
    } catch (error: any) {
        showError('Falha ao salvar conciliação: ' + error.message);
    } finally {
        setIsSaving(false);
    }
  };
  
  // --- Handlers de Estado ---

  const handleReset = () => {
    setContaSelecionadaId(null);
    setConfigSelecionada(null);
    setTransacoes([]);
    setTransacoesSelecionadas([]);
    setContaContabilLote(null);
    setFile(null);
    setActiveTab('conciliacao');
  };

  const handleSelectAccount = (id: string) => {
    setContaSelecionadaId(id);
    setTransacoes([]); // Limpa transações ao mudar de conta
    setFile(null);
  };

  const handleSelectConfig = (id: string) => {
    setConfigSelecionada(configs.find(c => c.id === id) || null);
    setTransacoes([]); // Limpa transações ao mudar de config
    setFile(null);
  };

  const handleOpenConfigDialog = (config: ConfiguracaoConciliacao | null) => {
    setConfigParaEditar(config);
    setDialogOpen(true);
  };
  
  const handleConfigSaveComplete = () => {
    setDialogOpen(false);
    fetchConfigs();
  };
  
  const handleFileChange = (newFile: File | null) => {
      setFile(newFile);
      setTransacoes([]);
  };
  
  const handleContaContabilChange = (index: number, contaContabilId: string) => {
    setTransacoes(prev => prev.map((t, i) => 
      i === index ? { ...t, conta_contabil_id: contaContabilId, conciliada: true } : t
    ));
  };
  
  const handleToggleSelection = (index: number, checked: boolean) => {
      setTransacoesSelecionadas(prev => {
          if (checked) {
              return [...prev, index];
          } else {
              return prev.filter(i => i !== index);
          }
      });
  };
  
  const handleSelectAll = (checked: boolean) => {
      const validIndexes = transacoes
          .map((t, i) => ({ t, i }))
          .filter(({ t }) => !t.isDuplicated)
          .map(({ i }) => i);
          
      if (checked) {
          setTransacoesSelecionadas(validIndexes);
      } else {
          setTransacoesSelecionadas([]);
      }
  };
  
  const handleApplyLote = () => {
      if (!contaContabilLote || transacoesSelecionadas.length === 0) {
          showError('Selecione uma conta contábil e pelo menos uma transação.');
          return;
      }
      
      setTransacoes(prev => prev.map((t, i) => {
          if (transacoesSelecionadas.includes(i)) {
              return { ...t, conta_contabil_id: contaContabilLote, conciliada: true };
          }
          return t;
      }));
      
      setTransacoesSelecionadas([]);
      setContaContabilLote(null);
      showSuccess(`${transacoesSelecionadas.length} transações mapeadas em lote.`);
  };
  
  const handleViewHistoricoDetails = (h: ConciliacaoHistorico) => {
      setHistoricoSelecionado(h);
      setHistoricoDetalhesOpen(true);
  };

  // --- Renderização ---

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
                        onContaContabilLoteChange={setContaContabilLote}
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
            />
        </TabsContent>
      </Tabs>
      
      {contaSelecionadaId && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
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