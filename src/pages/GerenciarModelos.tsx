import React, { useState, useEffect, useCallback, useMemo } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Plus, FileText, Trash2, Edit, Building2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { ContratoModelo } from '@/types/contratos';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import FormContratoModelo from '@/components/formularios/FormContratoModelo';
import ImportarModeloContrato from '@/components/contratos/ImportarModeloContrato';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useOwner } from '@/hooks/use-owner';

interface ExtendedContratoModelo extends ContratoModelo {
  tipo_conteudo?: 'html' | 'texto';
}

const GerenciarModelos: React.FC = () => {
  const { role, carregando: carregandoSessao } = useSessao();
  const { ownerId } = useOwner();
  
  const [modelos, setModelos] = useState<ExtendedContratoModelo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [modeloSelecionado, setModeloSelecionado] = useState<ExtendedContratoModelo | null>(null);
  const [activeTab, setActiveTab] = useState('meus_modelos');

  const isAdmin = role === 'Admin';
  const isCliente = role === 'Cliente';

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
      
    if (!isAdmin && ownerId) {
        query = query.or(`empresa_id.eq.${ownerId},empresa_id.is.null`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Erro Supabase:', error);
      showError('Erro ao carregar modelos: ' + error.message);
      setModelos([]);
    } else {
      setModelos(data as ExtendedContratoModelo[]);
    }
    setCarregando(false);
  }, [ownerId, isAdmin]);

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
  
  const handleEdit = (modelo: ExtendedContratoModelo) => {
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
          return { meusModelos: modelos, modelosClientes: [] };
      }
      
      const meusModelos = modelos.filter(m => m.empresa_id === ownerId || m.empresa_id === null);
      const modelosClientes = modelos.filter(m => m.empresa_id !== ownerId && m.empresa_id !== null);
      
      return { meusModelos, modelosClientes };
  }, [modelos, isAdmin, ownerId]);
  
  const modelosParaExibir = isAdmin && activeTab === 'modelos_clientes' 
      ? modelosFiltrados.modelosClientes 
      : modelosFiltrados.meusModelos;
      
  const isSupervisao = isAdmin && activeTab === 'modelos_clientes';

  const renderModelosList = (list: ExtendedContratoModelo[], isSupervisao: boolean) => (
      <div className="space-y-4">
          {list.map((modelo) => {
              const isOwner = modelo.empresa_id === ownerId || (isAdmin && !isSupervisao);

              return (
                <div key={modelo.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-secondary/50 transition-colors">
                    <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{modelo.titulo}</p>
                        {isSupervisao && <p className="text-xs text-muted-foreground">Empresa ID: {modelo.empresa_id}</p>}
                        <p className="text-sm text-muted-foreground">Última atualização: {new Date(modelo.criado_em).toLocaleDateString()}</p>
                    </div>
                    <div className="flex space-x-2 ml-4">
                        <Button 
                            variant="outline" 
                            size="icon" 
                            onClick={() => handleEdit(modelo)} 
                            disabled={!isOwner} 
                            title={isOwner ? "Editar Modelo" : "Apenas visualização"}
                        >
                            <Edit className="w-4 h-4" />
                        </Button>
                        <Button 
                            variant="destructive" 
                            size="icon" 
                            onClick={() => handleDelete(modelo.id)} 
                            disabled={!isOwner} 
                            title={isOwner ? "Excluir Modelo" : "Apenas visualização"}
                        >
                            <Trash2 className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
              );
          })}
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
  
  if (!carregandoSessao && !ownerId && !isAdmin) {
      return (
          <LayoutPrincipal>
              <Card><CardContent className="p-6">Você não tem permissão para acessar esta área ou seu vínculo de empresa não foi encontrado.</CardContent></Card>
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
            <Button onClick={handleNewModel} className="w-full sm:w-auto">
              <Plus className="w-4 h-4 mr-2" /> Novo Modelo
            </Button>
          </DialogTrigger>
          <DialogContent className="w-full sm:max-w-[95vw] max-w-7xl max-h-[95vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{modeloSelecionado ? 'Editar Modelo' : 'Criar Novo Modelo'}</DialogTitle>
            </DialogHeader>
            <FormContratoModelo
              modeloInicial={modeloSelecionado}
              onSaveComplete={handleSaveComplete}
              ownerId={ownerId}
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
        
        {isSupervisao && (
            <div className="p-4 bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-500 rounded-md mb-4">
                <p className="text-sm text-yellow-700 dark:text-yellow-300 font-semibold flex items-center">
                    <Building2 className="w-4 h-4 mr-2" /> Modo Supervisão: Modelos de clientes são apenas para visualização.
                </p>
            </div>
        )}

        <TabsContent value={isAdmin ? activeTab : 'meus_modelos'} className="mt-0">
            <Card>
                <CardHeader>
                    <CardTitle className="text-xl">
                        Modelos Disponíveis ({modelosParaExibir.length})
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