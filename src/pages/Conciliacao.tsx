import LayoutPrincipal from '@/components/LayoutPrincipal';
import { useState, useEffect, useCallback } from 'react';
import { useSessao } from '@/hooks/use-sessao';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { SaldoConta } from '@/types/saldo-conta';
import { ConfiguracaoConciliacao, TransacaoExtrato } from '@/types/conciliacao';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { PlusCircle, Upload, List, Settings, Edit } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import FormConciliacaoConfig from '@/components/FormConciliacaoConfig';
import { Input } from '@/components/ui/input';
import Papa from 'papaparse';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const Conciliacao = () => {
  const { usuario } = useSessao();
  const [contas, setContas] = useState<SaldoConta[]>([]);
  const [configs, setConfigs] = useState<ConfiguracaoConciliacao[]>([]);
  const [contaSelecionadaId, setContaSelecionadaId] = useState<string | null>(null);
  const [configSelecionada, setConfigSelecionada] = useState<ConfiguracaoConciliacao | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [configParaEditar, setConfigParaEditar] = useState<ConfiguracaoConciliacao | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [transacoes, setTransacoes] = useState<TransacaoExtrato[]>([]);

  const fetchContas = useCallback(async () => {
    if (!usuario?.id) return;
    setLoading(true);
    const { data, error } = await supabase.from('saldo_contas').select('*').eq('empresa_id', usuario.id);
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

  useEffect(() => {
    fetchContas();
  }, [fetchContas]);

  useEffect(() => {
    fetchConfigs();
    setConfigSelecionada(null); // Reseta a config selecionada ao trocar de conta
  }, [contaSelecionadaId, fetchConfigs]);

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
        const parsedData: TransacaoExtrato[] = results.data.map((row: any) => {
          const valorStr = String(row[config.mapeamento.valor] || '0').replace(',', '.');
          let valor = parseFloat(valorStr);
          
          if (config.coluna_tipo_transacao && row[config.coluna_tipo_transacao] !== config.valor_credito) {
            valor = -Math.abs(valor);
          }

          return {
            data: row[config.mapeamento.data],
            descricao: row[config.mapeamento.descricao],
            valor: valor,
            tipo: (valor >= 0 ? 'Entrada' : 'Saida') as 'Entrada' | 'Saida',
          };
        }).filter(t => t.data && t.descricao);
        
        setTransacoes(parsedData);
        showSuccess(`${parsedData.length} transações importadas com sucesso!`);
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
            <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Descrição</TableHead><TableHead>Tipo</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
            <TableBody>
              {transacoes.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center h-24">Nenhuma transação importada.</TableCell></TableRow>
              ) : (
                transacoes.map((t, i) => (
                  <TableRow key={i}>
                    <TableCell>{t.data}</TableCell>
                    <TableCell>{t.descricao}</TableCell>
                    <TableCell><Badge variant={t.tipo === 'Entrada' ? 'success' : 'destructive'}>{t.tipo}</Badge></TableCell>
                    <TableCell className={cn("text-right font-semibold", t.tipo === 'Entrada' ? 'text-green-600' : 'text-red-600')}>{formatCurrency(t.valor)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );

  const contaSelecionada = contas.find(c => c.id === contaSelecionadaId);
  const proprietarioDaConta = contaSelecionada?.empresa_id;

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
        {transacoes.length > 0 && renderStep4()}
      </div>
      {contaSelecionadaId && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>{configParaEditar ? 'Editar' : 'Nova'} Configuração de Mapeamento</DialogTitle></DialogHeader>
            <FormConciliacaoConfig 
              configInicial={configParaEditar}
              idSaldoContas={contaSelecionadaId} 
              proprietarioId={proprietarioDaConta}
              onSaveComplete={() => { setDialogOpen(false); fetchConfigs(); }} 
            />
          </DialogContent>
        </Dialog>
      )}
    </LayoutPrincipal>
  );
};

export default Conciliacao;