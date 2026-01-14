import { useState } from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Printer,
  Truck,
  CheckCircle,
  MoreVertical,
  Eye,
  Trash2,
  Pencil,
} from 'lucide-react';
import { DarBaixaProtocoloDialog } from './DarBaixaProtocoloDialog';
import { ImprimirProtocolo } from './ImprimirProtocolo';
import { usePrint } from '@/hooks/use-print';
import ReactDOMServer from 'react-dom/server';
import { Protocolo } from '@/types/protocolo';

interface ProtocoloKanbanViewProps {
  protocolos: Protocolo[];
  onUpdateStatus: (id: string, newStatus: string) => Promise<void>;
  onDelete: (protocolo: Protocolo) => Promise<void>;
  onEdit: (protocolo: Protocolo) => void;
  isAdmin: boolean;
}

const statusColumns = ['Criado', 'Impresso', 'Trânsito', 'Entregue'] as const;

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

export function ProtocoloKanbanView({
  protocolos,
  onUpdateStatus,
  onDelete,
  onEdit,
  isAdmin,
}: ProtocoloKanbanViewProps) {
  const [selectedProtocolo, setSelectedProtocolo] = useState<Protocolo | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isDarBaixaOpen, setIsDarBaixaOpen] = useState(false);
  const [protocoloParaBaixa, setProtocoloParaBaixa] = useState<Protocolo | null>(null);
  const [protocoloParaImprimir, setProtocoloParaImprimir] = useState<Protocolo | null>(null);
  const [isImprimirOpen, setIsImprimirOpen] = useState(false);
  const { printContent } = usePrint();

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return '-';
    try {
      return format(new Date(dateString), 'dd/MM/yyyy HH:mm');
    } catch {
      return '-';
    }
  };

  const getProtocolosByStatus = (status: string) => {
    return protocolos.filter((p) => p.status === status);
  };

  const handleStatusTransition = async (protocolo: Protocolo) => {
    // Se está em "Criado", ao marcar como "Impresso" deve abrir dialog de impressão
    if (protocolo.status === 'Criado') {
      setProtocoloParaImprimir(protocolo);
      setIsImprimirOpen(true);
      return;
    }
    
    // Se está em "Trânsito", ao marcar como "Entregue" deve abrir dialog de dar baixa
    if (protocolo.status === 'Trânsito') {
      setProtocoloParaBaixa(protocolo);
      setIsDarBaixaOpen(true);
      return;
    }

    // Para outros casos, apenas atualiza o status
    let newStatus: string | null = null;
    
    switch (protocolo.status) {
      case 'Impresso':
        newStatus = 'Trânsito';
        break;
      default:
        return;
    }

    if (newStatus) {
      await onUpdateStatus(protocolo.id, newStatus);
    }
  };

  const handleConfirmarImpressao = async () => {
    if (!protocoloParaImprimir) return;
    
    const printComponent = <ImprimirProtocolo protocolo={protocoloParaImprimir} />;
    const htmlContent = ReactDOMServer.renderToStaticMarkup(printComponent);
    printContent(htmlContent, `Protocolo ${protocoloParaImprimir.numero_protocolo}`);
    
    // Só atualiza status para "Impresso" se o protocolo ainda estiver em "Criado"
    if (protocoloParaImprimir.status === 'Criado') {
      try {
        await onUpdateStatus(protocoloParaImprimir.id, 'Impresso');
      } catch (e) {
        console.error('Erro ao atualizar status:', e);
      }
    }
    
    // Fecha dialog
    setIsImprimirOpen(false);
    setProtocoloParaImprimir(null);
  };

  const getTransitionButton = (protocolo: Protocolo) => {
    switch (protocolo.status) {
      case 'Criado':
        return {
          label: 'Marcar como Impresso',
          icon: <Printer className="h-4 w-4 mr-2" />,
        };
      case 'Impresso':
        return {
          label: 'Marcar como Trânsito',
          icon: <Truck className="h-4 w-4 mr-2" />,
        };
      case 'Trânsito':
        return {
          label: 'Marcar como Entregue',
          icon: <CheckCircle className="h-4 w-4 mr-2" />,
        };
      default:
        return null;
    }
  };

  const openDetails = (protocolo: Protocolo) => {
    setSelectedProtocolo(protocolo);
    setIsDetailsOpen(true);
  };

  const closeDetails = () => {
    setIsDetailsOpen(false);
    setSelectedProtocolo(null);
  };

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statusColumns.map((status) => (
          <div key={status} className="flex flex-col">
            <div className="mb-4">
              <h3 className="font-semibold text-lg mb-2">{status}</h3>
              <div className={`h-1 ${statusColors[status]} rounded`} />
            </div>
            <div className="space-y-3">
              {getProtocolosByStatus(status).map((protocolo) => {
                const transitionButton = getTransitionButton(protocolo);
                
                return (
                  <Card key={protocolo.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="font-semibold text-sm">
                            {protocolo.numero_protocolo}
                          </div>
                          <Badge
                            variant={statusBadgeVariants[protocolo.status]}
                            className="mt-1"
                          >
                            {protocolo.status}
                          </Badge>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openDetails(protocolo)}>
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
                              <DropdownMenuItem
                                onClick={() => {
                                  setProtocoloParaImprimir(protocolo);
                                  setIsImprimirOpen(true);
                                }}
                              >
                                <Printer className="h-4 w-4 mr-2" />
                                Imprimir Protocolo
                              </DropdownMenuItem>
                            )}
                            {transitionButton && (
                              <DropdownMenuItem
                                onClick={() => handleStatusTransition(protocolo)}
                              >
                                {transitionButton.icon}
                                {transitionButton.label}
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
                      </div>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                      <div>
                        <div className="text-xs text-muted-foreground">Cliente</div>
                        <div className="font-medium">
                          {protocolo.tbl_clientes?.nome || '-'}
                        </div>
                      </div>
                      {protocolo.titulo && (
                        <div>
                          <div className="text-xs text-muted-foreground">Título</div>
                          <div className="font-medium text-sm">
                            {protocolo.titulo.length > 50 
                              ? protocolo.titulo.substring(0, 50) + '...' 
                              : protocolo.titulo}
                          </div>
                        </div>
                      )}
                      {protocolo.descricao && (
                        <div>
                          <div className="text-xs text-muted-foreground">Descrição</div>
                          <div className="text-sm text-muted-foreground line-clamp-2">
                            {protocolo.descricao.length > 80 
                              ? protocolo.descricao.substring(0, 80) + '...' 
                              : protocolo.descricao}
                          </div>
                        </div>
                      )}
                      <div>
                        <div className="text-xs text-muted-foreground">Responsável</div>
                        <div>{protocolo.nome_resp_recebimento || '-'}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Criado em</div>
                        <div>{formatDate(protocolo.data_criacao)}</div>
                      </div>
                      {protocolo.data_impressao && (
                        <div>
                          <div className="text-xs text-muted-foreground">Impresso em</div>
                          <div>{formatDate(protocolo.data_impressao)}</div>
                        </div>
                      )}
                      <div>
                        <div className="text-xs text-muted-foreground">Criado por</div>
                        <div>{protocolo.usuario_criador_nome || '-'}</div>
                      </div>

                      {/* Link da Tarefa */}
                      {protocolo.link_tarefa && (
                        <div className="mt-2 pt-2 border-t">
                          <div className="text-xs text-muted-foreground mb-1">Link da Tarefa</div>
                          <a
                            href={protocolo.link_tarefa}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                            <span className="truncate">Abrir Tarefa</span>
                          </a>
                        </div>
                      )}

                      {/* Arquivos Anexos */}
                      {protocolo.anexos && protocolo.anexos.length > 0 && (
                        <div className="mt-2 pt-2 border-t">
                          <div className="text-xs text-muted-foreground mb-1">Arquivos Anexos</div>
                          <div className="space-y-1">
                            {protocolo.anexos.map((anexo, index) => {
                              const fileName = anexo.split('/').pop()?.split('-').slice(1).join('-') || `Anexo ${index + 1}`;
                              return (
                                <a
                                  key={index}
                                  href={anexo}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                                >
                                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                  <span className="truncate">{fileName.length > 25 ? fileName.substring(0, 25) + '...' : fileName}</span>
                                </a>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      
                      {(protocolo.status === 'Impresso' || protocolo.status === 'Trânsito' || protocolo.status === 'Entregue') && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full mt-2"
                          onClick={() => {
                            setProtocoloParaImprimir(protocolo);
                            setIsImprimirOpen(true);
                          }}
                        >
                          <Printer className="h-4 w-4 mr-2" />
                          Imprimir Protocolo
                        </Button>
                      )}
                      
                      {transitionButton && (
                        <Button
                          variant="default"
                          size="sm"
                          className="w-full"
                          onClick={() => handleStatusTransition(protocolo)}
                        >
                          {transitionButton.icon}
                          {transitionButton.label}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
              {getProtocolosByStatus(status).length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-8 border-2 border-dashed rounded-lg">
                  Nenhum protocolo
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

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
                  <div className="text-sm font-medium text-muted-foreground">
                    Número do Protocolo
                  </div>
                  <div className="text-base font-semibold">
                    {selectedProtocolo.numero_protocolo}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Status</div>
                  <Badge variant={statusBadgeVariants[selectedProtocolo.status]}>
                    {selectedProtocolo.status}
                  </Badge>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Cliente</div>
                  <div className="text-base">{selectedProtocolo.tbl_clientes?.nome || '-'}</div>
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
            <Button variant="outline" onClick={closeDetails}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {protocoloParaBaixa && (
        <DarBaixaProtocoloDialog
          protocolo={protocoloParaBaixa}
          open={isDarBaixaOpen}
          onOpenChange={setIsDarBaixaOpen}
          onSuccess={async () => {
            setIsDarBaixaOpen(false);
            setProtocoloParaBaixa(null);
            // Atualizar status para forçar refetch dos dados
            await onUpdateStatus(protocoloParaBaixa.id, 'Entregue');
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
          <DialogFooter className="no-print">
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