import { useState, useEffect } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, PlusCircle, Edit, Trash2, ListChecks } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { ContaReceber, ParcelaDetalhada } from '@/types/contas-receber';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import FormContasReceber from '@/components/FormContasReceber';
import DetalhesParcelasDialog from '@/components/DetalhesParcelasDialog';
import { Badge } from '@/components/ui/badge';

type ParcelaStatus = 'aberta' | 'parcial' | 'paga' | 'reprogramada' | 'cancelada';

const getBadgeVariant = (status: ParcelaStatus): 'success' | 'warning' | 'secondary' | 'destructive' | 'default' => {
  switch (status) {
    case 'paga':
      return 'success';
    case 'parcial':
      return 'warning';
    case 'aberta':
      return 'secondary';
    case 'reprogramada':
      return 'default';
    case 'cancelada':
      return 'destructive';
    default:
      return 'secondary';
  }
};

const ContasReceber = () => {
  const { usuario, carregando: carregandoSessao } = useSessao();
  const [contas, setContas] = useState<ContaReceber[]>([]);
  const [parcelas, setParcelas] = useState<ParcelaDetalhada[]>([]);
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [contaSelecionada, setContaSelecionada] = useState<ContaReceber | null>(null);
  const [dialogFormAberto, setDialogFormAberto] = useState(false);
  const [dialogParcelasAberto, setDialogParcelasAberto] = useState(false);

  const buscarDados = async () => {
    setCarregandoDados(true);
    const [contasRes, parcelasRes] = await Promise.all([
      supabase.from('contas_receber').select('*, clientes(*)').order('data_vencimento', { ascending: true }),
      supabase.from('parcelas_contas_receber').select('*, contas_receber(descricao, clientes(nome))').order('data_vencimento', { ascending: true })
    ]);

    if (contasRes.error) showError('Erro ao carregar contas: ' + contasRes.error.message);
    else setContas(contasRes.data as any[]);

    if (parcelasRes.error) showError('Erro ao carregar parcelas: ' + parcelasRes.error.message);
    else setParcelas(parcelasRes.data as any[]);
    
    setCarregandoDados(false);
  };

  useEffect(() => {
    if (!carregandoSessao && usuario) {
      buscarDados();
    }
  }, [carregandoSessao, usuario]);

  const handleSaveComplete = () => {
    setDialogFormAberto(false);
    setContaSelecionada(null);
    buscarDados();
  };

  const handleDelete = async (contaId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este conta e todas as suas parcelas? A ação não pode ser desfeita.')) return;
    const { error } = await supabase.from('contas_receber').delete().eq('id', contaId);
    if (error) showError('Erro ao excluir conta: ' + error.message);
    else {
      showSuccess('Conta excluída com sucesso.');
      buscarDados();
    }
  };

  const handleOpenParcelas = (conta: ContaReceber) => {
    setContaSelecionada(conta);
    setDialogParcelasAberto(true);
  };

  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const formatDate = (dateString: string) => new Date(dateString + 'T00:00:00').toLocaleDateString('pt-BR');

  if (carregandoSessao || carregandoDados) {
    return <LayoutPrincipal><div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></LayoutPrincipal>;
  }

  return (
    <LayoutPrincipal>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Contas a Receber</h1>
        <Dialog open={dialogFormAberto} onOpenChange={setDialogFormAberto}>
          <DialogTrigger asChild><Button onClick={() => setContaSelecionada(null)}><PlusCircle className="w-4 h-4 mr-2" />Nova Conta</Button></DialogTrigger>
          <DialogContent><DialogHeader><DialogTitle>{contaSelecionada ? 'Editar Conta' : 'Nova Conta a Receber'}</DialogTitle></DialogHeader><FormContasReceber contaInicial={contaSelecionada} onSaveComplete={handleSaveComplete} /></DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="lancamentos" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="lancamentos">Lançamentos (Sintético)</TabsTrigger>
          <TabsTrigger value="parcelas">Todas as Parcelas (Analítico)</TabsTrigger>
        </TabsList>
        <TabsContent value="lancamentos">
          <Card><CardHeader><CardTitle>Resumo dos Lançamentos</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Descrição</TableHead><TableHead>Vencimento</TableHead><TableHead>Valor Total</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
                <TableBody>
                  {contas.map((conta) => (
                    <TableRow key={conta.id}>
                      <TableCell>{conta.clientes?.nome || 'N/A'}</TableCell><TableCell>{conta.descricao}</TableCell><TableCell>{formatDate(conta.data_vencimento)}</TableCell><TableCell>{formatCurrency(conta.valor_total)}</TableCell><TableCell>{conta.status}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => handleOpenParcelas(conta)} title="Ver Parcelas"><ListChecks className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => { setContaSelecionada(conta); setDialogFormAberto(true); }}><Edit className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(conta.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="parcelas">
          <Card><CardHeader><CardTitle>Detalhamento de Todas as Parcelas</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Descrição</TableHead><TableHead className="text-center">Nº Parcela</TableHead><TableHead>Vencimento</TableHead><TableHead>Valor da Parcela</TableHead><TableHead>Valor Pago</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {parcelas.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.contas_receber?.clientes?.nome || 'N/A'}</TableCell>
                      <TableCell>{p.contas_receber?.descricao || 'N/A'}</TableCell>
                      <TableCell className="text-center">{p.numero_parcela}</TableCell>
                      <TableCell>{formatDate(p.data_vencimento)}</TableCell>
                      <TableCell>{formatCurrency(p.valor_parcela)}</TableCell>
                      <TableCell className="font-medium">{formatCurrency(p.valor_pago || 0)}</TableCell>
                      <TableCell><Badge variant={getBadgeVariant(p.status)}>{p.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <DetalhesParcelasDialog
        conta={contaSelecionada}
        open={dialogParcelasAberto}
        onOpenChange={setDialogParcelasAberto}
        onDataChange={buscarDados}
      />
    </LayoutPrincipal>
  );
};

export default ContasReceber;