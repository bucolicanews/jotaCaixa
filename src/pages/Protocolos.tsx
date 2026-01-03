import { useState, useEffect, useCallback } from 'react';
import LayoutPrincipal from '@/components/LayoutPrincipal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, PlusCircle, Search, FileText, Edit, Trash2, Share2, Printer, MoreVertical, CheckCircle } from 'lucide-react';
import { useSessao } from '@/hooks/use-sessao';
import { showError, showSuccess } from '@/utils/toast';
import { supabase } from '@/integrations/supabase/client';
import { useProtocolos, ProtocoloStatus } from '@/hooks/use-protocolos';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import FormProtocolo from '@/components/protocolos/FormProtocolo';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { BASE_URL } from '@/config/app-config';
import { usePrint } from '@/hooks/use-print';
import { useToast } from '@/hooks/use-toast';
import ReactDOMServer from 'react-dom/server';

// Definindo os tipos com base nos requisitos
interface Protocolo {
  id: string;
  numero_protocolo: string;
  status: ProtocoloStatus;
  id_cliente: string;
  nome_resp_recebimento: string;
  created_at: string;
  tbl_clientes: { nome: string } | null;
  url_img_protocolo: string | null;
  anexos: string[] | null;
}

const statusColumns: ProtocoloStatus[] = ['Impresso', 'Trânsito', 'Entregue', 'Cancelado', 'Problema'];

const ProtocolosPage = () => {
  const { role, perfil, carregando: carregandoSessao } = useSessao();
  const { protocolos, carregando, refetch, filtroTexto, setFiltroTexto, handleUpdateStatus, handleDeleteProtocolo } = useProtocolos();
  const [dialogAberto, setDialogAberto] = useState(false);
  const { toast } = useToast();
  const { printContent } = usePrint();

  const handleSaveComplete = () => {
    setDialogAberto(false);
    refetch();
  }

  const getStatusBadge = (status: ProtocoloStatus) => {
    switch (status) {
      case 'Impresso': return <Badge variant="warning">Impresso</Badge>;
      case 'Trânsito': return <Badge variant="default">Em Trânsito</Badge>;
      case 'Entregue': return <Badge variant="success">Entregue</Badge>;
      case 'Cancelado': return <Badge variant="destructive">Cancelado</Badge>;
      case 'Problema': return <Badge variant="destructive">Problema</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };
  
  const handleShare = (protocolo: Protocolo) => {
    const link = `${BASE_URL}/protocolo/confirmar/${protocolo.id}`;
    navigator.clipboard.writeText(link);
    showSuccess('Link de confirmação copiado para a área de transferência.');
  };
  
  const handlePrint = (protocolo: Protocolo) => {
      const printHtml = `
        <div style="padding: 20px;">
            <h1 style="font-size: 18px; font-weight: bold;">Protocolo de Entrega</h1>
            <p>Número: ${protocolo.numero_protocolo}</p>
            <p>Cliente: ${protocolo.tbl_clientes?.nome || 'N/A'}</p>
            <p>Status: ${protocolo.status}</p>
            <p>Responsável: ${protocolo.nome_resp_recebimento || 'Pendente'}</p>
            
            ${protocolo.url_img_protocolo ? `<img src="${protocolo.url_img_protocolo}" style="max-width: 100%; margin-top: 20px;" />` : ''}
        </div>
      `;
      printContent(printHtml, `Protocolo ${protocolo.numero_protocolo}`);
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
          <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Novo Protocolo</DialogTitle>
            </DialogHeader>
            <FormProtocolo onSuccess={handleSaveComplete}>
                {/* O conteúdo do formulário é renderizado dentro do FormProtocolo */}
            </FormProtocolo>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="Buscar por número, cliente..."
            className="pl-10"
            value={filtroTexto}
            onChange={(e) => setFiltroTexto(e.target.value)}
          />
        </div>
      </div>
      
      <Card>
        <CardHeader><CardTitle>Lista de Protocolos ({protocolos.length})</CardTitle></CardHeader>
        <CardContent>
            <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[150px]">Nº Protocolo</TableHead>
                            <TableHead className="min-w-[150px]">Cliente</TableHead>
                            <TableHead className="min-w-[200px]">Responsável</TableHead>
                            <TableHead className="w-[100px]">Status</TableHead>
                            <TableHead className="w-[100px]">Data Criação</TableHead>
                            <TableHead className="w-[120px] text-right">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {carregando ? (
                            <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></TableCell></TableRow>
                        ) : protocolos.length === 0 ? (
                            <TableRow><TableCell colSpan={6} className="text-center py-4 text-muted-foreground">Nenhum protocolo encontrado.</TableCell></TableRow>
                        ) : (
                            protocolos.map(p => (
                                <TableRow key={p.id}>
                                    <TableCell className="font-semibold">{p.numero_protocolo || p.id.substring(0, 8)}</TableCell>
                                    <TableCell>{p.tbl_clientes?.nome || 'N/A'}</TableCell>
                                    <TableCell className="text-sm text-muted-foreground">{p.nome_resp_recebimento || 'Pendente'}</TableCell>
                                    <TableCell>{getStatusBadge(p.status)}</TableCell>
                                    <TableCell className="text-sm">{format(new Date(p.created_at), 'dd/MM/yyyy')}</TableCell>
                                    <TableCell className="text-right">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => handleShare(p)}>
                                                    <Share2 className="mr-2 h-4 w-4" />
                                                    <span>Compartilhar Link</span>
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => handlePrint(p)}>
                                                    <Printer className="mr-2 h-4 w-4" />
                                                    <span>Imprimir</span>
                                                </DropdownMenuItem>
                                                {p.status !== 'Entregue' && (
                                                    <DropdownMenuItem onClick={() => handleUpdateStatus(p.id, 'Entregue')}>
                                                        <CheckCircle className="mr-2 h-4 w-4 text-green-600" />
                                                        <span>Marcar como Entregue</span>
                                                    </DropdownMenuItem>
                                                )}
                                                <DropdownMenuItem onClick={() => handleDeleteProtocolo(p)}>
                                                    <Trash2 className="mr-2 h-4 w-4 text-red-500" />
                                                    <span>Excluir</span>
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </CardContent>
      </Card>
    </LayoutPrincipal>
  );
};

export default ProtocolosPage;