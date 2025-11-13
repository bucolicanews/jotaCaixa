import React, { useState, useEffect, useCallback, useMemo } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Plus, FileText, Trash2, Edit, ChevronLeft, Building2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { BlocoSocietario } from '@/types/documentos-societarios';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import FormBlocoSocietario from '@/components/documentos-societarios/FormBlocoSocietario';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Link } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Extensão local para BlocoSocietario
interface ExtendedBlocoSocietario extends BlocoSocietario {
    conteudo_template: string;
}

const GerenciarBlocosSocietarios: React.FC = () => {
  const { role, perfil, usuario, carregando: carregandoSessao } = useSessao();
  const [blocos, setBlocos] = useState<BlocoSocietario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [blocoSelecionado, setBlocoSelecionado] = useState<BlocoSocietario | null>(null);
  const [activeTab, setActiveTab] = useState('meus_blocos');

  const isAdmin = role === 'Admin';
  const isCliente = role === 'Cliente';
  
  // ID do proprietário (Admin ou Cliente)
  const getOwnerId = () => {
    if (isAdmin) return usuario?.id || null;
    if (isCliente) return (perfil as ClienteProfile)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id; // FIX: proprietario_id -> cliente_id
    return null;
  };
  
  const ownerId = getOwnerId();

  const buscarBlocos = useCallback(async () => {
    if (!ownerId && !isAdmin) {
        setBlocos([]);
        setCarregando(false);
        return;
    }
    
    setCarregando(true);
    
    let query = supabase
      .from('blocos_societarios')
      .select('*')
      .order('titulo', { ascending: true });
      
    // Se for Cliente, busca apenas os seus blocos (ownerId) e blocos globais (proprietario_id is null)
    if (isCliente) {
        query = query.or(`proprietario_id.eq.${ownerId},proprietario_id.is.null`);
    }
    // Se for Admin, a RLS permite ver todos os blocos (seus e dos clientes)

    const { data, error } = await query;

    if (error) {
      showError('Erro ao carregar blocos: ' + error.message);
      setBlocos([]);
    } else {
      setBlocos(data as BlocoSocietario[]);
    }
    setCarregando(false);
  }, [ownerId, isAdmin, isCliente]);

  useEffect(() => {
    if (!carregandoSessao && (isAdmin || ownerId)) {
      buscarBlocos();
    }
  }, [carregandoSessao, isAdmin, ownerId, buscarBlocos]);
  
  const handleSaveComplete = () => {
      setDialogOpen(false);
      setBlocoSelecionado(null);
      buscarBlocos();
  };
  
  const handleEdit = (bloco: BlocoSocietario) => {
      setBlocoSelecionado(bloco);
      setDialogOpen(true);
  };
  
  const handleDelete = async (blocoId: string) => {
      if (!window.confirm('Tem certeza que deseja excluir este bloco de conteúdo? Esta ação é irreversível.')) {
          return;
      }
      
      const { error } = await supabase
          .from('blocos_societarios')
          .delete()
          .eq('id', blocoId);
          
      if (error) {
          showError('Falha ao excluir bloco: ' + error.message);
      } else {
          showSuccess('Bloco excluído com sucesso!');
          buscarBlocos();
      }
  };
  
  const handleNewBloco = () => {
      setBlocoSelecionado(null);
      setDialogOpen(true);
  };
  
  const blocosFiltrados = useMemo(() => {
      if (!isAdmin) {
          // Cliente/Usuário só vê seus próprios blocos
          return { meusBlocos: blocos, blocosClientes: [] };
      }
      
      // Admin: Separa blocos próprios (proprietario_id = ownerId) e blocos de clientes (proprietario_id != ownerId)
      const meusBlocos = blocos.filter(b => b.proprietario_id === ownerId);
      const blocosClientes = blocos.filter(b => b.proprietario_id !== ownerId);
      
      return { meusBlocos, blocosClientes };
  }, [blocos, isAdmin, ownerId]);
  
  const blocosParaExibir = isAdmin && activeTab === 'blocos_clientes' 
      ? blocosFiltrados.blocosClientes 
      : blocosFiltrados.meusBlocos;
      
  const isSupervisao = isAdmin && activeTab === 'blocos_clientes';

  // Helper para renderizar a lista de blocos
  const renderBlocosList = (list: BlocoSocietario[], isSupervisao: boolean) => (
      <div className="overflow-x-auto">
          <Table>
              <TableHeader>
                  <TableRow>
                      <TableHead>Título</TableHead>
                      <TableHead className="hidden md:table-cell">Conteúdo (Início)</TableHead>
                      {isSupervisao && <TableHead>Proprietário ID</TableHead>}
                      <TableHead className="w-[100px] text-right">Ações</TableHead>
                  </TableRow>
              </TableHeader>
              <TableBody>
                  {list.length === 0 ? (
                      <TableRow>
                          <TableCell colSpan={isSupervisao ? 4 : 3} className="text-center py-4 text-muted-foreground">
                              Nenhum bloco encontrado.
                          </TableCell>
                      </TableRow>
                  ) : (
                      list.map((bloco: BlocoSocietario) => {
                          // Apenas o proprietário ou Admin (no modo não supervisão) pode editar/deletar
                          const canEditOrDelete = bloco.proprietario_id === ownerId || isAdmin && !isSupervisao;
                          
                          return (
                              <TableRow key={bloco.id}>
                                  <TableCell className="font-medium">{bloco.titulo}</TableCell>
                                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground truncate max-w-xs">
                                      {(bloco as ExtendedBlocoSocietario).conteudo.substring(0, 100)}...
                                  </TableCell>
                                  {isSupervisao && <TableCell className="text-sm text-muted-foreground">{bloco.proprietario_id}</TableCell>}
                                  <TableCell className="text-right">
                                      <div className="flex justify-end space-x-2">
                                          <Button variant="ghost" size="icon" onClick={() => handleEdit(bloco)} disabled={!canEditOrDelete} title={canEditOrDelete ? "Editar Bloco" : "Apenas visualização"}>
                                              <Edit className="w-4 h-4" />
                                          </Button>
                                          <Button variant="ghost" size="icon" onClick={() => handleDelete(bloco.id)} disabled={!canEditOrDelete} title={canEditOrDelete ? "Excluir Bloco" : "Apenas visualização"}>
                                              <Trash2 className="w-4 h-4 text-red-500" />
                                          </Button>
                                      </div>
                                  </TableCell>
                              </TableRow>
                          );
                      })
                  )}
              </TableBody>
          </Table>
      </div>
  );


  if (carregandoSessao) {
    return (
      <LayoutPrincipal>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </LayoutPrincipal>
    );
  }
  
  if (!ownerId && !isAdmin) {
      return (
          <LayoutPrincipal>
              <Card><CardContent className="p-6">Você não tem permissão para gerenciar blocos de conteúdo.</CardContent></Card>
          </LayoutPrincipal>
      );
  }

  return (
    <LayoutPrincipal>
      <div className="flex items-center mb-6">
        <Link to="/documentos-societarios/modelos">
            <Button 
                variant="link" 
                type="button"
                className="text-muted-foreground hover:text-primary flex items-center mr-4 p-0 h-auto"
            >
                <ChevronLeft className="w-5 h-5" />
                Voltar para Modelos
            </Button>
        </Link>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center">
          <FileText className="w-6 h-6 mr-2" /> Gerenciar Blocos de Conteúdo
        </h1>
      </div>
      
      <div className="flex justify-end mb-4">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                  <Button onClick={handleNewBloco} className="w-full sm:w-auto">
                      <Plus className="w-4 h-4 mr-2" />
                      Novo Bloco
                  </Button>
              </DialogTrigger>
              <DialogContent className="w-full sm:max-w-4xl max-h-[95vh] overflow-y-auto">
                  <DialogHeader>
                      <DialogTitle>{blocoSelecionado ? 'Editar Bloco' : 'Criar Novo Bloco'}</DialogTitle>
                  </DialogHeader>
                  <FormBlocoSocietario
                      blocoInicial={blocoSelecionado}
                      onSaveComplete={handleSaveComplete}
                  />
              </DialogContent>
          </Dialog>
      </div>

      <Tabs value={isAdmin ? activeTab : 'meus_blocos'} onValueChange={setActiveTab} className="w-full">
        {isAdmin && (
            <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="meus_blocos">Meus Blocos ({blocosFiltrados.meusBlocos.length})</TabsTrigger>
                <TabsTrigger value="blocos_clientes">Blocos dos Clientes ({blocosFiltrados.blocosClientes.length})</TabsTrigger>
            </TabsList>
        )}
        
        {isAdmin && activeTab === 'blocos_clientes' && (
            <div className="p-4 bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-500 rounded-md mt-4 mb-4">
                <p className="text-sm text-yellow-700 dark:text-yellow-300 font-semibold flex items-center">
                    <Building2 className="w-4 h-4 mr-2" /> Modo Supervisão: Blocos de clientes são apenas para visualização.
                </p>
            </div>
        )}

        <TabsContent value={isAdmin ? activeTab : 'meus_blocos'} className="mt-0">
            <Card>
                <CardHeader>
                    <CardTitle className="text-xl">
                        Blocos Cadastrados ({blocosParaExibir.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {carregando ? (
                        <div className="flex justify-center items-center h-32">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        </div>
                    ) : blocosParaExibir.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">Nenhum bloco de conteúdo encontrado.</p>
                    ) : (
                        renderBlocosList(blocosParaExibir, isSupervisao)
                    )}
                </CardContent>
            </Card>
        </TabsContent>
      </Tabs>
    </LayoutPrincipal>
  );
};

export default GerenciarBlocosSocietarios;