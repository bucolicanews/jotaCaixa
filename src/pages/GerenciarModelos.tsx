import React, { useState, useEffect, useCallback, useMemo } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Plus, FileText, Trash2, Edit, Building2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { ContratoModelo } from '@/types/contratos';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import FormContratoModelo from '@/components/formularios/FormContratoModelo';
import ImportarModeloContrato from '@/components/contratos/ImportarModeloContrato'; // CORRIGIDO: Importação padrão
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const GerenciarModelos: React.FC = () => {
  const { role, perfil, usuario, carregando: carregandoSessao } = useSessao();
  const [modelos, setModelos] = useState<ContratoModelo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [modeloSelecionado, setModeloSelecionado] = useState<ContratoModelo | null>(null);
  const [activeTab, setActiveTab] = useState('meus_modelos');

  const isAdmin = role === 'Admin';
  const isCliente = role === 'Cliente';
  
  // ID do proprietário (Admin ou Cliente)
  const getOwnerId = () => {
    if (isAdmin) return usuario?.id || null;
    if (isCliente) return (perfil as ClienteProfile)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.proprietario_id;
    return null;
  };
  
  const ownerId = getOwnerId();

  const buscarModelos = useCallback(async () => {
    if (!ownerId && !isAdmin) {
        setModelos([]);
        setCarregando(false);
        return;
    }
    
    setCarregando(true);
    
    let query = supabase
      .from('contrato_modelos')
      .select('*')
      .order('titulo', { ascending: true });
      
    // Se for Cliente, busca apenas os seus modelos (RLS já garante isso)
    if (isCliente) {
        query = query.eq('empresa_id', ownerId);
    }
    // Se for Admin, a RLS permite ver todos os modelos (seus e dos clientes)

    const { data, error } = await query;

    if (error) {
      showError('Erro ao carregar modelos: ' + error.message);
      setModelos([]);
    } else {
      setModelos(data as ContratoModelo[]);
    }
    setCarregando(false);
  }, [ownerId, isAdmin, isCliente]);

  useEffect(() => {
    if (!carregandoSessao && (isAdmin || ownerId)) {
      buscarModelos();
    }
  }, [carregandoSessao, isAdmin, ownerId, buscarModelos]);
  
  const handleSaveComplete = () => {
      setDialogOpen(false);
      setModeloSelecionado(null);
      buscarModelos();
  };
  
  const handleEdit = (modelo: ContratoModelo) => {
      setModeloSelecionado(modelo);
      setDialogOpen(true);
  };
  
  const handleDelete = async (modeloId: string) => {
      if (!window.confirm('Tem certeza que deseja excluir este modelo de contrato? Esta ação é irreversível.')) {
          return;
      }
      
      const { error } = await supabase
          .from('contrato_modelos')
          .delete()
          .eq('id', modeloId);
          
      if (error) {
          showError('Falha ao excluir modelo: ' + error.message);
      } else {
          showSuccess('Modelo excluído com sucesso!');
          buscarModelos();
      }
  };
  
  const handleNewModel = () => {
      setModeloSelecionado(null);
      setDialogOpen(true);
  };
  
  const modelosFiltrados = useMemo(() => {
      if (!isAdmin) {
          // Cliente/Usuário só vê seus próprios modelos
          return { meusModelos: modelos, modelosClientes: [] };
      }
      
      // Admin: Separa modelos próprios (empresa_id = ownerId) e modelos de clientes (empresa_id != ownerId)
      const meusModelos = modelos.filter(m => m.empresa_id === ownerId);
      const modelosClientes = modelos.filter(m => m.empresa_id !== ownerId);
      
      return { meusModelos, modelosClientes };
  }, [modelos, isAdmin, ownerId]);
  
  const modelosParaExibir = isAdmin && activeTab === 'modelos_clientes' 
      ? modelosFiltrados.modelosClientes 
      : modelosFiltrados.meusModelos;
      
  const isSupervisao = isAdmin && activeTab === 'modelos_clientes';

  // Helper para renderizar a lista de modelos
  const renderModelosList = (list: ContratoModelo[], isSupervisao: boolean) => (
      <div className="space-y-4">
          {list.map((modelo) => (
              <div key={modelo.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-secondary/50 transition-colors">
                  <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{modelo.titulo}</p>
                      {isSupervisao && <p className="text-xs text-muted-foreground">Empresa ID: {modelo.empresa_id}</p>}
                      <p className="text-sm text-muted-foreground">Última atualização: {new Date(modelo.criado_em).toLocaleDateString()}</p>
                  </div>
                  <div className="flex space-x-2 ml-4">
                      {/* Admin pode editar/deletar modelos de clientes, mas vamos restringir a edição para evitar quebra de dados */}
                      <Button variant="outline" size="icon" onClick={() => handleEdit(modelo)} disabled={isSupervisao} title={isSupervisao ? "Apenas visualização" : "Editar Modelo"}>
                          <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="destructive" size="icon" onClick={() => handleDelete(modelo.id)} disabled={isSupervisao} title={isSupervisao ? "Apenas visualização" : "Excluir Modelo"}>
                          <Trash2 className="w-4 h-4" />
                      </Button>
                  </div>
              </div>
          ))}
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
              <Card><CardContent className="p-6">Você não tem permissão para gerenciar modelos de contrato.</CardContent></Card>
          </LayoutPrincipal>
      );
  }

  return (
    <LayoutPrincipal>
      <div className="flex flex-col items-center sm:flex-row sm:justify-between sm:items-start mb-6 gap-4">
        <h1 className="text-2xl md:text-3xl font-bold flex items-center text-center sm:text-left">
          <FileText className="w-6 h-6 mr-2" /> Gerenciar Modelos de Contrato
        </h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleNewModel} className="w-full sm:w-auto mx-auto sm:mx-0">
              <Plus className="w-4 h-4 mr-2 sm:mr-0" /> 
              <span className="hidden sm:inline">Novo Modelo</span>
              <span className="sm:hidden">Novo</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="w-full sm:max-w-7xl max-h-[95vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{modeloSelecionado ? 'Editar Modelo' : 'Criar Novo Modelo'}</DialogTitle>
            </DialogHeader>
            <FormContratoModelo
              modeloInicial={modeloSelecionado}
              onSaveComplete={handleSaveComplete}
            />
          </DialogContent>
        </Dialog>
      </div>
      
      <div className="grid grid-cols-1 gap-6 mb-6">
          <div className="max-w-lg mx-auto w-full">
              <ImportarModeloContrato 
                  empresaId={ownerId} 
                  onImportComplete={buscarModelos} 
              />
          </div>
      </div>

      <Tabs value={isAdmin ? activeTab : 'meus_modelos'} onValueChange={setActiveTab} className="w-full">
        {isAdmin && (
            <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="meus_modelos">Meus Modelos ({modelosFiltrados.meusModelos.length})</TabsTrigger>
                <TabsTrigger value="modelos_clientes">Modelos dos Clientes ({modelosFiltrados.modelosClientes.length})</TabsTrigger>
            </TabsList>
        )}
        
        {isAdmin && activeTab === 'modelos_clientes' && (
            <div className="p-4 bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-500 rounded-md mt-4 mb-4">
                <p className="text-sm text-yellow-700 dark:text-yellow-300 font-semibold flex items-center">
                    <Building2 className="w-4 h-4 mr-2" /> Modo Supervisão: Modelos de clientes não podem ser editados ou excluídos diretamente.
                </p>
            </div>
        )}

        <TabsContent value={isAdmin ? activeTab : 'meus_modelos'} className="mt-0">
            <Card>
                <CardHeader>
                    <CardTitle className="text-xl">
                        Modelos Cadastrados ({modelosParaExibir.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {carregando ? (
                        <div className="flex justify-center items-center h-32">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        </div>
                    ) : modelosParaExibir.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">Nenhum modelo de contrato encontrado.</p>
                    ) : (
                        renderModelosList(modelosParaExibir, isSupervisao)
                    )}
                </CardContent>
            </Card>
        </TabsContent>
      </Tabs>
    </LayoutPrincipal>
  );
};

export default GerenciarModelos;