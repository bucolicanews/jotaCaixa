import React, { useState, useEffect, useCallback, useMemo } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Plus, FileText, Trash2, Edit, Tag, ArrowRight, Building2, ChevronLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { DocumentoSocietarioModelo } from '@/types/documentos-societarios';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import FormDocumentoSocietarioModelo from '@/components/formularios/FormDocumentoSocietarioModelo';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Link } from 'react-router-dom';

// Extensão local para DocumentoSocietarioModelo
interface ExtendedDocumentoSocietarioModelo extends DocumentoSocietarioModelo {
    tipo_conteudo?: 'html' | 'texto';
}

const GerenciarModelosSocietarios: React.FC = () => {
  const { role, perfil, usuario, carregando: carregandoSessao } = useSessao();
  const [modelos, setModelos] = useState<DocumentoSocietarioModelo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [modeloSelecionado, setModeloSelecionado] = useState<DocumentoSocietarioModelo | null>(null);
  const [activeTab, setActiveTab] = useState('meus_modelos');

  const isAdmin = role === 'Admin';
  const isCliente = role === 'Cliente';
  
  // ID do proprietário (Admin ou Cliente)
  const getOwnerId = () => {
    if (isAdmin) return usuario?.id || null;
    if (isCliente) return (perfil as ClienteProfile)?.id;
    if (role === 'Usuario') return (perfil as UsuarioProfile)?.cliente_id;
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
      .from('modelos_societarios')
      .select('*')
      .order('titulo', { ascending: true });
      
    // Se for Cliente ou Admin, busca seus próprios modelos E modelos globais (proprietario_id is null)
    if (isCliente || isAdmin) {
        // Construção segura da cláusula OR
        const orClause = `proprietario_id.eq.${ownerId},proprietario_id.is.null`;
        query = query.or(orClause);
    }
    // Se for Admin, a RLS permite ver todos os modelos (seus e dos clientes)

    const { data, error } = await query;

    if (error) {
      console.error('Erro ao carregar modelos:', error);
      showError('Erro ao carregar modelos: ' + error.message);
      setModelos([]);
    } else {
      setModelos(data as DocumentoSocietarioModelo[]);
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
      if (!isAdmin) {
          // Cliente/Usuário só vê seus próprios modelos
          return { meusModelos: modelos, modelosClientes: [] };
      }
      
      // Admin: Separa modelos próprios (proprietario_id = ownerId) e modelos de clientes (proprietario_id != ownerId)
      const meusModelos = modelos.filter(m => m.proprietario_id === ownerId);
      const modelosClientes = modelos.filter(m => m.proprietario_id !== ownerId);
      
      return { meusModelos, modelosClientes };
  }, [modelos, isAdmin, ownerId]);
  
  const modelosParaExibir = isAdmin && activeTab === 'modelos_clientes' 
      ? modelosFiltrados.modelosClientes 
      : modelosFiltrados.meusModelos;
      
  const isSupervisao = isAdmin && activeTab === 'modelos_clientes';

  // Helper para renderizar a lista de modelos
  const renderModelosList = (list: DocumentoSocietarioModelo[], isSupervisao: boolean) => (
      <div className="space-y-4">
          {list.map((modelo) => {
              // Apenas o proprietário ou Admin (no modo não supervisão) pode editar/deletar
              const canEditOrDelete = modelo.proprietario_id === ownerId || isAdmin && !isSupervisao;
              
              return (
                  <div key={modelo.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-secondary/50 transition-colors">
                      <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">{modelo.titulo}</p>
                          {isSupervisao && <p className="text-xs text-muted-foreground">Proprietário ID: {modelo.proprietario_id}</p>}
                          <p className="text-sm text-muted-foreground">Última atualização: {new Date(modelo.criado_em).toLocaleDateString()}</p>
                      </div>
                      <div className="flex space-x-2 ml-4">
                          <Link to={`/documentos-societarios/gerar/${modelo.id}`}>
                              <Button variant="secondary" size="sm" title="Usar Modelo">
                                  <ArrowRight className="w-4 h-4 mr-2" /> Gerar
                              </Button>
                          </Link>
                          <Button variant="outline" size="icon" onClick={() => handleEdit(modelo)} disabled={!canEditOrDelete} title={canEditOrDelete ? "Editar Modelo" : "Apenas visualização"}>
                              <Edit className="w-4 h-4" />
                          </Button>
                          <Button variant="destructive" size="icon" onClick={() => handleDelete(modelo.id)} disabled={!canEditOrDelete} title={canEditOrDelete ? "Excluir Modelo" : "Apenas visualização"}>
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
  
  if (!ownerId && !isAdmin) {
      return (
          <LayoutPrincipal>
              <Card><CardContent className="p-6">Você não tem permissão para gerenciar modelos de documentos societários.</CardContent></Card>
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
          <FileText className="w-6 h-6 mr-2" /> Gerenciar Modelos Societários
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
                      <DialogContent className="w-full sm:max-w-[90vw] max-h-[95vh] overflow-y-auto">
                          <DialogHeader>
                              <DialogTitle>{modeloSelecionado ? 'Editar Modelo' : 'Criar Novo Modelo'}</DialogTitle>
                          </DialogHeader>
                          <FormDocumentoSocietarioModelo
                              modeloInicial={modeloSelecionado}
                              onSaveComplete={handleSaveComplete}
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
                      renderModelosList(modelosParaExibir, isSupervisao)
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
              <TabsList className="grid w-full grid-cols-2">
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