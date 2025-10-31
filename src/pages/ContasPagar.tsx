import { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, PlusCircle, Edit, Trash2, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { parseISO, isPast, isToday } from 'date-fns';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface ContaPagar {
  id: string;
  empresa_id: string | null;
  fornecedor: string;
  documento: string | null;
  data_vencimento: string;
  valor: number;
  status: 'pendente' | 'pago' | 'atrasado' | 'cancelado';
  conta_contabil_id: string | null;
}

type ContaStatus = 'pendente' | 'pago' | 'atrasado' | 'cancelado';
type BadgeVariant = 'success' | 'warning' | 'secondary' | 'destructive' | 'default' | 'info';

const getBadgeVariant = (status: ContaStatus, dataVencimento: string): BadgeVariant => {
  const vencimento = parseISO(dataVencimento + 'T00:00:00');

  if (status === 'pago') return 'success';
  if (status === 'cancelado') return 'destructive';
  
  if (isPast(vencimento) && !isToday(vencimento)) return 'destructive';
  if (isToday(vencimento)) return 'warning';

  return 'secondary';
};

const ContasPagar = () => {
  const { usuario, perfil, role, carregando: carregandoSessao } = useSessao();
  const [contas, setContas] = useState<ContaPagar[]>([]);
  const [carregandoDados, setCarregandoDados] = useState(true);
  
  const isAdmin = role === 'Admin';
  const [activeTab, setActiveTab] = useState(isAdmin ? 'meus_lancamentos' : 'lancamentos');

  const getOwnerId = () => {
    if (role === 'Admin') return null; // Admin usa RLS para NULL
    if (role === 'Cliente') return (perfil as ClienteProfile)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id;
    return null;
  };
  
  const empresaId = getOwnerId();

  const buscarMeusLancamentos = async () => {
    setCarregandoDados(true);
    
    let query = supabase.from('contas_pagar').select('*').order('data_vencimento', { ascending: true });

    if (isAdmin) {
        query = query.is('empresa_id', null);
    } else if (empresaId) {
        query = query.eq('empresa_id', empresaId);
    } else {
        setContas([]);
        setCarregandoDados(false);
        return;
    }

    const { data, error } = await query;

    if (error) {
      showError('Erro ao carregar contas a pagar: ' + error.message);
      setContas([]);
    } else {
      setContas(data as ContaPagar[]);
    }
    setCarregandoDados(false);
  };
  
  const buscarSupervisao = async () => {
    if (!isAdmin) return;
    setCarregandoDados(true);
    
    // Supervisão: Busca todos os lançamentos onde empresa_id NÃO é NULL
    const { data, error } = await supabase
      .from('contas_pagar')
      .select('*')
      .not('empresa_id', 'is', null)
      .order('data_vencimento', { ascending: true });

    if (error) {
      showError('Erro ao carregar contas de supervisão: ' + error.message);
      setContas([]);
    } else {
      setContas(data as ContaPagar[]);
    }
    setCarregandoDados(false);
  };

  const buscarDados = useCallback(() => {
    if (!carregandoSessao && usuario) {
        if (isAdmin && activeTab === 'supervisao') {
            buscarSupervisao();
        } else {
            buscarMeusLancamentos();
        }
    }
  }, [carregandoSessao, usuario, isAdmin, activeTab]);

  useEffect(() => {
    buscarDados();
  }, [buscarDados]);

  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const formatDate = (dateString: string) => new Date(dateString + 'T00:00:00').toLocaleDateString('pt-BR');

  const handleEdit = (_conta: ContaPagar) => {
    showError('Funcionalidade de edição de Contas a Pagar ainda não implementada.');
    // TODO: Implementar Dialog/Form para Contas a Pagar
  };

  const handleDelete = async (contaId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta conta a pagar?')) return;
    const { error } = await supabase.from('contas_pagar').delete().eq('id', contaId);
    if (error) showError('Erro ao excluir conta: ' + error.message);
    else {
      showSuccess('Conta excluída com sucesso.');
      buscarDados();
    }
  };

  if (carregandoSessao || carregandoDados) {
    return <LayoutPrincipal><div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></LayoutPrincipal>;
  }

  return (
    <LayoutPrincipal>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl md:text-3xl font-bold">Contas a Pagar</h1>
        <Button className="w-full sm:w-auto" disabled={isAdmin && activeTab === 'supervisao'}>
          <PlusCircle className="w-4 h-4 mr-2" />
          Nova Conta
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className={cn("grid w-full", isAdmin ? "grid-cols-2" : "grid-cols-1")}>
          <TabsTrigger value="meus_lancamentos">Meus Lançamentos</TabsTrigger>
          {isAdmin && <TabsTrigger value="supervisao">Supervisão</TabsTrigger>}
        </TabsList>
        
        {/* ABA DE SUPERVISÃO (APENAS ADMIN) */}
        {isAdmin && activeTab === 'supervisao' && (
            <div className="p-4 bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-500 rounded-md mt-4">
                <p className="text-sm text-yellow-700 dark:text-yellow-300 font-semibold">
                    Modo Supervisão: Visualizando lançamentos de todas as empresas clientes.
                </p>
            </div>
        )}
        
        <TabsContent value={activeTab} className="mt-4">
          <Card>
            <CardHeader><CardTitle>Lançamentos ({contas.length})</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-left">Ações</TableHead> 
                      {isAdmin && activeTab === 'supervisao' && <TableHead>Empresa ID</TableHead>}
                      <TableHead>Fornecedor</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead className="hidden sm:table-cell">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contas.length === 0 ? (
                        <TableRow><TableCell colSpan={isAdmin ? 6 : 5} className="text-center h-24">Nenhuma conta a pagar encontrada.</TableCell></TableRow>
                    ) : (
                        contas.map((conta) => {
                            const statusVariant = getBadgeVariant(conta.status, conta.data_vencimento);
                            const canEditOrDelete = !isAdmin || activeTab === 'meus_lancamentos';

                            return (
                                <TableRow key={conta.id}>
                                    <TableCell className="text-left min-w-[120px]">
                                        <div className="flex space-x-1">
                                            {canEditOrDelete && (
                                                <>
                                                    <Button variant="ghost" size="icon" onClick={() => handleEdit(conta)}><Edit className="h-4 w-4" /></Button>
                                                    <Button variant="ghost" size="icon" onClick={() => handleDelete(conta.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                                                </>
                                            )}
                                            {!canEditOrDelete && (
                                                <Button variant="ghost" size="icon" disabled title="Apenas visualização"><Eye className="h-4 w-4 text-muted-foreground" /></Button>
                                            )}
                                        </div>
                                    </TableCell>
                                    {isAdmin && activeTab === 'supervisao' && <TableCell className="text-sm text-muted-foreground">{conta.empresa_id || 'Admin'}</TableCell>}
                                    <TableCell className="font-medium">{conta.fornecedor}</TableCell>
                                    <TableCell>{formatDate(conta.data_vencimento)}</TableCell>
                                    <TableCell>{formatCurrency(conta.valor)}</TableCell>
                                    <TableCell className="hidden sm:table-cell">
                                        <Badge variant={statusVariant}>{conta.status}</Badge>
                                    </TableCell>
                                </TableRow>
                            );
                        })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </LayoutPrincipal>
  );
};

export default ContasPagar;