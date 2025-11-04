import { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Edit, Trash2, PlusCircle, Filter, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { PlanoContas } from '@/types/plano-contas';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import FormPlanoContas from '@/components/FormPlanoContas';
import ImportarPlanoContas from '@/components/ImportarPlanoContas';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDebounce } from '@/hooks/use-debounce';

const PlanoContasPage = () => {
  const { usuario, perfil, role, carregando: carregandoSessao } = useSessao();
  const [contas, setContas] = useState<PlanoContas[]>([]);
  const [carregandoContas, setCarregandoContas] = useState(true);
  const [proprietarioId, setProprietarioId] = useState<string | null>(null);
  const [contaSelecionada, setContaSelecionada] = useState<PlanoContas | null>(null);
  const [dialogAberto, setDialogAberto] = useState(false);

  // Estados dos filtros
  const [filtroTexto, setFiltroTexto] = useState('');
  const filtroTextoDebounced = useDebounce(filtroTexto, 500);
  const [filtroTipoConta, setFiltroTipoConta] = useState('todos');
  const [filtroAnalitica, setFiltroAnalitica] = useState('todos');

  const buscarPlanoContas = useCallback(async (id: string) => {
    setCarregandoContas(true);
    let query = supabase
      .from('plano_contas')
      .select('*')
      .eq('proprietario_id', id);

    // Aplicar filtro de texto
    if (filtroTextoDebounced) {
      const searchTerm = `%${filtroTextoDebounced}%`;
      query = query.or(
        `Conta.ilike.${searchTerm},codigo_reduzido.ilike.${searchTerm},Descricao.ilike.${searchTerm}`
      );
    }

    // Aplicar filtro de tipo de conta
    if (filtroTipoConta !== 'todos') {
      let prefix = '';
      if (filtroTipoConta === 'ativo') prefix = '1';
      if (filtroTipoConta === 'passivo') prefix = '2';
      if (filtroTipoConta === 'receita') prefix = '3';
      if (filtroTipoConta === 'despesa') prefix = '4';
      query = query.like('Conta', `${prefix}.%`);
    }

    // Aplicar filtro de analítica
    if (filtroAnalitica !== 'todos') {
      query = query.eq('Analitica', filtroAnalitica);
    }

    query = query.order('Conta', { ascending: true });

    const { data, error } = await query;

    if (error) {
      showError('Erro ao carregar Plano de Contas: ' + error.message);
      setContas([]);
    } else {
      setContas(data as PlanoContas[]);
    }
    setCarregandoContas(false);
  }, [proprietarioId, filtroTextoDebounced, filtroTipoConta, filtroAnalitica]);

  useEffect(() => {
    if (!carregandoSessao && usuario) {
      let ownerId: string | null = null;

      if (role === 'Admin') {
          ownerId = usuario.id;
      } else if (role === 'Cliente') {
          ownerId = (perfil as ClienteProfile)?.id || null;
      } else if (role === 'Usuario') {
          ownerId = (perfil as UsuarioProfile)?.cliente_id || null;
      }
      
      if (ownerId) {
          setProprietarioId(ownerId);
      } else {
          setCarregandoContas(false);
      }
    } else if (!carregandoSessao && !usuario) {
        setCarregandoContas(false);
    }
  }, [carregandoSessao, usuario, perfil, role]);

  useEffect(() => {
    if (proprietarioId) {
      buscarPlanoContas(proprietarioId);
    }
  }, [proprietarioId, buscarPlanoContas]);

  const handleImportComplete = () => {
    if (proprietarioId) {
      buscarPlanoContas(proprietarioId);
    }
  };

  const handleSaveComplete = () => {
    setDialogAberto(false);
    setContaSelecionada(null);
    if (proprietarioId) {
      buscarPlanoContas(proprietarioId);
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
      showSuccess('Conta excluída com sucesso.');
      handleImportComplete();
    }
  };

  if (carregandoSessao) {
    return (
      <LayoutPrincipal>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </LayoutPrincipal>
    );
  }

  if (!proprietarioId) {
    return (
      <LayoutPrincipal>
        <Card>
          <CardHeader>
            <CardTitle>Plano de Contas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-500">Não foi possível carregar o ID da empresa/proprietário. Verifique se o usuário está vinculado.</p>
          </CardContent>
        </Card>
      </LayoutPrincipal>
    );
  }

  return (
    <LayoutPrincipal>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl md:text-3xl font-bold">Plano de Contas</h1>
        <div className="space-x-2 w-full sm:w-auto">
          <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
            <DialogTrigger asChild>
              <Button onClick={() => setContaSelecionada(null)} className="w-full sm:w-auto">
                <PlusCircle className="w-4 h-4 mr-2" />
                Nova Conta
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>{contaSelecionada ? 'Editar Conta' : 'Nova Conta'}</DialogTitle>
              </DialogHeader>
              <FormPlanoContas 
                proprietarioId={proprietarioId}
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
            <CardTitle className="text-lg flex items-center"><Filter className="w-4 h-4 mr-2" /> Filtros</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-4">
            <div className="relative w-full sm:w-[300px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por conta, código ou descrição..."
                value={filtroTexto}
                onChange={(e) => setFiltroTexto(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filtroTipoConta} onValueChange={setFiltroTipoConta}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Filtrar por Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Tipos</SelectItem>
                <SelectItem value="ativo">Ativo (Inicia com 1)</SelectItem>
                <SelectItem value="passivo">Passivo (Inicia com 2)</SelectItem>
                <SelectItem value="receita">Receita (Inicia com 3)</SelectItem>
                <SelectItem value="despesa">Despesa (Inicia com 4)</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroAnalitica} onValueChange={setFiltroAnalitica}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Filtrar por Analítica" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas (Analítica)</SelectItem>
                <SelectItem value="Sim">Sim</SelectItem>
                <SelectItem value="Não">Não</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Contas Cadastradas ({contas.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[150px]">Conta</TableHead>
                    <TableHead className="w-[100px]">Cód. Reduzido</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="w-[100px] text-center">Analítica</TableHead>
                    <TableHead className="w-[100px] text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {carregandoContas ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                      </TableCell>
                    </TableRow>
                  ) : contas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-4 text-muted-foreground">
                        Nenhuma conta encontrada com os filtros aplicados.
                      </TableCell>
                    </TableRow>
                  ) : (
                    contas.map((conta) => (
                      <TableRow key={conta.id}>
                        <TableCell className="font-mono text-sm">{conta.Conta}</TableCell>
                        <TableCell className="text-sm">{conta.codigo_reduzido || '-'}</TableCell>
                        <TableCell>{conta.Descricao}</TableCell>
                        <TableCell className="text-center">{conta.Analitica}</TableCell>
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