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
    }
  };

  const handleConfirmarImpressao = () => {
    if (!protocoloParaImprimir) {
      alert('Erro: Protocolo para impressão não selecionado.');
      return;
    }

    const afterPrint = async () => {
      // Garante que a lógica rode apenas uma vez e se limpa
      window.removeEventListener('afterprint', afterPrint);

      if (protocoloParaImprimir.status === 'Criado') {
        try {
          await onUpdateStatus(protocoloParaImprimir.id, 'Impresso');
        } catch (error) {
          console.error('Falha ao atualizar status do protocolo:', error);
        }
      }

      // Limpeza final
      setIsImprimirOpen(false);
      setProtocoloParaImprimir(null);
    };

    window.addEventListener('afterprint', afterPrint, { once: true });

    window.print();
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
                            Imprimir
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

                          {isAdmin &&
                            (protocolo.status === 'Criado' ||
                              protocolo.status === 'Impresso') && (
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

      {/* MODAL IMPRESSÃO */}
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

          {protocoloParaImprimir && (
            <ImprimirProtocolo
              protocolo={protocoloParaImprimir}
              perfil={perfil}
            />
          )}

          <DialogFooter className="no-print">
            <Button
              variant="outline"
              onClick={() => setIsImprimirOpen(false)}
            >
              Cancelar
            </Button>
            <Button onClick={handleConfirmarImpressao}>
              <Printer className="h-4 w-4 mr-2" />
              Imprimir e Confirmar
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
          }}
        />
      )}
    </>
  );
}
