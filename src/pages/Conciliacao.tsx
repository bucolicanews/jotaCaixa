import LayoutPrincipal from '@/components/LayoutPrincipal';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSessao } from '@/hooks/use-sessao';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { SaldoConta } from '@/types/saldo-conta';
import { ConfiguracaoConciliacao, TransacaoExtrato, ConciliacaoRegra, ConciliacaoHistorico } from '@/types/conciliacao';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { PlusCircle, Upload, List, Settings, Edit, CheckCircle2, Save, ArrowUpCircle, ArrowDownCircle, Loader2, Check, History, Eye } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import FormConciliacaoConfig from '@/components/FormConciliacaoConfig';
import { Input } from '@/components/ui/input';
import Papa from 'papaparse';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { PlanoContas } from '@/types/plano-contas';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import HistoricoConciliacaoDialog from '@/components/HistoricoConciliacaoDialog';

const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const formatTimestamp = (dateString: string) => format(new Date(dateString), 'dd/MM/yyyy HH:mm', { locale: ptBR });

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

  const applyRegras = useCallback((rawTransacoes: TransacaoExtrato[]): TransacaoExtrato[] => {
    return rawTransacoes.map(t => {
      const regra = regras.find(r => 
        t.descricao.toLowerCase().includes(r.descricao_extrato.toLowerCase()) && r.tipo_lancamento === t.tipo
      );
      
      if (regra) {
        return { ...t, conciliada: true, conta_contabil_id: regra.conta_contabil_id };
      }
      return { ...t, conciliada: false, conta_contabil_id: null };
    });
  }, [regras]);

  const handleParseFile = () => {
    if (!file || !configSelecionada) {
      showError('Selecione um arquivo e uma configuração.');
      return;
    }
    const config = configSelecionada;

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

          return {
            data: row[config.mapeamento.data],
            descricao: row[config.mapeamento.descricao],
            valor: valor,
            tipo: (valor >= 0 ? 'Entrada' : 'Saida') as 'Entrada' | 'Saida',
            identificacao: identificacao,
          };
        }).filter(t => t.data && t.descricao);
        
        const transacoesMapeadas = applyRegras(rawTransacoes);
        
        setTransacoes(transacoesMapeadas);
        setTransacoesSelecionadas([]);
        setContaContabilLote(null);
        showSuccess(`${transacoesMapeadas.length} transações importadas. ${transacoesMapeadas.filter(t => t.conciliada).length} mapeadas automaticamente.`);
      },
      error: (err) => {
        showError('Erro ao processar o arquivo CSV: ' + err.message);
      }
    });
  };

  const handleOpenDialog = (config: ConfiguracaoConciliacao | null) => {
    setConfigParaEditar(config);
    setDialogOpen(true);
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
  
  const handleSelectAll = (checked: boolean) => {
      if (checked) {
          setTransacoesSelecionadas(transacoes.map((_, i) => i));
      } else {
          setTransacoesSelecionadas([]);
      }
  };
  
  const handleSaveConciliacao = async () => {
    if (!contaSelecionadaId || !proprietarioDaConfiguracao || !file) {
        showError('Conta bancária, proprietário ou arquivo não definidos.');
        return;
    }
    
    const transacoesParaSalvar = transacoes.filter(t => t.conta_contabil_id);
    
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
            id_saldo_contas: contaSelecionadaId, // Usando a coluna correta
            nome_arquivo: file.name,
            extrato_json: transacoesParaSalvar, // Salva apenas as transações que foram salvas como lançamentos
        };
        
        const { error: historicoError } = await supabase
            .from('conciliacoes')
            .insert(historicoPayload);
            
        if (historicoError) console.error('Aviso: Falha ao salvar histórico de conciliação:', historicoError);
        
        showSuccess(`${lancamentosPayload.length} lançamentos conciliados e salvos com sucesso!`);
        setTransacoes([]);
        setTransacoesSelecionadas([]);
        setContaContabilLote(null);
        fetchRegras();
        fetchHistorico(); // Atualiza o histórico
        
    } catch (error: any) {
        showError('Falha ao salvar conciliação: ' + error.message);
    } finally {
        setIsSaving(false);
    }
  };

  const transacoesNaoConciliadas = useMemo(() => transacoes.filter(t => !t.conta_contabil_id), [transacoes]);

  const renderStep1 = () => (
    <Card>
      <CardHeader><CardTitle>Passo 1: Selecione a Conta Bancária</CardTitle></CardHeader>
      <CardContent>
        <Select onValueChange={setContaSelecionadaId} disabled={loading}>
          <SelectTrigger><SelectValue placeholder={loading ? "Carregando..." : "Selecione a conta para conciliar"} /></SelectTrigger>
          <SelectContent>{contas.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
        </Select>
      </CardContent>
    </Card>
  );

  const renderStep2 = () => (
    <Card>
      <CardHeader>
        <CardTitle>Passo 2: Configuração de Importação</CardTitle>
        <CardDescription>Selecione ou crie um mapeamento para o formato do seu extrato CSV.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Select 
          onValueChange={(id) => setConfigSelecionada(configs.find(c => c.id === id) || null)} 
          value={configSelecionada?.id || ''}
        >
          <SelectTrigger><SelectValue placeholder="Selecione uma configuração" /></SelectTrigger>
          <SelectContent>{configs.map(c => <SelectItem key={c.id} value={c.id}>{c.nome_configuracao}</SelectItem>)}</SelectContent>
        </Select>
        <div className="flex space-x-2">
          <Button variant="outline" onClick={() => handleOpenDialog(null)} className="w-full">
            <PlusCircle className="w-4 h-4 mr-2" /> Nova
          </Button>
          <Button variant="secondary" onClick={() => handleOpenDialog(configSelecionada)} className="w-full" disabled={!configSelecionada}>
            <Edit className="w-4 h-4 mr-2" /> Editar
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderStep3 = () => (
    <Card>
      <CardHeader><CardTitle>Passo 3: Importar Extrato</CardTitle></CardHeader>
      <CardContent className="flex items-center space-x-2">
        <Input type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] || null)} className="flex-1" />
        <Button onClick={handleParseFile} disabled={!file}><Upload className="w-4 h-4 mr-2" /> Processar</Button>
      </CardContent>
    </Card>
  );

  const renderStep4 = () => (
    <Card className="col-span-1 md:col-span-3">
      <CardHeader><CardTitle className="flex items-center"><List className="w-5 h-5 mr-2" /> Transações Importadas do Extrato</CardTitle></CardHeader>
      <CardContent>
        
        <div className="flex flex-col md:flex-row items-center space-y-3 md:space-y-0 md:space-x-4 p-3 bg-secondary rounded-md mb-4">
            <div className="flex-1 w-full">
                <Select 
                    onValueChange={setContaContabilLote}
                    value={contaContabilLote || undefined}
                    disabled={isSaving || transacoesSelecionadas.length === 0}
                >
                    <SelectTrigger className="h-10 text-sm">
                        <SelectValue placeholder="Aplicar Conta Contábil em Lote" />
                    </SelectTrigger>
                    <SelectContent>
                        {contasContabeis.map(c => (
                            <SelectItem key={c.id} value={c.id}>
                                {c.Conta} - {c.Descricao}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <Button 
                onClick={handleApplyLote} 
                disabled={isSaving || !contaContabilLote || transacoesSelecionadas.length === 0}
                className="w-full md:w-auto"
            >
                <Check className="w-4 h-4 mr-2" /> Aplicar ({transacoesSelecionadas.length})
            </Button>
        </div>
        
        <div className="overflow-y-auto max-h-[400px] border rounded-md">
          <Table>
            <TableHeader><TableRow>
                <TableHead className="w-[40px] text-center">
                    <Checkbox 
                        checked={transacoesSelecionadas.length === transacoes.length && transacoes.length > 0}
                        onCheckedChange={(checked) => handleSelectAll(!!checked)}
                        disabled={isSaving}
                    />
                </TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Identificação</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="w-[250px]">Conta Contábil</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {transacoes.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center h-24">Nenhuma transação importada.</TableCell></TableRow>
              ) : (
                transacoes.map((t, i) => {
                    const isMapeada = !!t.conta_contabil_id;
                    const contaContabil = contasContabeis.find(c => c.id === t.conta_contabil_id);
                    const isSelected = transacoesSelecionadas.includes(i);
                    
                    return (
                        <TableRow key={i} className={cn(isMapeada ? 'bg-green-500/10' : 'bg-red-500/10', isSelected && 'bg-blue-100/50 dark:bg-blue-900/20')}>
                            <TableCell className="text-center">
                                <Checkbox 
                                    checked={isSelected}
                                    onCheckedChange={(checked) => handleToggleSelection(i, !!checked)}
                                    disabled={isSaving}
                                />
                            </TableCell>
                            <TableCell>{t.data}</TableCell>
                            <TableCell>{t.descricao}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{t.identificacao || '-'}</TableCell>
                            <TableCell>
                                <Badge variant={t.tipo === 'Entrada' ? 'success' : 'destructive'} className="flex items-center justify-center">
                                    {t.tipo === 'Entrada' ? <ArrowUpCircle className="w-3 h-3 mr-1" /> : <ArrowDownCircle className="w-3 h-3 mr-1" />}
                                    {t.tipo}
                                </Badge>
                            </TableCell>
                            <TableCell className={cn("text-right font-semibold", t.tipo === 'Entrada' ? 'text-green-600' : 'text-red-600')}>{formatCurrency(Math.abs(t.valor))}</TableCell>
                            <TableCell>
                                {isMapeada ? (
                                    <span className="text-sm font-medium text-green-700 flex items-center">
                                        <CheckCircle2 className="w-4 h-4 mr-1" /> {contaContabil?.Conta} - {contaContabil?.Descricao}
                                    </span>
                                ) : (
                                    <Select 
                                        onValueChange={(id) => handleContaContabilChange(i, id)}
                                        value={t.conta_contabil_id || undefined}
                                        disabled={isSaving}
                                    >
                                        <SelectTrigger className="h-8 text-xs">
                                            <SelectValue placeholder="Mapear para Conta Contábil" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {contasContabeis.map(c => (
                                                <SelectItem key={c.id} value={c.id}>
                                                    {c.Conta} - {c.Descricao}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            </TableCell>
                        </TableRow>
                    );
                })
              )}
            </TableBody>
          </Table>
        </div>
        
        <div className="flex justify-between items-center pt-4 border-t">
            <p className="text-sm text-muted-foreground">
                {transacoesNaoConciliadas.length} transações pendentes de mapeamento.
            </p>
            <Button 
                onClick={handleSaveConciliacao} 
                disabled={isSaving || transacoes.filter(t => t.conta_contabil_id).length === 0}
            >
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Salvar Lançamentos Conciliados
            </Button>
        </div>
      </CardContent>
    </Card>
  );
  
  const renderHistorico = () => (
    <Card className="col-span-1 md:col-span-3">
        <CardHeader>
            <CardTitle className="flex items-center"><History className="w-5 h-5 mr-2" /> Histórico de Conciliações</CardTitle>
            <CardDescription>Registros de extratos importados e conciliados.</CardDescription>
        </CardHeader>
        <CardContent>
            <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Data Conciliação</TableHead>
                            <TableHead>Conta Bancária</TableHead>
                            <TableHead>Nome do Arquivo</TableHead>
                            <TableHead className="text-right">Transações Salvas</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {historico.length === 0 ? (
                            <TableRow><TableCell colSpan={5} className="text-center h-24">Nenhum histórico encontrado.</TableCell></TableRow>
                        ) : (
                            historico.map(h => (
                                <TableRow key={h.id}>
                                    <TableCell>{formatTimestamp(h.criado_em)}</TableCell>
                                    <TableCell className="font-medium">{h.saldo_contas?.nome || 'N/A'}</TableCell>
                                    <TableCell className="font-mono text-sm">{h.nome_arquivo}</TableCell>
                                    <TableCell className="text-right">{h.extrato_json?.length || 0}</TableCell>
                                    <TableCell className="text-right">
                                        <Button 
                                            variant="outline" 
                                            size="sm" 
                                            onClick={() => { setHistoricoSelecionado(h); setHistoricoDetalhesOpen(true); }}
                                        >
                                            <Eye className="w-4 h-4 mr-2" /> Detalhes
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </CardContent>
    </Card>
  );

  return (
    <LayoutPrincipal>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">Conciliação Bancária</h1>
        <Button variant="outline" onClick={() => { setContaSelecionadaId(null); setConfigSelecionada(null); setTransacoes([]); setActiveTab('conciliacao'); }}><Settings className="w-4 h-4 mr-2" /> Reiniciar</Button>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="conciliacao">Nova Conciliação</TabsTrigger>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>
        
        <TabsContent value="conciliacao" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {renderStep1()}
                {contaSelecionadaId && renderStep2()}
                {configSelecionada && renderStep3()}
            </div>
            {transacoes.length > 0 && renderStep4()}
        </TabsContent>
        
        <TabsContent value="historico" className="mt-4">
            {renderHistorico()}
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
              onSaveComplete={() => { setDialogOpen(false); fetchConfigs(); }} 
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