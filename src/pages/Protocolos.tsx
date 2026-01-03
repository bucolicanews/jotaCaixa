import { useState } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, PlusCircle, Search } from 'lucide-react';
import { useSessao } from '@/hooks/use-sessao';
import { showError } from '@/utils/toast';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import FormProtocolo from '@/components/protocolos/FormProtocolo';

// Definindo os tipos com base nos requisitos
type ProtocoloStatus = 'Impresso' | 'Trânsito' | 'Entregue' | 'Cancelado' | 'Problema';

interface Cliente {
  id: string;
  nome: string;
}

interface Protocolo {
  id: string;
  numero_protocolo: string;
  status: ProtocoloStatus;
  id_cliente: string;
  nome_resp_recebimento: string;
  created_at: string;
  tbl_clientes: Cliente | null;
}

const statusColumns: ProtocoloStatus[] = ['Impresso', 'Trânsito', 'Entregue', 'Cancelado', 'Problema'];

const ProtocolosPage = () => {
  const { session, role, perfil, carregando: carregandoSessao } = useSessao();
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogAberto, setDialogAberto] = useState(false);

  const fetchProtocolos = async () => {
    const { data, error } = await supabase
      .from('protocolos')
      .select('*, tbl_clientes(id, nome)');

    if (error) {
      // Este erro deve desaparecer após a migração ser aplicada
      showError('Erro ao carregar protocolos: ' + error.message);
      throw new Error(error.message);
    }
    return data as Protocolo[];
  };

  const { data: protocolos = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['protocolos'],
    queryFn: fetchProtocolos,
    enabled: !carregandoSessao && !!session, // Só executa se a sessão estiver carregada
  });

  const handleSaveComplete = () => {
    setDialogAberto(false);
    refetch(); // Re-busca os protocolos após salvar
  }

  const filteredProtocolos = protocolos.filter(p => {
    const searchTermLower = searchTerm.toLowerCase();
    const numeroProtocolo = p.numero_protocolo || '';
    const nomeCliente = p.tbl_clientes?.nome || '';
    
    return numeroProtocolo.toLowerCase().includes(searchTermLower) ||
           nomeCliente.toLowerCase().includes(searchTermLower);
  });

  const protocolosPorStatus = (status: ProtocoloStatus) => {
    return filteredProtocolos.filter(p => p.status === status);
  };
  
  // Verificação de permissão
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
        <h1 className="text-3xl font-bold">Protocolos</h1>
        <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
          <DialogTrigger asChild>
            <Button>
              <PlusCircle className="w-4 h-4 mr-2" />
              Novo Protocolo
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Novo Protocolo</DialogTitle>
            </DialogHeader>
            <FormProtocolo onSaveComplete={handleSaveComplete} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="Buscar por número, cliente..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>
      
      {isLoading && (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {isError && (
        <div className="text-red-500 text-center p-4 border border-red-200 rounded-md bg-red-50">
            <strong>Erro ao carregar os dados.</strong>
            <p>Verifique se a migração do banco de dados foi aplicada corretamente.</p>
        </div>
      )}

      {!isLoading && !isError && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {statusColumns.map(status => (
            <div key={status} className="w-72 flex-shrink-0 bg-muted/50 rounded-lg">
              <h2 className="text-lg font-semibold p-4 border-b">{status} ({protocolosPorStatus(status).length})</h2>
              <div className="p-2 space-y-2 h-full">
                {protocolosPorStatus(status).map(protocolo => (
                  <Card key={protocolo.id} className="bg-card">
                    <CardContent className="p-3">
                      <p className="font-semibold">{protocolo.tbl_clientes?.nome || 'Cliente não encontrado'}</p>
                      <p className="text-sm text-muted-foreground">Protocolo: {protocolo.numero_protocolo}</p>
                      <p className="text-sm text-muted-foreground">Responsável: {protocolo.nome_resp_recebimento}</p>
                    </CardContent>
                  </Card>
                ))}
                {protocolosPorStatus(status).length === 0 && (
                    <div className="text-center text-sm text-muted-foreground p-4">
                        Nenhum protocolo aqui.
                    </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </LayoutPrincipal>
  );
};

export default ProtocolosPage;