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
    
    const p = protocoloParaImprimir;
    const clienteNome = p.tbl_clientes?.razao_social || p.tbl_clientes?.nome || 'N/A';
    const dataCriacao = p.data_criacao ? new Date(p.data_criacao).toLocaleString('pt-BR') : new Date(p.created_at).toLocaleString('pt-BR');
    const dataImpressao = new Date().toLocaleDateString('pt-BR');
    const criadorNome = p.usuario_criador_nome || '______________________';
    const titulo = p.titulo || 'N/A';
    const descricao = p.descricao || '';
    const empresaNome = (perfil as any)?.razao_social || (perfil as any)?.nome || '';

    const anexosHtml = p.anexos && p.anexos.length > 0 
      ? `<tr><td colspan="2" style="padding:2mm;border-bottom:1px solid #000;font-size:9pt"><strong>Anexos (${p.anexos.length}):</strong> ${p.anexos.slice(0,3).map(a => (a.split('/').pop()?.split('-').slice(1).join('-') || 'Anexo').substring(0,20)).join(', ')}${p.anexos.length > 3 ? ` +${p.anexos.length-3}` : ''}</td></tr>` 
      : '';

    const descricaoHtml = descricao 
      ? `<tr><td colspan="2" style="padding:2mm;border-bottom:1px solid #000;font-size:10pt"><strong>Observação:</strong><div style="white-space:pre-wrap;word-wrap:break-word;margin-top:1mm">${descricao}</div></td></tr>`
      : '';

    const viaHtml = (num: number) => `
      <table style="width:100%;border-collapse:collapse;border:2px solid #000;margin-bottom:3mm;color:black;">
        <tr><td colspan="2" style="text-align:center;border-bottom:2px solid #000;padding:2mm;background:#f0f0f0">
          <div style="font-size:16pt;font-weight:bold">PROTOCOLO DE ENTREGA</div>
          <div style="font-size:12pt;font-weight:bold">${num}ª VIA - ${num === 1 ? 'EMPRESA' : 'CLIENTE'}</div>
        </td></tr>
        <tr><td colspan="2" style="padding:1mm;border-bottom:1px solid #000;font-size:10pt;text-align:center">
          <strong>${empresaNome}</strong>
        </td></tr>
        <tr><td colspan="2" style="text-align:center;padding:2mm;border-bottom:1px solid #000;background:#e8e8e8">
          <div style="font-size:10pt">Nº PROTOCOLO</div>
          <div style="font-size:16pt;font-weight:bold">${p.numero_protocolo}</div>
        </td></tr>
        <tr>
          <td style="width:50%;padding:2mm;border-bottom:1px solid #000;border-right:1px solid #000;font-size:10pt"><strong>Cliente:</strong><br/>${clienteNome}</td>
          <td style="width:50%;padding:2mm;border-bottom:1px solid #000;font-size:10pt"><strong>Data Criação:</strong><br/>${dataCriacao}</td>
        </tr>
        <tr><td colspan="2" style="padding:2mm;border-bottom:1px solid #000;font-size:10pt"><strong>Título:</strong> ${titulo}</td></tr>
        ${descricaoHtml}
        ${anexosHtml}
        <tr>
          <td style="width:50%;padding:2mm;border-right:1px solid #000;font-size:9pt;text-align:center">
            <strong>ENTREGUE POR</strong><div style="margin-top:15mm">__________________________________________</div><div>${criadorNome}</div><span style="font-size:8pt;color:black">Data: ${dataImpressao}</span>
          </td>
          <td style="width:50%;padding:2mm;font-size:9pt;text-align:center">
            <strong>RECEBIDO POR</strong><div style="margin-top:15mm">${p.nome_resp_recebimento || '_______________________________________'}</div><span style="font-size:8pt;color:black">Data: ${p.data_recebimento ? new Date(p.data_recebimento).toLocaleDateString('pt-BR') : '___/___/____'}</span>
          </td>
        </tr>
      </table>`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Protocolo ${p.numero_protocolo}</title>
        <style>
          @page { size: A4 portrait; margin: 8mm; }
          body { 
            font-family: Arial, sans-serif; 
            margin: 0; 
            padding: 0;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
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
                  <div className="text-sm font-medium text-muted-foreground">Criado por</div>
                  <div>{selectedProtocolo.usuario_criador_nome || '-'}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Data Criação</div>
                  <div>{formatDate(selectedProtocolo.data_criacao)}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Data Impressão</div>
                  <div>{formatDate(selectedProtocolo.data_impressao)}</div>
                </div>
              </div>
              {selectedProtocolo.titulo && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Título</div>
                  <div>{selectedProtocolo.titulo}</div>
                </div>
              )}
              {selectedProtocolo.descricao && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Descrição</div>
                  <div className="whitespace-pre-wrap">{selectedProtocolo.descricao}</div>
                </div>
              )}
              {selectedProtocolo.link_tarefa && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Link da Tarefa</div>
                  <a href={selectedProtocolo.link_tarefa} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    {selectedProtocolo.link_tarefa}
                  </a>
                </div>
              )}
              {selectedProtocolo.anexos && selectedProtocolo.anexos.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-2">Anexos</div>
                  <div className="space-y-1">
                    {selectedProtocolo.anexos.map((anexo, i) => {
                      const fileName = anexo.split('/').pop()?.split('-').slice(1).join('-') || `Anexo ${i+1}`;
                      return (
                        <a key={i} href={anexo} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-blue-600 hover:underline text-sm">
                          <Download className="h-4 w-4" />
                          {fileName}
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
