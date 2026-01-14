import { useState } from 'react';
import { useSessao } from '@/hooks/use-sessao';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Printer,
  Truck,
  CheckCircle,
  MoreVertical,
  Eye,
  Trash2,
  ExternalLink,
  Download,
  Pencil,
} from 'lucide-react';
import { DarBaixaProtocoloDialog } from './DarBaixaProtocoloDialog';
import { ImprimirProtocolo } from './ImprimirProtocolo';
import { usePrint } from '@/hooks/use-print';
import ReactDOMServer from 'react-dom/server';
import { Protocolo } from '@/types/protocolo';

interface ProtocoloListViewProps {
  protocolos: Protocolo[];
  onUpdateStatus: (id: string, newStatus: string) => Promise<void>;
  onDelete: (protocolo: Protocolo) => Promise<void>;
  onEdit: (protocolo: Protocolo) => void;
  isAdmin: boolean;
}

const statusColors: Record<string, string> = {
  Criado: 'bg-blue-500',
  Impresso: 'bg-yellow-500',
  Trânsito: 'bg-orange-500',
  Entregue: 'bg-green-500',
};

const statusBadgeVariants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  Criado: 'default',
  Impresso: 'secondary',
  Trânsito: 'outline',
  Entregue: 'default',
};



export function ProtocoloListView({
  protocolos,
  onUpdateStatus,
  onDelete,
  onEdit,
  isAdmin,
}: ProtocoloListViewProps) {
  const [selectedProtocolo, setSelectedProtocolo] = useState<Protocolo | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isDarBaixaOpen, setIsDarBaixaOpen] = useState(false);
  const [protocoloParaBaixa, setProtocoloParaBaixa] = useState<Protocolo | null>(null);
  const [protocoloParaImprimir, setProtocoloParaImprimir] = useState<Protocolo | null>(null);
  const [isImprimirOpen, setIsImprimirOpen] = useState(false);
  const { printContent } = usePrint();
  const { perfil } = useSessao();

  const formatDate = (dateString: string | undefined | null) => {
    if (!dateString) return '-';
    try {
      return format(new Date(dateString), 'dd/MM/yyyy HH:mm');
    } catch {
      return '-';
    }
  };

  const handleStatusTransition = async (protocolo: Protocolo) => {
    if (protocolo.status === 'Criado') {
      setProtocoloParaImprimir(protocolo);
      setIsImprimirOpen(true);
      return;
    }
    
    if (protocolo.status === 'Trânsito') {
      setProtocoloParaBaixa(protocolo);
      setIsDarBaixaOpen(true);
      return;
    }

    if (protocolo.status === 'Impresso') {
      await onUpdateStatus(protocolo.id, 'Trânsito');
    }
  };

  const handleConfirmarImpressao = async () => {
    if (!protocoloParaImprimir) return;
    
    const printComponent = <ImprimirProtocolo protocolo={protocoloParaImprimir} />;
    const htmlContent = ReactDOMServer.renderToStaticMarkup(printComponent);
    printContent(htmlContent, `Protocolo ${protocoloParaImprimir.numero_protocolo}`);
    
    if (protocoloParaImprimir.status === 'Criado') {
      try {
        await onUpdateStatus(protocoloParaImprimir.id, 'Impresso');
      } catch (e) {
        console.error('Erro ao atualizar status:', e);
      }
    }
    
    setIsImprimirOpen(false);
    setProtocoloParaImprimir(null);
  };

  const getNextAction = (protocolo: Protocolo) => {
    switch (protocolo.status) {
      case 'Criado':
        return { label: 'Imprimir', icon: <Printer className="h-4 w-4" /> };
      case 'Impresso':
        return { label: 'Trânsito', icon: <Truck className="h-4 w-4" /> };
      case 'Trânsito':
        return { label: 'Entregue', icon: <CheckCircle className="h-4 w-4" /> };
      default:
        return null;
    }
  };

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Protocolo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Título</TableHead>
              <TableHead>Criado em</TableHead>
              <TableHead>Criado por</TableHead>
              <TableHead>Anexos</TableHead>
              <TableHead>Link</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {protocolos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  Nenhum protocolo encontrado
                </TableCell>
              </TableRow>
            ) : (
              protocolos.map((protocolo) => {
                const nextAction = getNextAction(protocolo);
                return (
                  <TableRow key={protocolo.id}>
                    <TableCell className="font-medium">{protocolo.numero_protocolo}</TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariants[protocolo.status]}>
                        {protocolo.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{protocolo.tbl_clientes?.nome || '-'}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{protocolo.titulo || '-'}</TableCell>
                    <TableCell>{formatDate(protocolo.data_criacao)}</TableCell>
                    <TableCell>{protocolo.usuario_criador_nome || '-'}</TableCell>
                    <TableCell>
                      {protocolo.anexos && protocolo.anexos.length > 0 ? (
                        <div className="flex items-center gap-1">
                          <Download className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{protocolo.anexos.length}</span>
                        </div>
                      ) : '-'}
                    </TableCell>
                    <TableCell>
                      {protocolo.link_tarefa ? (
                        <a
                          href={protocolo.link_tarefa}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => {
                            setSelectedProtocolo(protocolo);
                            setIsDetailsOpen(true);
                          }}>
                            <Eye className="h-4 w-4 mr-2" />
                            Ver detalhes
                          </DropdownMenuItem>
                          {(protocolo.status === 'Criado' || protocolo.status === 'Impresso') && (
                            <DropdownMenuItem onClick={() => onEdit(protocolo)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                          )}
                          {(protocolo.status === 'Impresso' || protocolo.status === 'Trânsito' || protocolo.status === 'Entregue') && (
                            <DropdownMenuItem onClick={() => {
                              setProtocoloParaImprimir(protocolo);
                              setIsImprimirOpen(true);
                            }}>
                              <Printer className="h-4 w-4 mr-2" />
                              Imprimir
                            </DropdownMenuItem>
                          )}
                          {nextAction && (
                            <DropdownMenuItem onClick={() => handleStatusTransition(protocolo)}>
                              {nextAction.icon}
                              <span className="ml-2">{nextAction.label}</span>
                            </DropdownMenuItem>
                          )}
                          {isAdmin && (protocolo.status === 'Criado' || protocolo.status === 'Impresso') && (
                            <DropdownMenuItem
                              onClick={() => onDelete(protocolo)}
                              className="text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Excluir
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Dialog de Detalhes */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes do Protocolo</DialogTitle>
            <DialogDescription>
              Informações completas do protocolo {selectedProtocolo?.numero_protocolo}
            </DialogDescription>
          </DialogHeader>
          {selectedProtocolo && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Número</div>
                  <div className="text-base font-semibold">{selectedProtocolo.numero_protocolo}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Status</div>
                  <Badge variant={statusBadgeVariants[selectedProtocolo.status]}>{selectedProtocolo.status}</Badge>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Cliente</div>
                  <div>{selectedProtocolo.tbl_clientes?.nome || '-'}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">
                    Responsável pelo Recebimento
                  </div>
                  <div className="text-base">
                    {selectedProtocolo.nome_resp_recebimento || '-'}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">
                    Data de Criação
                  </div>
                  <div className="text-base">
                    {formatDate(selectedProtocolo.data_criacao)}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">
                    Data de Impressão
                  </div>
                  <div className="text-base">
                    {formatDate(selectedProtocolo.data_impressao)}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Criado por</div>
                  <div className="text-base">
                    {selectedProtocolo.usuario_criador_nome || '-'}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">ID</div>
                  <div className="text-base font-mono text-xs">
                    {selectedProtocolo.id}
                  </div>
                </div>
              </div>
              {(selectedProtocolo.titulo || selectedProtocolo.descricao) && (
                <div className="space-y-3 border-t pt-4">
                  {selectedProtocolo.titulo && (
                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-1">
                        Título
                      </div>
                      <div className="text-base font-semibold">
                        {selectedProtocolo.titulo}
                      </div>
                    </div>
                  )}
                  {selectedProtocolo.descricao && (
                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-1">
                        Descrição
                      </div>
                      <div className="text-base whitespace-pre-wrap bg-muted/50 p-3 rounded-md">
                        {selectedProtocolo.descricao}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {selectedProtocolo.link_tarefa && (
                <div className="border-t pt-3">
                  <div className="text-sm font-medium text-muted-foreground mb-1">
                    Link da Tarefa
                  </div>
                  <a
                    href={selectedProtocolo.link_tarefa}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 hover:underline break-all"
                  >
                    {selectedProtocolo.link_tarefa}
                  </a>
                </div>
              )}
              {selectedProtocolo.anexos && selectedProtocolo.anexos.length > 0 && (
                <div className="border-t pt-3">
                  <div className="text-sm font-medium text-muted-foreground mb-2">
                    Arquivos Anexos ({selectedProtocolo.anexos.length})
                  </div>
                  <div className="space-y-2">
                    {selectedProtocolo.anexos.map((anexo, index) => {
                      const fileName = anexo.split('/').pop()?.split('-').slice(1).join('-') || `Anexo ${index + 1}`;
                      return (
                        <a
                          key={index}
                          href={anexo}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <span className="break-all">{fileName}</span>
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDetailsOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Dar Baixa */}
      {protocoloParaBaixa && (
        <DarBaixaProtocoloDialog
          protocolo={protocoloParaBaixa}
          open={isDarBaixaOpen}
          onOpenChange={setIsDarBaixaOpen}
          onSuccess={() => {
            setIsDarBaixaOpen(false);
            setProtocoloParaBaixa(null);
          }}
        />
      )}

      {/* Dialog de Impressão */}
      <Dialog open={isImprimirOpen} onOpenChange={setIsImprimirOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Protocolo de Entrega - {protocoloParaImprimir?.numero_protocolo}</DialogTitle>
            <DialogDescription>
              Este protocolo será impresso em duas vias.
            </DialogDescription>
          </DialogHeader>
          <div className="print-area">
            {protocoloParaImprimir && <ImprimirProtocolo protocolo={protocoloParaImprimir} />}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsImprimirOpen(false)}>Cancelar</Button>
            <Button onClick={handleConfirmarImpressao}>
              <Printer className="h-4 w-4 mr-2" />
              Imprimir e Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}