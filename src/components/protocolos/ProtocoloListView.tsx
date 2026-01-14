import { useState, useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import { useSessao } from '@/hooks/use-sessao';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
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
import { Protocolo } from '@/types/protocolo';

interface ProtocoloListViewProps {
  protocolos: Protocolo[];
  onUpdateStatus: (id: string, newStatus: string) => Promise<void>;
  onDelete: (protocolo: Protocolo) => Promise<void>;
  onEdit: (protocolo: Protocolo) => void;
  isAdmin: boolean;
}

const statusBadgeVariants: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
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
  const { perfil } = useSessao();

  const [selectedProtocolo, setSelectedProtocolo] =
    useState<Protocolo | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const [isDarBaixaOpen, setIsDarBaixaOpen] = useState(false);
  const [protocoloParaBaixa, setProtocoloParaBaixa] =
    useState<Protocolo | null>(null);

  const [protocoloParaImprimir, setProtocoloParaImprimir] =
    useState<Protocolo | null>(null);
  const [isImprimirOpen, setIsImprimirOpen] = useState(false);
  
  const componentRef = useRef<HTMLDivElement>(null);

  const handleAfterPrint = async () => {
    if (!protocoloParaImprimir) return;
    if (protocoloParaImprimir.status === 'Criado') {
      try {
        await onUpdateStatus(protocoloParaImprimir.id, 'Impresso');
      } catch (error) {
        console.error('Falha ao atualizar status do protocolo:', error);
      }
    }
    setIsImprimirOpen(false);
    setProtocoloParaImprimir(null);
  };

  const handlePrint = useReactToPrint({
    content: () => componentRef.current,
    onAfterPrint: handleAfterPrint,
    pageStyle: `
      @page {
        size: A4 portrait;
        margin: 8mm;
      }
    `,
  });

  const formatDate = (date?: string | null) => {
    if (!date) return '-';
    try {
      return format(new Date(date), 'dd/MM/yyyy HH:mm');
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

    if (protocolo.status === 'Impresso') {
      await onUpdateStatus(protocolo.id, 'Trânsito');
      return;
    }

    if (protocolo.status === 'Trânsito') {
      setProtocoloParaBaixa(protocolo);
      setIsDarBaixaOpen(true);
      return;
    }

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
      {/* TABELA */}
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
                <TableCell colSpan={9} className="text-center py-8">
                  Nenhum protocolo encontrado
                </TableCell>
              </TableRow>
            ) : (
              protocolos.map((protocolo) => {
                const nextAction = getNextAction(protocolo);

                return (
                  <TableRow key={protocolo.id}>
                    <TableCell className="font-medium">
                      {protocolo.numero_protocolo}
                    </TableCell>

                    <TableCell>
                      <Badge
                        variant={statusBadgeVariants[protocolo.status]}
                      >
                        {protocolo.status}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      {protocolo.tbl_clientes?.nome || '-'}
                    </TableCell>

                    <TableCell className="max-w-[200px] truncate">
                      {protocolo.titulo || '-'}
                    </TableCell>

                    <TableCell>
                      {formatDate(protocolo.data_criacao)}
                    </TableCell>

                    <TableCell>
                      {protocolo.usuario_criador_nome || '-'}
                    </TableCell>

                    <TableCell>
                      {protocolo.anexos?.length ? (
                        <div className="flex items-center gap-1">
                          <Download className="h-4 w-4" />
                          {protocolo.anexos.length}
                        </div>
                      ) : (
                        '-'
                      )}
                    </TableCell>

                    <TableCell>
                      {protocolo.link_tarefa ? (
                        <a
                          href={protocolo.link_tarefa}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      ) : (
                        '-'
                      )}
                    </TableCell>

                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>

                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedProtocolo(protocolo);
                              setIsDetailsOpen(true);
                            }}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            Ver detalhes
                          </DropdownMenuItem>

                          {(protocolo.status === 'Criado' ||
                            protocolo.status === 'Impresso') && (
                            <DropdownMenuItem
                              onClick={() => onEdit(protocolo)}
                            >
                              <Pencil className="h-4 w-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                          )}

                          <DropdownMenuItem
                            onClick={() => {
                              setProtocoloParaImprimir(protocolo);
                              setIsImprimirOpen(true);
                            }}
                          >
                            <Printer className="h-4 w-4 mr-2" />
                            Imprimir Protocolo
                          </DropdownMenuItem>

                          {nextAction && (
                            <DropdownMenuItem
                              onClick={() =>
                                handleStatusTransition(protocolo)
                              }
                            >
                              {nextAction.icon}
                              <span className="ml-2">
                                {nextAction.label}
                              </span>
                            </DropdownMenuItem>
                          )}

                          {isAdmin && (protocolo.status === 'Criado' || protocolo.status === 'Impresso') && (
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => onDelete(protocolo)}
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

      {/* MODAL DETALHES */}
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
                          <span className="break-all">{fileName.length > 25 ? fileName.substring(0, 25) + '...' : fileName}</span>
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

      {/* DAR BAIXA */}
      {protocoloParaBaixa && (
        <DarBaixaProtocoloDialog
          protocolo={protocoloParaBaixa}
          open={isDarBaixaOpen}
          onOpenChange={setIsDarBaixaOpen}
          onSuccess={() => {
            setIsDarBaixaOpen(false);
            setProtocoloParaBaixa(null);
            onUpdateStatus(protocoloParaBaixa.id, 'Entregue');
          }}
        />
      )}

      {/* MODAL IMPRESSÃO (agora com o componente de impressão invisível) */}
      <Dialog open={isImprimirOpen} onOpenChange={setIsImprimirOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="no-print">
            <DialogTitle>
              Protocolo de Entrega –{' '}
              {protocoloParaImprimir?.numero_protocolo}
            </DialogTitle>
            <DialogDescription>
              O documento será impresso em duas vias.
            </DialogDescription>
          </DialogHeader>
          
          {/* Componente de impressão visível no modal, mas com ref */}
          <div className="print-area">
            {protocoloParaImprimir && <ImprimirProtocolo ref={componentRef} protocolo={protocoloParaImprimir} />}
          </div>

          <DialogFooter className="no-print">
            <Button
              variant="outline"
              onClick={() => setIsImprimirOpen(false)}
            >
              Cancelar
            </Button>
            <Button onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-2" />
              Imprimir e Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}