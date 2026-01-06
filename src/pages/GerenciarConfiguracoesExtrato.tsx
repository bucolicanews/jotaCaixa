import { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Edit, Trash2, PlusCircle, Search, Settings } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useDebounce } from '@/hooks/use-debounce';
import { ConfiguracaoConciliacao } from '@/types/conciliacao';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useOwner } from '@/hooks/use-owner';
import FormConciliacaoConfig from '@/components/formularios/FormConciliacaoConfig';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

interface SaldoConta {
  id: string;
  nome: string;
}

const GerenciarConfiguracoesExtrato: React.FC = () => {
  const { carregando: carregandoSessao } = useSessao();
  const { ownerId } = useOwner();
  
  const [configuracoes, setConfiguracoes] = useState<(ConfiguracaoConciliacao & { saldo_contas?: { nome: string } | null })[]>([]);
  const [saldoContas, setSaldoContas] = useState<SaldoConta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [configSelecionada, setConfigSelecionada] = useState<ConfiguracaoConciliacao | null>(null);
  const [filtroTexto, setFiltroTexto] = useState('');
  const filtroTextoDebounced = useDebounce(filtroTexto, 500);
  const [contaSelecionadaId, setContaSelecionadaId] = useState<string>('');

  const proprietarioId = ownerId;

  const buscarSaldoContas = useCallback(async () => {
    if (!proprietarioId) return;
    
    const { data, error } = await supabase
      .from('saldo_contas')
      .select('id, nome')
      .eq('proprietario_id', proprietarioId)
      .order('nome');
    
    if (error) {
      showError('Erro ao carregar contas: ' + error.message);
    } else {
      setSaldoContas(data || []);
    }
  }, [proprietarioId]);

  const buscarConfiguracoes = useCallback(async () => {
    if (!proprietarioId) {
      setCarregando(false);
      return;
    }
    setCarregando(true);
    
    let query = supabase
      .from('configuracao_conciliacao')
      .select('*, saldo_contas(nome)')
      .eq('proprietario_id', proprietarioId)
      .order('nome_configuracao', { ascending: true });
      
    if (filtroTextoDebounced) {
      query = query.ilike('nome_configuracao', `%${filtroTextoDebounced}%`);
    }

    const { data, error } = await query;

    if (error) {
      showError('Erro ao carregar configurações: ' + error.message);
      setConfiguracoes([]);
    } else {
      setConfiguracoes(data as any[]);
    }
    setCarregando(false);
  }, [proprietarioId, filtroTextoDebounced]);

  useEffect(() => {
    if (!carregandoSessao && proprietarioId) {
      buscarConfiguracoes();
      buscarSaldoContas();
    }
  }, [carregandoSessao, proprietarioId, buscarConfiguracoes, buscarSaldoContas]);

  const handleNovo = () => {
    setConfigSelecionada(null);
    setContaSelecionadaId('');
    setDialogAberto(true);
  };

  const handleEditar = (config: ConfiguracaoConciliacao) => {
    setConfigSelecionada(config);
    setContaSelecionadaId(config.id_saldo_contas);
    setDialogAberto(true);
  };

  const handleDeletar = async (id: string) => {
    const { error } = await supabase.from('configuracao_conciliacao').delete().eq('id', id);
    if (error) {
      showError('Erro ao deletar: ' + error.message);
    } else {
      showSuccess('Configuração deletada com sucesso!');
      buscarConfiguracoes();
    }
  };

  const handleSaveComplete = () => {
    setDialogAberto(false);
    setConfigSelecionada(null);
    setContaSelecionadaId('');
    buscarConfiguracoes();
  };

  if (carregandoSessao || !proprietarioId) {
    return (
      <LayoutPrincipal>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </LayoutPrincipal>
    );
  }

  return (
    <LayoutPrincipal>
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center">
              <Settings className="w-5 h-5 mr-2" />
              Configurações de Extrato
            </CardTitle>
            <Button onClick={handleNovo}>
              <PlusCircle className="w-4 h-4 mr-2" /> Nova Configuração
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome..."
                value={filtroTexto}
                onChange={(e) => setFiltroTexto(e.target.value)}
                className="pl-10"
              />
            </div>

            {carregando ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : configuracoes.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhuma configuração encontrada.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Conta Bancária</TableHead>
                    <TableHead>Coluna Data</TableHead>
                    <TableHead>Coluna Descrição</TableHead>
                    <TableHead>Coluna Valor</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {configuracoes.map((config) => (
                    <TableRow key={config.id}>
                      <TableCell className="font-medium">{config.nome_configuracao}</TableCell>
                      <TableCell>{config.saldo_contas?.nome || '-'}</TableCell>
                      <TableCell>{config.mapeamento?.data || '-'}</TableCell>
                      <TableCell>{config.mapeamento?.descricao || '-'}</TableCell>
                      <TableCell>{config.mapeamento?.valor || '-'}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button variant="ghost" size="icon" onClick={() => handleEditar(config)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                              <AlertDialogDescription>
                                Tem certeza que deseja excluir a configuração "{config.nome_configuracao}"?
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeletar(config.id)}>
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>
                {configSelecionada ? 'Editar Configuração' : 'Nova Configuração'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {!configSelecionada && (
                <div className="space-y-2">
                  <Label>Conta Bancária</Label>
                  <Select value={contaSelecionadaId} onValueChange={setContaSelecionadaId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma conta" />
                    </SelectTrigger>
                    <SelectContent>
                      {saldoContas.map((conta) => (
                        <SelectItem key={conta.id} value={conta.id}>
                          {conta.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {(configSelecionada || contaSelecionadaId) && (
                <FormConciliacaoConfig
                  configInicial={configSelecionada}
                  idSaldoContas={configSelecionada?.id_saldo_contas || contaSelecionadaId}
                  proprietarioId={proprietarioId}
                  onSaveComplete={handleSaveComplete}
                />
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </LayoutPrincipal>
  );
};

export default GerenciarConfiguracoesExtrato;
