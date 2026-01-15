import { useState } from 'react';
import { useSessao } from '@/hooks/use-sessao';
import { format } from 'date-fns';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
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

  /* ======================================================
     AÇÃO DE STATUS
  ====================================================== */
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

  /* ======================================================
     IMPRESSÃO REAL (HTML PURO)
  ====================================================== */
  const handleConfirmarImpressao = async () => {
    if (!protocoloParaImprimir) return;

    const p = protocoloParaImprimir;

    const clienteNome = p.tbl_clientes?.nome || 'N/A';
    const clienteRazaoSocial = p.tbl_clientes?.razao_social;
    const clienteDisplay = clienteRazaoSocial ? `${clienteRazaoSocial}<br/>${clienteNome}` : clienteNome;
    const dataCriacao = formatDate(p.data_criacao || p.created_at);
    const dataImpressao = format(new Date(), 'dd/MM/yyyy');
    const criadorNome = p.usuario_criador_nome || '';
    const titulo = p.titulo || 'N/A';
    const descricao = p.descricao || '';

    const descricaoHtml = descricao
      ? `
        <tr>
          <td colspan="2">
            <strong>Observação:</strong>
            <div style="margin-top:1mm;white-space:pre-wrap">${descricao}</div>
          </td>
        </tr>`
      : '';

    const anexosHtml =
      p.anexos && p.anexos.length > 0
        ? `
        <tr>
          <td colspan="2" style="font-size:8pt">
            <strong>Anexos (${p.anexos.length}):</strong>
            ${p.anexos
              .slice(0, 3)
              .map(a =>
                (a.split('/').pop()?.split('-').slice(1).join('-') || 'Anexo')
                  .substring(0, 20)
              )
              .join(', ')}
            ${p.anexos.length > 3 ? ` +${p.anexos.length - 3}` : ''}
          </td>
        </tr>`
        : '';

    const viaHtml = (numero: number) => `
      <table>
        <tr>
          <td colspan="2" class="cabecalho">
            <div class="titulo">PROTOCOLO DE ENTREGA</div>
            <div class="subtitulo">${numero}ª VIA – ${
      numero === 1 ? 'EMPRESA' : 'CLIENTE'
    }</div>
          </td>
        </tr>

        <tr>
          <td colspan="2" class="numero">
            <div class="numero-label">Nº PROTOCOLO</div>
            <div class="numero-valor">${p.numero_protocolo}</div>
          </td>
        </tr>

        <tr>
          <td><strong>Cliente:</strong><br/>${clienteDisplay}</td>
          <td><strong>Data Criação:</strong><br/>${dataCriacao}</td>
        </tr>

        <tr>
          <td colspan="2"><strong>Título:</strong> ${titulo}</td>
        </tr>

        ${descricaoHtml}
        ${anexosHtml}

        <tr>
          <td class="assinatura direita">
            <strong>ENTREGUE POR</strong>
            <div class="linha-assinatura">${criadorNome}</div>
            <span>Data: ${dataImpressao}</span>
          </td>

          <td class="assinatura">          
            <strong>RECEBIDO POR</strong>
            <div class="linha-assinatura"></div>
            <span>Data: ___/___/____</span>
          </td>
        </tr>
      </table>
    `;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8"/>
        <title>Protocolo ${p.numero_protocolo}</title>
        <style>
          * {
            color:#000 !important;
            border-color:#000 !important;
            font-family:Arial,sans-serif;
            -webkit-print-color-adjust:exact;
            print-color-adjust:exact;
          }

          table {
            width:100%;
            border-collapse:collapse;
            border:2px solid #000;
            margin-bottom:3mm;
            font-size:9pt;
          }

          td {
            border:1px solid #000;
            padding:2mm;
            vertical-align:top;
          }

          .cabecalho {
            text-align:center;
            border-bottom:2px solid #000;
          }

          .titulo { font-size:14pt;font-weight:700 }
          .subtitulo { font-size:10pt;font-weight:700 }

          .numero { text-align:center }
          .numero-label { font-size:8pt }
          .numero-valor { font-size:14pt;font-weight:700 }

          .assinatura { text-align:center;font-size:8pt; margin-top:20mm   }
          .direita { border-right:1px solid #000 }

          .linha-assinatura {
            margin-top:8px;
            padding-top:12px;
            border-top:1px solid #000;
          }

          @page { size:A4 portrait;margin:8mm, margin-top:10px;}
        </style>
      </head>
      <body>
        ${viaHtml(1)}
        <div style="border-bottom:1px dashed #000;margin:2mm 0"></div>
        ${viaHtml(2)}
      </body>
      </html>
    `;

    const win = window.open('', '_blank');
    if (!win) {
      alert('Popup bloqueado');
      return;
    }

    win.document.write(html);
    win.document.close();

    setTimeout(() => {
      win.focus();
      win.print();
    }, 500);

    if (p.status === 'Criado') {
      await onUpdateStatus(p.id, 'Impresso');
    }

    setIsImprimirOpen(false);
    setProtocoloParaImprimir(null);
  };

  /* ======================================================
     RENDER
  ====================================================== */
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
            {protocolos.map((protocolo) => (
              <TableRow key={protocolo.id}>
                <TableCell>{protocolo.numero_protocolo}</TableCell>
                <TableCell>
                  <Badge variant={statusBadgeVariants[protocolo.status]}>
                    {protocolo.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div>{protocolo.tbl_clientes?.razao_social || protocolo.tbl_clientes?.nome || '-'}</div>
                  {protocolo.tbl_clientes?.razao_social && <div className="text-xs text-muted-foreground">{protocolo.tbl_clientes?.nome}</div>}
                </TableCell>
                <TableCell className="truncate max-w-[200px]">
                  {protocolo.titulo || '-'}
                </TableCell>
                <TableCell>{formatDate(protocolo.data_criacao)}</TableCell>
                <TableCell>{protocolo.usuario_criador_nome || '-'}</TableCell>
                <TableCell>
                  {protocolo.anexos?.length ? protocolo.anexos.length : '-'}
                </TableCell>
                <TableCell>
                  {protocolo.link_tarefa ? (
                    <a href={protocolo.link_tarefa} target="_blank">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  ) : (
                    '-'
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setProtocoloParaImprimir(protocolo);
                      setIsImprimirOpen(true);
                    }}
                  >
                    <Printer className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* MODAL IMPRESSÃO */}
      <Dialog open={isImprimirOpen} onOpenChange={setIsImprimirOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              Protocolo {protocoloParaImprimir?.numero_protocolo}
            </DialogTitle>
            <DialogDescription>
              Documento será impresso em duas vias
            </DialogDescription>
          </DialogHeader>

          {protocoloParaImprimir && (
            <ImprimirProtocolo protocolo={protocoloParaImprimir} />
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsImprimirOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmarImpressao}>
              <Printer className="h-4 w-4 mr-2" />
              Imprimir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
