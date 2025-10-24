import { useState, useEffect } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, PlusCircle, Edit, Trash2, ListChecks } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { ContaReceber } from '@/types/contas-receber';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import FormContasReceber from '@/components/FormContasReceber';
import DetalhesParcelasDialog from '@/components/DetalhesParcelasDialog';

const ContasReceber = () => {
  const { usuario, carregando: carregandoSessao } = useSessao();
  const [contas, setContas] = useState<ContaReceber[]>([]);
  const [carregandoContas, setCarregandoContas] = useState(true);
  const [contaSelecionada, setContaSelecionada] = useState<ContaReceber | null>(null);
  const [dialogFormAberto, setDialogFormAberto] = useState(false);
  const [dialogParcelasAberto, setDialogParcelasAberto] = useState(false);

  const buscarContas = async () => {
    setCarregandoContas(true);
    const { data, error } = await supabase
      .from('contas_receber')
      .select('*, clientes(*)')
      .order('data_vencimento', { ascending: true });

    if (error) {
      showError('Erro ao carregar contas: ' + error.message);
      setContas([]);
    } else {
      setContas(data as any[]);
    }
    setCarregandoContas(false);
  };

  useEffect(() => {
    if (!carregandoSessao && usuario) {
      buscarContas();
    }
  }, [carregandoSessao, usuario]);

  const handleSaveComplete = () => {
    setDialogFormAberto(false);
    setContaSelecionada(null);
    buscarContas();
  };

  const handleDelete = async (contaId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este conta e todas as suas parcelas? A ação não pode ser desfeita.')) return;

    const { error } = await supabase.from('contas_receber').delete().eq('id', contaId);

    if (error) {
      showError('Erro ao excluir conta: ' + error.message);
    } else {
      showSuccess('Conta excluída com sucesso.');
      buscarContas();
    }
  };

  const handleOpenParcelas = (conta: ContaReceber) => {
    setContaSelecionada(conta);
    setDialogParcelasAberto(true);
  };

  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const formatDate = (dateString: string) => new Date(dateString + 'T00:00:00').toLocaleDateString('pt-BR');

  if (carregandoSessao || carregandoContas) {
    return (
      <LayoutPrincipal>
        <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      </LayoutPrincipal>
    );
  }

  return (
    <LayoutPrincipal>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Contas a Receber</h1>
        <Dialog open={dialogFormAberto} onOpenChange={setDialogFormAberto}>
          <DialogTrigger asChild>
            <Button onClick={() => setContaSelecionada(null)}><PlusCircle className="w-4 h-4 mr-2" />Nova Conta</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{contaSelecionada ? 'Editar Conta' : 'Nova Conta a Receber'}</DialogTitle></DialogHeader>
            <FormContasReceber contaInicial={contaSelecionada} onSaveComplete={handleSaveComplete} />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle>Lançamentos</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contas.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center">Nenhuma conta a receber encontrada.</TableCell></TableRow>
              ) : (
                contas.map((conta) => (
                  <TableRow key={conta.id}>
                    <TableCell>{conta.clientes?.nome || 'N/A'}</TableCell>
                    <TableCell>{conta.descricao}</TableCell>
                    <TableCell>{formatDate(conta.data_vencimento)}</TableCell>
                    <TableCell>{formatCurrency(conta.valor_total)}</TableCell>
                    <TableCell>{conta.status}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleOpenParcelas(conta)} title="Ver Parcelas">
                        <ListChecks className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => { setContaSelecionada(conta); setDialogFormAberto(true); }}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(conta.id)}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <DetalhesParcelasDialog
        conta={contaSelecionada}
        open={dialogParcelasAberto}
        onOpenChange={setDialogParcelasAberto}
      />
    </LayoutPrincipal>
  );
};

export default ContasReceber;