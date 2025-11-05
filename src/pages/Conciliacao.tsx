import LayoutPrincipal from '@/components/LayoutPrincipal';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSessao } from '@/hooks/use-sessao';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { SaldoConta } from '@/types/saldo-conta';
import { ConfiguracaoConciliacao, TransacaoExtrato, ConciliacaoRegra } from '@/types/conciliacao';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { PlusCircle, Upload, List, Settings, Edit, CheckCircle2, Save, ArrowUpCircle, ArrowDownCircle, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import FormConciliacaoConfig from '@/components/FormConciliacaoConfig';
import { Input } from '@/components/ui/input';
import Papa from 'papaparse';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { PlanoContas } from '@/types/plano-contas';

const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const Conciliacao = () => {
  const { usuario } = useSessao();
  const [contas, setContas] = useState<SaldoConta[]>([]);
  const [configs, setConfigs] = useState<ConfiguracaoConciliacao[]>([]);
  const [contasContabeis, setContasContabeis] = useState<PlanoContas[]>([]);
  const [contaSelecionadaId, setContaSelecionadaId] = useState<string | null>(null);
  const [configSelecionada, setConfigSelecionada] = useState<ConfiguracaoConciliacao | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [configParaEditar, setConfigParaEditar] = useState<ConfiguracaoConciliacao | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [transacoes, setTransacoes] = useState<TransacaoExtrato[]>([]);
  const [regras, setRegras] = useState<ConciliacaoRegra[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // CORREÇÃO: O proprietário da configuração deve ser o ID do cliente (empresa_id) da conta selecionada.
  const contaSelecionada = contas.find(c => c.id === contaSelecionadaId);
  const proprietarioDaConfiguracao = contaSelecionada?.empresa_id;

  const fetchContas = useCallback(async () => {
    if (!usuario?.id) return;
    setLoading(true);
    // INCLUINDO conta_contabil_id na seleção
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
    
    // Busca apenas contas analíticas do proprietário que são marcadas como CONTA DE RESULTADO
    const { data, error } = await supabase
        .from('plano_contas')
        .select('id, Conta, Descricao, Analitica, is_conta_saldo, is_conta_resultado')
        .eq('proprietario_id', proprietarioDaConfiguracao)
        .eq('Analitica', 'Sim')
        .eq('is_conta_resultado', true) // FILTRO PRINCIPAL: Apenas contas marcadas como Resultado
        .order('Conta');
        
    if (error) {
        showError('Erro ao carregar Plano de Contas: ' + error.message);
        setContasContabeis([]);
    } else {
        // Filtra as contas: exclui a conta contábil que está vinculada à conta de saldo selecionada
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

  useEffect(() => {
    fetchContas();
  }, [fetchContas]);
  
  useEffect(() => {
    // Re-busca contas contábeis e regras quando a conta selecionada muda
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
          
          // Extrai a identificação se a coluna estiver mapeada
          const identificacao = config.mapeamento.identificacao 
            ? String(row[config.mapeamento.identificacao] || '') 
            : undefined;

          return {
            data: row[config.mapeamento.data],
            descricao: row[config.mapeamento.descricao],
            valor: valor,
            tipo: (valor >= 0 ? 'Entrada' : 'Saida') as 'Entrada' | 'Saida',
            identificacao: identificacao, // Adiciona a identificação
          };
        }).filter(t => t.data && t.descricao);
        
        const transacoesMapeadas = applyRegras(rawTransacoes);
        
        setTransacoes(transacoesMapeadas);
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
      i === index ? { ...t, conta_contabil_id: contaContabilId } : t
    ));
  };
  
  const handleSaveConciliacao = async () => {
    if (!contaSelecionadaId || !proprietarioDaConfiguracao) {
        showError('Conta bancária ou proprietário não definidos.');
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
            documento: t.identificacao || null, // NOVO: Salva a identificação no campo documento
        }));
        
        // 1. Inserir Lançamentos
        const { error: lancamentoError } = await supabase
            .from('lancamentos')
            .insert(lancamentosPayload);
            
        if (lancamentoError) throw lancamentoError;
        
        // 2. Inserir/Atualizar Regras de Mapeamento (apenas para as transações que foram mapeadas manualmente)
        const regrasParaSalvar = transacoesParaSalvar
            .filter(t => !t.conciliada) // Apenas as que foram mapeadas manualmente agora
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
        
        showSuccess(`${lancamentosPayload.length} lançamentos conciliados e salvos com sucesso!`);
        setTransacoes([]); // Limpa a lista após salvar
        fetchRegras(); // Atualiza as regras
        
    } catch (error: any) {
        showError('Falha ao salvar conciliação: ' + error.message);
    } finally {
        setIsSaving(false);
    }
  };

  const transacoesNaoConciliadas = useMemo(() => transacoes.filter(t => !t.conciliada), [transacoes]);

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
        <div className="overflow-y-auto max-h-[400px] border rounded-md">
          <Table>
            <TableHeader><TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Identificação</TableHead> {/* NOVO CABEÇALHO */}
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="w-[250px]">Conta Contábil</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {transacoes.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center h-24">Nenhuma transação importada.</TableCell></TableRow>
              ) : (
                transacoes.map((t, i) => {
                    const isMapeada = !!t.conta_contabil_id;
                    const contaContabil = contasContabeis.find(c => c.id === t.conta_contabil_id);
                    
                    return (
                        <TableRow key={i} className={cn(isMapeada ? 'bg-green-500/10' : 'bg-red-500/10')}>
                            <TableCell>{t.data}</TableCell>
                            <TableCell>{t.descricao}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{t.identificacao || '-'}</TableCell> {/* NOVO CAMPO */}
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

  return (
    <LayoutPrincipal>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">Conciliação Bancária</h1>
        <Button variant="outline" onClick={() => { setContaSelecionadaId(null); setConfigSelecionada(null); setTransacoes([]); }}><Settings className="w-4 h-4 mr-2" /> Reiniciar</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {renderStep1()}
        {contaSelecionadaId && renderStep2()}
        {configSelecionada && renderStep3()}
      </div>
      {transacoes.length > 0 && renderStep4()}
      
      {contaSelecionadaId && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>{configParaEditar ? 'Editar' : 'Nova'} Configuração de Mapeamento</DialogTitle></DialogHeader>
            <FormConciliacaoConfig 
              configInicial={configParaEditar}
              idSaldoContas={contaSelecionadaId} 
              proprietarioId={proprietarioDaConfiguracao} // Agora passa o ID do cliente/empresa
              onSaveComplete={() => { setDialogOpen(false); fetchConfigs(); }} 
            />
          </DialogContent>
        </Dialog>
      )}
    </LayoutPrincipal>
  );
};

export default Conciliacao;