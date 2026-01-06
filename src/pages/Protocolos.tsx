import { useState, useEffect } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, PlusCircle, LayoutGrid, List } from 'lucide-react';
import { useSessao } from '@/hooks/use-sessao';
import { supabase } from '@/integrations/supabase/client';
import { useProtocolos } from '@/hooks/use-protocolos';
import FormProtocolo from '@/components/protocolos/FormProtocolo';
import { ProtocoloKanbanView } from '@/components/protocolos/ProtocoloKanbanView';
import { ProtocoloListView } from '@/components/protocolos/ProtocoloListView';
import { ProtocoloFiltros, FiltrosProtocolo } from '@/components/protocolos/ProtocoloFiltros';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Protocolo } from '@/types/protocolo';

const ProtocolosPage = () => {
  const { role, perfil, carregando: carregandoSessao } = useSessao();
  const { protocolos, carregando, refetch, handleUpdateStatus, handleDeleteProtocolo, handleUpdateProtocolo } = useProtocolos();
  const [clientes, setClientes] = useState<Array<{id: string, nome: string}>>([]);
  const [protocolosFiltrados, setProtocolosFiltrados] = useState(protocolos);
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [protocoloParaEditar, setProtocoloParaEditar] = useState<Protocolo | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const handleSaveComplete = () => {
    refetch();
  }

  const handleEditProtocolo = (protocolo: Protocolo) => {
    setProtocoloParaEditar(protocolo);
    setIsEditDialogOpen(true);
  };

  const handleCloseEditDialog = (open: boolean) => {
    setIsEditDialogOpen(open);
    if (!open) {
      setProtocoloParaEditar(null);
    }
  };

  useEffect(() => {
    setProtocolosFiltrados(protocolos);
  }, [protocolos]);

  useEffect(() => {
    const fetchClientes = async () => {
      const { data, error } = await supabase.from('tbl_clientes').select('id, nome').order('nome');
      if (!error && data) {
        setClientes(data);
      }
    };
    fetchClientes();
  }, []);

  const handleFilter = (filtros: FiltrosProtocolo) => {
    let filtered = [...protocolos];

    if (filtros.texto) {
      const textoLower = filtros.texto.toLowerCase();
      filtered = filtered.filter(p =>
        p.numero_protocolo?.toLowerCase().includes(textoLower) ||
        p.tbl_clientes?.nome?.toLowerCase().includes(textoLower) ||
        p.nome_resp_recebimento?.toLowerCase().includes(textoLower)
      );
    }

    if (filtros.clienteId) {
      filtered = filtered.filter(p => p.cliente_id === filtros.clienteId);
    }

    if (filtros.status) {
      filtered = filtered.filter(p => p.status === filtros.status);
    }

    if (filtros.dataInicio) {
      filtered = filtered.filter(p => new Date(p.data_criacao) >= filtros.dataInicio!);
    }

    if (filtros.dataFim) {
      filtered = filtered.filter(p => new Date(p.data_criacao) <= filtros.dataFim!);
    }

    if (filtros.usuarioCriador) {
      const usuarioLower = filtros.usuarioCriador.toLowerCase();
      filtered = filtered.filter(p => p.usuario_criador_nome?.toLowerCase().includes(usuarioLower));
    }

    setProtocolosFiltrados(filtered);
  };

  const canAccessPage = role === 'Admin' || (perfil as any)?.permissoes?.protocolos === true;

  if (carregandoSessao) {
    return (
      <LayoutPrincipal>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </LayoutPrincipal>
    );
  }
  
  if (!canAccessPage) {
    return (
      <LayoutPrincipal>
        <Card><CardHeader><CardTitle>Acesso Negado</CardTitle></CardHeader><CardContent><p>Você não tem permissão para acessar os protocolos.</p></CardContent></Card>
      </LayoutPrincipal>
    );
  }

  return (
    <LayoutPrincipal>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Protocolos</h1>
          <p className="text-muted-foreground">Gerencie protocolos de entrega</p>
        </div>
        <div className="flex items-center gap-4">
          <ToggleGroup type="single" value={viewMode} onValueChange={(value) => value && setViewMode(value as 'kanban' | 'list')}>
            <ToggleGroupItem value="kanban" aria-label="Visualização Kanban">
              <LayoutGrid className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="Visualização Lista">
              <List className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>
          <FormProtocolo onSuccess={handleSaveComplete}>
            <Button>
              <PlusCircle className="w-4 h-4 mr-2" />
              Novo Protocolo
            </Button>
          </FormProtocolo>
        </div>
      </div>

      <ProtocoloFiltros onFilter={handleFilter} clientes={clientes} />

      <div className="mt-6">
        {carregando ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : viewMode === 'kanban' ? (
          <ProtocoloKanbanView
            protocolos={protocolosFiltrados}
            onUpdateStatus={handleUpdateStatus}
            onDelete={handleDeleteProtocolo}
            onEdit={handleEditProtocolo}
            isAdmin={role === 'Admin'}
          />
        ) : (
          <ProtocoloListView
            protocolos={protocolosFiltrados}
            onUpdateStatus={handleUpdateStatus}
            onDelete={handleDeleteProtocolo}
            onEdit={handleEditProtocolo}
            isAdmin={role === 'Admin'}
          />
        )}
      </div>

      <FormProtocolo
        protocolo={protocoloParaEditar || undefined}
        onSuccess={handleSaveComplete}
        onUpdate={handleUpdateProtocolo}
        externalOpen={isEditDialogOpen}
        onExternalOpenChange={handleCloseEditDialog}
      >
        <span />
      </FormProtocolo>
    </LayoutPrincipal>
  );
};

export default ProtocolosPage;
