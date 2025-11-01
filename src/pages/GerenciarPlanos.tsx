import React, { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Edit, Trash2, PlusCircle, DollarSign } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { Plano } from '@/types/plano';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import FormPlano from '@/components/FormPlano';
import { Badge } from '@/components/ui/badge';

const GerenciarPlanos: React.FC = () => {
  const { role, carregando: carregandoSessao } = useSessao();
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [carregandoPlanos, setCarregandoPlanos] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [planoSelecionado, setPlanoSelecionado] = useState<Plano | null>(null);

  const isAdmin = role === 'Admin';

  const buscarPlanos = useCallback(async () => {
    if (!isAdmin) return;
    setCarregandoPlanos(true);
    
    const { data, error } = await supabase
      .from('planos')
      .select('*')
      .order('preco_mensal', { ascending: true });

    if (error) {
      showError('Erro ao carregar planos: ' + error.message);
      setPlanos([]);
    } else {
      setPlanos(data as Plano[]);
    }
    setCarregandoPlanos(false);
  }, [isAdmin]);

  useEffect(() => {
    if (!carregandoSessao && isAdmin) {
      buscarPlanos();
    }
  }, [carregandoSessao, isAdmin, buscarPlanos]);

  const handleSaveComplete = () => {
    setDialogOpen(false);
    setPlanoSelecionado(null);
    buscarPlanos();
  };

  const handleEdit = (plano: Plano) => {
    setPlanoSelecionado(plano);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este plano?')) return;

    const { error } = await supabase
      .from('planos')
      .delete()
      .eq('id', id);

    if (error) {
      showError('Erro ao excluir plano: ' + error.message);
    } else {
      showSuccess('Plano excluído com sucesso.');
      buscarPlanos();
    }
  };
  
  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  if (carregandoSessao || carregandoPlanos) {
    return (
      <LayoutPrincipal>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </LayoutPrincipal>
    );
  }
  
  if (!isAdmin) {
    return <LayoutPrincipal><Card><CardHeader><CardTitle>Acesso Negado</CardTitle></CardHeader><CardContent><p>Apenas administradores podem gerenciar planos.</p></CardContent></Card></LayoutPrincipal>;
  }

  return (
    <LayoutPrincipal>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl md:text-3xl font-bold flex items-center">
          <DollarSign className="w-6 h-6 mr-2" /> Gerenciar Planos de Assinatura
        </h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setPlanoSelecionado(null)} className="w-full sm:w-auto">
              <PlusCircle className="w-4 h-4 mr-2" />
              Novo Plano
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{planoSelecionado ? 'Editar Plano' : 'Novo Plano'}</DialogTitle>
            </DialogHeader>
            <FormPlano 
              planoInicial={planoSelecionado}
              onSaveComplete={handleSaveComplete}
            />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Planos Cadastrados ({planos.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[150px]">Nome</TableHead>
                  <TableHead className="w-[100px]">Tipo</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="w-[100px] text-right">Preço Mensal</TableHead>
                  <TableHead className="w-[100px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {planos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-4 text-muted-foreground">
                      Nenhum plano cadastrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  planos.map((plano) => (
                    <TableRow key={plano.id}>
                      <TableCell className="font-medium">{plano.nome}</TableCell>
                      <TableCell><Badge variant={plano.tipo_cliente === 'PJ' ? 'default' : 'secondary'}>{plano.tipo_cliente}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{plano.descricao || '-'}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(plano.preco_mensal)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end space-x-2">
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(plano)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(plano.id)}>
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </LayoutPrincipal>
  );
};

export default GerenciarPlanos;