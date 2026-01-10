import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Copy, Check, QrCode, Send, Mail, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';

interface VisualizarLinkPagBankDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentLink: string | null;
  checkoutLink?: string | null;
  qrCode: string | null;
  qrCodeText: string | null;
  valorParcela: number;
  descricao: string;
  status: string | null;
  parcelaId?: string;
  clienteNome?: string;
  clienteTelefone?: string;
  clienteEmail?: string;
}

export function VisualizarLinkPagBankDialog({
  open,
  onOpenChange,
  paymentLink,
  checkoutLink,
  qrCode,
  qrCodeText,
  valorParcela,
  descricao,
  status,
  parcelaId,
  clienteNome,
  clienteTelefone,
  clienteEmail,
}: VisualizarLinkPagBankDialogProps) {
  const { ownerId } = useSessao();
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedPix, setCopiedPix] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  const linkToUse = checkoutLink || paymentLink;

  const handleCopyLink = async (text: string, type: 'link' | 'pix') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'link') {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      } else {
        setCopiedPix(true);
        setTimeout(() => setCopiedPix(false), 2000);
      }
      toast.success('Copiado!');
    } catch (error) {
      toast.error('Erro ao copiar');
    }
  };

  const handleSendWhatsApp = () => {
    if (!linkToUse) {
      toast.error('Link de pagamento nao encontrado');
      return;
    }

    if (!clienteTelefone) {
      toast.error('Telefone do cliente nao encontrado');
      return;
    }

    const telefone = clienteTelefone.replace(/\D/g, '');
    const telefoneFormatado = telefone.startsWith('55') ? telefone : `55${telefone}`;
    
    const mensagem = `Ola ${clienteNome || 'Cliente'}! Segue o link para pagamento de R$ ${valorParcela.toFixed(2)} referente a ${descricao}: ${linkToUse}`;
    const url = `https://wa.me/${telefoneFormatado}?text=${encodeURIComponent(mensagem)}`;
    
    window.open(url, '_blank');
    toast.success('Abrindo WhatsApp...');
  };

  const handleSendEmail = async () => {
    if (!parcelaId || !ownerId) {
      toast.error('Dados incompletos para envio de email');
      return;
    }

    try {
      setSendingEmail(true);

      const { data, error } = await supabase.functions.invoke('send-payment-email', {
        body: {
          parcela_id: parcelaId,
          admin_id: ownerId,
        },
      });

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.error || 'Erro ao enviar email');
      }

      toast.success(data.message || 'Email enviado com sucesso!');
    } catch (error) {
      console.error('Erro ao enviar email:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao enviar email');
    } finally {
      setSendingEmail(false);
    }
  };

  const getStatusColor = (s: string | null) => {
    switch (s) {
      case 'PAID': return 'bg-green-100 text-green-800';
      case 'WAITING': return 'bg-yellow-100 text-yellow-800';
      case 'EXPIRED': return 'bg-red-100 text-red-800';
      case 'CANCELED': return 'bg-gray-100 text-gray-800';
      case 'ACTIVE': return 'bg-blue-100 text-blue-800';
      default: return 'bg-blue-100 text-blue-800';
    }
  };

  const getStatusLabel = (s: string | null) => {
    switch (s) {
      case 'PAID': return 'Pago';
      case 'WAITING': return 'Aguardando Pagamento';
      case 'EXPIRED': return 'Expirado';
      case 'CANCELED': return 'Cancelado';
      case 'ACTIVE': return 'Ativo';
      default: return s || 'Desconhecido';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Link de Pagamento PagBank</DialogTitle>
          <DialogDescription>
            Valor: R$ {valorParcela.toFixed(2)} - {descricao}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Status:</span>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(status)}`}>
              {getStatusLabel(status)}
            </span>
          </div>

          {qrCode && (
            <div className="flex flex-col items-center space-y-2">
              <p className="text-sm font-medium">QR Code PIX</p>
              <img 
                src={qrCode} 
                alt="QR Code PIX" 
                className="w-48 h-48 border rounded-lg"
              />
            </div>
          )}

          {qrCodeText && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Codigo PIX (Copia e Cola)</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={qrCodeText}
                  readOnly
                  className="flex-1 px-3 py-2 text-xs bg-muted rounded-md font-mono truncate"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopyLink(qrCodeText, 'pix')}
                >
                  {copiedPix ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}

          {linkToUse && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Link de Pagamento</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={linkToUse}
                  readOnly
                  className="flex-1 px-3 py-2 text-xs bg-muted rounded-md truncate"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopyLink(linkToUse, 'link')}
                >
                  {copiedLink ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}

          {!qrCode && !qrCodeText && !linkToUse && (
            <Alert>
              <QrCode className="h-4 w-4" />
              <AlertDescription>
                Nenhum link de pagamento disponivel para esta parcela.
              </AlertDescription>
            </Alert>
          )}

          {linkToUse && (
            <div className="border-t pt-4">
              <p className="text-sm font-medium mb-3">Enviar para o Cliente</p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleSendWhatsApp}
                  disabled={!clienteTelefone}
                >
                  <Send className="h-4 w-4 mr-2" />
                  WhatsApp
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleSendEmail}
                  disabled={sendingEmail || !clienteEmail || !parcelaId}
                >
                  {sendingEmail ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4 mr-2" />
                  )}
                  Email
                </Button>
              </div>
              {(clienteNome || clienteTelefone || clienteEmail) && (
                <p className="text-xs text-muted-foreground mt-2">
                  {clienteNome && `Cliente: ${clienteNome}`}
                  {clienteTelefone && ` | Tel: ${clienteTelefone}`}
                  {clienteEmail && ` | Email: ${clienteEmail}`}
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
