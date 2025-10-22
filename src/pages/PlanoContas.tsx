import React, { useState, useEffect } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Edit, Trash2, PlusCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError } from '@/utils/toast';
import { PlanoContas } from '@/types/plano-contas';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import FormPlanoContas from '@/components/FormPlanoContas';
import ImportarPlanoContas from '@/components/ImportarPlanoContas';

const PlanoContasPage = () => {
  const { usuario, carregando: carregandoSessao } = useSessao();
  const [contas, setContas] = useState<PlanoContas[]>([]);
  const [carregandoContas, setCarregandoContas] = useState(true);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [contaSelecionada, setContaSelecionada] = useState<PlanoContas | null>(null);
  const [dialogAberto, setDialogAberto] = useState(false);

  useEffect(() => {
    if (!carregandoSessao && usuario) {
      buscarEmpresaId(usuario.id);
    }
  }, [carregandoSessao, usuario]);

  useEffect(() => {
    if (empresaId) {
      buscarPlanoContas(empresaId);
    } else if (!carregandoSessao && !usuario) {
      setCarregandoContas(false);
    }
  }, [empresaId, usuario, carregandoSessao]);

  const buscarEmpresaId = async (userId: string) => {
    const { data, error } = await supabase
      .from('empresas')
      .select('id')
      .eq('usuario_id', userId)
      .single();

    if (error) {
      showError('Erro ao buscar empresa: ' + error.message);
      setCarregandoContas(false);
      return;
    }
    setEmpresaId(data?.id || null);
  };

  const buscarPlanoContas = async (id: string) => {
    setCarregandoContas(true);
    const { data, error } = await supabase
      .from('plano_contas')
      .select('*')
      .eq('empresa_id', id)
      .order('codigo_conta', { ascending: true });

    if (error) {
      showError('Erro ao carregar Plano de Contas: ' + error.message);
      setContas([]);
    } else {
      setContas(data as PlanoContas[]);
    }
    setCarregandoContas(false);
  };

  const handleImportComplete = () => {
    if (empresaId) {
      buscarPlanoContas(empresaId);
    }
  };

  const handleSaveComplete = () => {
    setDialogAberto(false);
    setContaSelecionada(null);
    if (empresaId) {
      buscarPlanoContas(empresaId);
    }
  };

  const handleEdit = (conta: PlanoContas) => {
    setContaSelecionada(conta);
    setDialogAberto(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta conta?')) return;

    const { error } = await supabase
      .from('plano_contas')
      .delete()
      .eq('id', id);

    if (error) {
      showError('Erro ao excluir conta: ' + error.message);
    } else {
      handleImportComplete(); // Rebusca a lista
    }
  };

  if (carregandoSessao || carregandoContas) {
    return (
      <LayoutPrincipal>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </LayoutPrincipal>
    );
  }

  if (!empresaId) {
    return (
      <LayoutPrincipal>
        <Card>
          <CardHeader>
            <CardTitle>Plano de Contas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-500">Não foi possível carregar o ID da empresa. Verifique se o usuário está vinculado a uma empresa.</p>
          </p>
        </CardContent>
      </LayoutPrincipal>
    );
  }

  return (
    <LayoutPrincipal>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Plano de Contas</h1>
        <div className="space-x-2">
          <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
            <DialogTrigger asChild>
              <Button onClick={() => setContaSelecionada(null)}>
                <PlusCircle className="w-4 h-4 mr-2" />
                Nova Conta
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>{contaSelecionada ? 'Editar Conta' : 'Nova Conta'}</DialogTitle>
              </DialogHeader>
              <FormPlanoContas 
                empresaId={empresaId}
                contaInicial={contaSelecionada}
                onSaveComplete={handleSaveComplete}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="space-y-6">
        <ImportarPlanoContas onImportComplete={handleImportComplete} />

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Contas Cadastradas ({contas.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[150px]">Código</TableHead>
                    <TableHead>Nome da Conta</TableHead>
                    <TableHead className="w-[100px] text-center">Tipo</TableHead>
                    <TableHead className="w-[100px] text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                        Nenhuma conta cadastrada. Importe um CSV ou adicione manualmente.
                      </TableCell>
                    </TableRow>
                  ) : (
                    contas.map((conta) => (
                      <TableRow key={conta.id}>
                        <TableCell className="font-mono text-sm">{conta.codigo_conta}</TableCell>
                        <TableCell>{conta.nome_conta}</TableCell>
                        <TableCell className="text-center">{conta.tipo}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end space-x-2">
                            <Button variant="ghost" size="sm" onClick={() => handleEdit(conta)}>
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(conta.id)}>
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
      </div>
    </LayoutPrincipal>
  );
};

export default PlanoContasPage;