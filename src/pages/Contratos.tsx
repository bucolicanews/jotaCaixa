import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlusCircle, FileSignature, Loader2, Tag, FileTextIcon, Eye } from 'lucide-react';
import { useSessao } from '@/hooks/use-sessao';
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { ContratoGerado } from '@/types/contratos';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import ContratoAcoesDialog from '@/components/ContratoAcoesDialog';
import { format, parseISO } from 'date-fns';

const Contratos = () => {
  const { role, perfil, carregando: carregandoSessao } = useSessao();
  const [activeTab, setActiveTab] = useState('pendentes');
  const [contratos, setContratos] = useState<ContratoGerado[]>([]);
  const [carregandoContratos, setCarregandoContratos] = useState(true);
  const [contratoSelecionado, setContratoSelecionado] = useState<ContratoGerado | null>(null);
  const [acoesDialogOpen, setAcoesDialogOpen] = useState(false);

  const canManageModels = role === 'Admin' || role === 'Cliente';
  const canCreateContract = role === 'Admin' || role === 'Cliente';
  
  const isCliente = role === 'Cliente';
  const isAdmin = role === 'Admin';
  const empresaId = isCliente ? (perfil as ClienteProfile)?.id : (role === 'Usuario' ? (perfil as UsuarioProfile)?.cliente_id : null);

  const buscarContratos = useCallback(async () => {
    if (!empresaId && !isAdmin) return;
    setCarregandoContratos(true);
    
    let query = supabase
      .from('contratos_gerados')
      .select('*, clientes(nome)')
      .order('criado_em', { ascending: false });
      
    // RLS deve cuidar da filtragem por empresa_id, mas garantimos a busca
    // if (!isAdmin) {
    //     query = query.eq('empresa_id', empresaId);
    // }

    const { data, error } = await query;

    if (error) {
      showError('Erro ao carregar contratos: ' + error.message);
      setContratos([]);
    } else {
      setContratos(data as any[]);
    }
    setCarregandoContratos(false);
  }, [empresaId, isAdmin]);

  useEffect(() => {
    if (!carregandoSessao && (isAdmin || empresaId)) {
      buscarContratos();
    }
  }, [carregandoSessao, isAdmin, empresaId, buscarContratos]);
  
  const handleOpenAcoes = (contrato: ContratoGerado) => {
      setContratoSelecionado(contrato);
      setAcoesDialogOpen(true);
  };
  
  const getStatusBadge = (status: ContratoGerado['status']) => {
      switch (status) {
          case 'pendente_assinatura': return <Badge variant="warning">Pendente Assinatura</Badge>;
          case 'ativo': return <Badge variant="default">Ativo</Badge>;
          case 'cancelado': return <Badge variant="destructive">Cancelado</Badge>;
          case 'concluido': return <Badge variant="success">Concluído</Badge>;
          case 'rascunho': return <Badge variant="secondary">Rascunho</Badge>;
          default: return <Badge variant="secondary">{status}</Badge>;
      }
  };

  const contratosPendentes = contratos.filter(c => c.status === 'pendente_assinatura');
  const contratosAtivos = contratos.filter(c => c.status === 'ativo' || c.status === 'concluido');

  if (carregandoSessao || carregandoContratos) {
    return <LayoutPrincipal><div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></LayoutPrincipal>;
  }

  return (
    <LayoutPrincipal>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl md:text-3xl font-bold flex items-center">
          <FileSignature className="w-6 h-6 mr-2" /> Gerenciamento de Contratos
        </h1>
        <div className="flex space-x-2 w-full sm:w-auto">
            <Link to="/contratos/novo">
                <Button className="w-full sm:w-auto" disabled={!canCreateContract}>
                    <PlusCircle className="w-4 h-4 mr-2" />
                    Novo Contrato
                </Button>
            </Link>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-3">
          <TabsTrigger value="pendentes">Pendentes de Assinatura ({contratosPendentes.length})</TabsTrigger>
          <TabsTrigger value="gerados">Contratos Ativos ({contratosAtivos.length})</TabsTrigger>
          {canManageModels && <TabsTrigger value="modelos">Modelos e Tags</TabsTrigger>}
        </TabsList>
        
        <TabsContent value="pendentes" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-xl">Contratos Pendentes de Assinatura</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Valor</TableHead><TableHead>Data Criação</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {contratosPendentes.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-4 text-muted-foreground">Nenhum contrato pendente de assinatura.</TableCell></TableRow>
                    ) : (
                      contratosPendentes.map(c => (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">{(c as any).clientes?.nome || 'N/A'}</TableCell>
                          <TableCell>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c.valor_total)}</TableCell>
                          <TableCell>{format(parseISO(c.criado_em), 'dd/MM/yyyy')}</TableCell>
                          <TableCell>{getStatusBadge(c.status)}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => handleOpenAcoes(c)}>
                                <Eye className="w-4 h-4 mr-2" /> Ver Ações
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
        </TabsContent>
        
        <TabsContent value="gerados" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-xl">Contratos Ativos e Concluídos</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Valor</TableHead><TableHead>Data Início</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {contratosAtivos.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-4 text-muted-foreground">Nenhum contrato ativo ou concluído.</TableCell></TableRow>
                    ) : (
                      contratosAtivos.map(c => (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">{(c as any).clientes?.nome || 'N/A'}</TableCell>
                          <TableCell>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c.valor_total)}</TableCell>
                          <TableCell>{format(parseISO(c.data_inicio), 'dd/MM/yyyy')}</TableCell>
                          <TableCell>{getStatusBadge(c.status)}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => handleOpenAcoes(c)}>
                                <Eye className="w-4 h-4 mr-2" /> Ver Detalhes
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
        </TabsContent>
        
        {canManageModels && (
            <TabsContent value="modelos" className="mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Link to="/contratos/tags">
                        <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-lg font-medium">Gerenciar Tags</CardTitle>
                                <Tag className="h-5 w-5 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-muted-foreground">Crie e edite tags dinâmicas para seus contratos.</p>
                            </CardContent>
                        </Card>
                    </Link>
                    <Link to="/contratos/modelos">
                        <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-lg font-medium">Gerenciar Modelos</CardTitle>
                                <FileTextIcon className="h-5 w-5 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-muted-foreground">Crie e edite templates de contrato.</p>
                            </CardContent>
                        </Card>
                    </Link>
                </div>
            </TabsContent>
        )}
      </Tabs>
      
      <ContratoAcoesDialog
        contrato={contratoSelecionado}
        open={acoesDialogOpen}
        onOpenChange={setAcoesDialogOpen}
      />
    </LayoutPrincipal>
  );
};

export default Contratos;