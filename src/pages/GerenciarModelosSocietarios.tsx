import React, { useState, useEffect, useCallback, useMemo } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Plus, FileText, Trash2, Edit, ChevronLeft, Building2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { DocumentoSocietarioModelo } from '@/types/documentos-societarios';
import { ClienteProfile, UsuarioProfile, AdminUsuarioProfile } from '@/types/usuario';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import FormDocumentoSocietarioModelo from '@/components/formularios/FormDocumentoSocietarioModelo';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Link } from 'react-router-dom';
import { useOwner } from '@/hooks/use-owner'; // NOVO IMPORT

// Extensão local para DocumentoSocietarioModelo
interface ExtendedDocumentoSocietarioModelo extends DocumentoSocietarioModelo {
  tipo_conteudo?: 'html' | 'texto';
}

interface ExtendedDocumentoSocietarioModelo extends DocumentoSocietarioModelo {
  tipo_conteudo?: 'html' | 'texto';
}

const GerenciarModelosSocietarios: React.FC = () => {
  const { carregando: carregandoSessao } = useSessao();
  const { ownerId, ownerType } = useOwner();
  const [modelos, setModelos] = useState<ExtendedDocumentoSocietarioModelo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [modeloSelecionado, setModeloSelecionado] = useState<ExtendedDocumentoSocietarioModelo | null>(null);
  const [activeTab, setActiveTab] = useState('meus_modelos');

  const isSupervisaoContext = ownerType === 'Admin' || ownerType === 'AdminUsuario';

  const buscarModelos = useCallback(async () => {
    if (!ownerId) {
        setCarregando(false);
        return;
    }
    
    setCarregando(true);
    
    let query = supabase.from('modelos_societarios').select('*');
      
    if (ownerType === 'Cliente' || ownerType === 'ClienteUsuario') {
        query = query.or(`proprietario_id.eq.${ownerId},proprietario_id.is.null`);
    }

    const { data, error } = await query.order('titulo', { ascending: true });

    if (error) {
      console.error('Erro ao carregar modelos:', error);
      showError('Erro ao carregar modelos: ' + error.message);
      setModelos([]);
    } else {
      setModelos(data as DocumentoSocietarioModelo[]);
    }
    setCarregando(false);
  }, [ownerId, ownerType]);

  useEffect(() => {
    if (!carregandoSessao) {
      buscarModelos();
    }
  }, [carregandoSessao, buscarModelos]);
  
  const handleSaveComplete = () => {
      setDialogOpen(false);
      setModeloSelecionado(null);
      buscarModelos();
  };
  
  const handleEdit = (modelo: DocumentoSocietarioModelo) => {
      setModeloSelecionado(modelo);
      setDialogOpen(true);
  };
  
  const handleDelete = async (modeloId: string) => {
      if (!window.confirm('Tem certeza que deseja excluir este modelo de documento societário? Esta ação é irreversível.')) {
          return;
      }
      
      const { error } = await supabase
          .from('modelos_societarios')
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
      if (!isSupervisaoContext) {
          return { meusModelos: modelos, modelosClientes: [] };
      }
      
      const meusModelos = modelos.filter(m => m.proprietario_id === ownerId || m.proprietario_id === null);
      const modelosClientes = modelos.filter(m => m.proprietario_id !== ownerId && m.proprietario_id !== null);
      
      return { meusModelos, modelosClientes };
  }, [modelos, isSupervisaoContext, ownerId]);
  
  const modelosParaExibir = isSupervisaoContext && activeTab === 'modelos_clientes' 
      ? modelosFiltrados.modelosClientes 
      : modelosFiltrados.meusModelos;
      
  const isModoSupervisao = isSupervisaoContext && activeTab === 'modelos_clientes';

  const renderModelosList = (list: DocumentoSocietarioModelo[]) => (
      <div className="space-y-4">
          {list.map((modelo: DocumentoSocietarioModelo) => {
              const canManage = !isModoSupervisao && (modelo.proprietario_id === ownerId || modelo.proprietario_id === null);

              return (
                <div key={modelo.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-secondary/50 transition-colors">
                    <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{modelo.titulo}</p>
                        {isModoSupervisao && <p className="text-xs text-muted-foreground">Empresa ID: {modelo.proprietario_id}</p>}
                        <p className="text-sm text-muted-foreground">Última atualização: {new Date(modelo.criado_em).toLocaleDateString()}</p>
                    </div>
                    <div className="flex space-x-2 ml-4">
                        <Link to={`/documentos-societarios/gerar/${modelo.id}`}>
                            <Button variant="secondary" size="sm" title="Usar Modelo">
                                <ArrowRight className="w-4 h-4 mr-2" /> Gerar
                            </Button>
                        </Link>
                        <Button 
                            variant="outline" 
                            size="icon" 
                            onClick={() => handleEdit(modelo)} 
                            disabled={!canManage} 
                            title={canManage ? "Editar Modelo" : "Apenas visualização"}
                        >
                            <Edit className="w-4 h-4" />
                        </Button>
                        <Button 
                            variant="destructive" 
                            size="icon" 
                            onClick={() => handleDelete(modelo.id)} 
                            disabled={!canManage} 
                            title={canManage ? "Excluir Modelo" : "Apenas visualização"}
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
  
  if (!ownerId) {
      return (
          <LayoutPrincipal>
              <Card><CardContent className="p-6">Você não tem permissão para acessar esta área ou seu vínculo de empresa não foi encontrado.</CardContent></Card>
          </LayoutPrincipal>
      );
  }

  return (
    <LayoutPrincipal>
      <div className="flex items-center mb-6">
        <Link to="/documentos-societarios">
            <Button 
                variant="link" 
                type="button"
                className="text-muted-foreground hover:text-primary flex items-center mr-4 p-0 h-auto"
            >
                <ChevronLeft className="w-5 h-5" />
                Voltar para Documentos
            </Button>
        </Link>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center">
          <FileText className="w-6 h-6 mr-2" />Modelos
        </h1>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <Card className="md:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-xl">Modelos Cadastrados ({modelosParaExibir.length})</CardTitle>
                  <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                      <DialogTrigger asChild>
                          <Button onClick={handleNewModel} size="sm">
                              <Plus className="w-4 h-4 mr-2" /> Novo Modelo
                          </Button>
                      </DialogTrigger>
                      <DialogContent className="w-full sm:max-w-7xl max-h-[95vh] overflow-y-auto">
                          <DialogHeader>
                              <DialogTitle>{modeloSelecionado ? 'Editar Modelo' : 'Criar Novo Modelo'}</DialogTitle>
                          </DialogHeader>
                          <FormDocumentoSocietarioModelo
                              modeloInicial={modeloSelecionado}
                              onSaveComplete={handleSaveComplete}
                              ownerId={proprietarioId}
                          />
                      </DialogContent>
                  </Dialog>
              </CardHeader>
              <CardContent>
                  {carregando ? (
                      <div className="flex justify-center items-center h-32">
                          <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      </div>
                  ) : modelosParaExibir.length === 0 ? (
                      <p className="text-center text-muted-foreground py-8">Nenhum modelo de documento societário encontrado.</p>
                  ) : (
                      renderBlocosList(modelosParaExibir, isSupervisao)
                  )}
              </CardContent>
          </Card>
          
          <Card className="md:col-span-1 h-fit">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-lg font-semibold flex items-center">
                      <Tag className="w-4 h-4 mr-2" /> Blocos de Conteúdo
                  </CardTitle>
                  <Link to="/documentos-societarios/blocos">
                      <Button variant="link" size="sm">Gerenciar &rarr;</Button>
                  </Link>
              </CardHeader>
              <CardContent>
                  <p className="text-sm text-muted-foreground">Crie e edite blocos de texto reutilizáveis para montar seus documentos.</p>
              </CardContent>
          </Card>
      </div>

      {isAdmin && (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="meus_modelos">Meus Modelos ({modelosFiltrados.meusModelos.length})</TabsTrigger>
                  <TabsTrigger value="modelos_clientes">Modelos dos Clientes ({modelosFiltrados.modelosClientes.length})</TabsTrigger>
              </TabsList>
              
              <TabsContent value={activeTab} className="mt-4">
                  {/* Conteúdo já renderizado acima, esta seção é apenas para o layout de tabs */}
              </TabsContent>
          </Tabs>
      )}
    </LayoutPrincipal>
  );
};

export default GerenciarModelosSocietarios;