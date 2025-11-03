import React, { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Plus, FileText, Trash2, Edit } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { ContratoModelo } from '@/types/contratos';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import FormContratoModelo from '@/components/FormContratoModelo';
import { ClienteProfile, UsuarioProfile } from '@/types/usuario';
import ImportarModeloContrato from '@/components/ImportarModeloContrato';
import { cn } from '@/lib/utils';

const GerenciarModelos: React.FC = () => {
  const { role, perfil, usuario, carregando: carregandoSessao } = useSessao();
  const [modelos, setModelos] = useState<ContratoModelo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [modeloSelecionado, setModeloSelecionado] = useState<ContratoModelo | null>(null);

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
    if (!ownerId) {
        setModelos([]);
        setCarregando(false);
        return;
    }
    
    setCarregando(true);
    
    const { data, error } = await supabase
      .from('contrato_modelos')
      .select('*')
      .eq('empresa_id', ownerId)
      .order('titulo', { ascending: true });

    if (error) {
      showError('Erro ao carregar modelos: ' + error.message);
      setModelos([]);
    } else {
      setModelos(data as ContratoModelo[]);
    }
    setCarregando(false);
  }, [ownerId]);

  useEffect(() => {
    if (!carregandoSessao && ownerId) {
      buscarModelos();
    }
  }, [carregandoSessao, ownerId, buscarModelos]);
  
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
          <DialogContent className="fixed inset-0 w-full h-full max-w-none sm:max-w-5xl sm:h-auto sm:max-h-[95vh] sm:rounded-lg sm:left-[50%] sm:top-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] overflow-y-auto">
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
      
      {/* Ajuste aqui: Centralizando o componente de importação */}
      <div className="grid grid-cols-1 gap-6 mb-6">
          <div className="max-w-lg mx-auto w-full">
              <ImportarModeloContrato 
                  empresaId={ownerId} 
                  onImportComplete={buscarModelos} 
              />
          </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Modelos Cadastrados ({modelos.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {carregando ? (
            <div className="flex justify-center items-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : modelos.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhum modelo de contrato encontrado.</p>
          ) : (
            <div className="space-y-4">
              {modelos.map((modelo) => (
                <div key={modelo.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-secondary/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{modelo.titulo}</p>
                    <p className="text-sm text-muted-foreground">Última atualização: {new Date(modelo.updated_at).toLocaleDateString()}</p>
                  </div>
                  <div className="flex space-x-2 ml-4">
                    <Button variant="outline" size="icon" onClick={() => handleEdit(modelo)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button variant="destructive" size="icon" onClick={() => handleDelete(modelo.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </LayoutPrincipal>
  );
};

export default GerenciarModelos;