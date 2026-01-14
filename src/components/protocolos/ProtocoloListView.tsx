import { useState } from 'react';
import ReactDOMServer from 'react-dom/server';
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

  const handleConfirmarImpressao = async () => {
    if (!protocoloParaImprimir) return;
    
    const p = protocoloParaImprimir;
    const clienteNome = p.tbl_clientes?.nome || 'N/A';
    const dataCriacao = p.data_criacao ? new Date(p.data_criacao).toLocaleString('pt-BR') : new Date(p.created_at).toLocaleString('pt-BR');
    const dataImpressao = new Date().toLocaleDateString('pt-BR');
    const criadorNome = p.usuario_criador_nome || '______________________';
    const titulo = p.titulo || 'N/A';
    const descricao = p.descricao || '';
    const anexosHtml = p.anexos && p.anexos.length > 0 
      ? `<tr><td colspan="2" style="padding:2mm;border-bottom:1px solid #000;font-size:8pt"><strong>Anexos (${p.anexos.length}):</strong> ${p.anexos.slice(0,3).map(a => (a.split('/').pop()?.split('-').slice(1).join('-') || 'Anexo').substring(0,20)).join(', ')}${p.anexos.length > 3 ? ` +${p.anexos.length-3}` : ''}</td></tr>` 
      : '';

    const descricaoHtml = descricao 
      ? `<tr><td colspan="2" style="padding:2mm;border-bottom:1px solid #000;font-size:9pt"><strong>Observação:</strong><div style="white-space:pre-wrap;word-wrap:break-word;margin-top:1mm">${descricao}</div></td></tr>`
      : '';

    const viaHtml = (num: number) => `
      <table style="width:100%;border-collapse:collapse;border:2px solid #000;margin-bottom:3mm">
        <tr><td colspan="2" style="text-align:center;border-bottom:2px solid #000;padding:2mm;background:#f0f0f0">
          <div style="font-size:14pt;font-weight:bold">PROTOCOLO DE ENTREGA</div>
          <div style="font-size:10pt;font-weight:bold">${num}ª VIA - ${num === 1 ? 'EMPRESA' : 'CLIENTE'}</div>
        </td></tr>
        <tr><td colspan="2" style="text-align:center;padding:2mm;border-bottom:1px solid #000;background:#e8e8e8">
          <div style="font-size:8pt">Nº PROTOCOLO</div>
          <div style="font-size:14pt;font-weight:bold">${p.numero_protocolo}</div>
        </td></tr>
        <tr>
          <td style="width:50%;padding:2mm;border-bottom:1px solid #000;border-right:1px solid #000;font-size:9pt"><strong>Cliente:</strong><br/>${clienteNome}</td>
          <td style="width:50%;padding:2mm;border-bottom:1px solid #000;font-size:9pt"><strong>Data Criação:</strong><br/>${dataCriacao}</td>
        </tr>
        <tr><td colspan="2" style="padding:2mm;border-bottom:1px solid #000;font-size:9pt"><strong>Título:</strong> ${titulo}</td></tr>
        ${descricaoHtml}
        ${anexosHtml}
        <tr>
          <td style="width:50%;padding:2mm;border-right:1px solid #000;font-size:8pt;text-align:center">
            <strong>ENTREGUE POR</strong><br/>${criadorNome}<br/><span style="font-size:7pt;color:#666">Data: ${dataImpressao}</span>
          </td>
          <td style="width:50%;padding:2mm;font-size:8pt;text-align:center">
            <strong>RECEBIDO POR</strong><br/>______________________<br/><span style="font-size:7pt;color:#666">Data: ___/___/____</span>
          </td>
        </tr>
      </table>`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Protocolo ${p.numero_protocolo}</title>
        <style>
          @page { size: A4 portrait; margin: 10mm; }
          body { font-family: Arial, sans-serif; margin: 0; padding: 10mm; }
        </style>
      </head>
      <body>
        ${viaHtml(1)}
        <div style="border-bottom:1px dashed #999;margin:2mm 0"></div>
        ${viaHtml(2)}
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
      alert('Popup bloqueado! Permita popups para imprimir.');
      return;
    }

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    
    setTimeout(() => {
      try {
        printWindow.focus();
        printWindow.print();
      } catch (e) {
        console.log('Impressão cancelada ou erro:', e);
      }
    }, 500);
    
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

      {/* MODAL IMPRESSÃO */}
      <Dialog open={isImprimirOpen} onOpenChange={setIsImprimirOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Protocolo de Entrega –{' '}
              {protocoloParaImprimir?.numero_protocolo}
            </DialogTitle>
            <DialogDescription>
              O documento será impresso em duas vias.
            </DialogDescription>
          </DialogHeader>
          
          <div className="print-area">
            {protocoloParaImprimir && <ImprimirProtocolo protocolo={protocoloParaImprimir} />}
          </div>

          <DialogFooter>
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
    </>
  );
}