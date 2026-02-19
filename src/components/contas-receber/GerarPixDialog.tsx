import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Copy, Check, Send, Mail, Link2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useSessao } from '@/hooks/use-sessao';

interface GerarPixDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parcelaId: string;
  valorParcela: number;
  descricao: string;
  onSuccess?: () => void;
}

interface ClienteInfo {
  nome: string;
  email: string | null;
  telefone: string | null;
}

export function GerarPixDialog({
  open,
  onOpenChange,
  parcelaId,
  valorParcela,
  descricao,
  onSuccess,
}: GerarPixDialogProps) {
  const { ownerId } = useSessao();
  const [loading, setLoading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrCodeText, setQrCodeText] = useState<string | null>(null);
  const [pixPaymentPageUrl, setPixPaymentPageUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [clienteInfo, setClienteInfo] = useState<ClienteInfo | null>(null);

  const handleGerarPix = async () => {
    try {
      setLoading(true);
      setQrCode(null);
      setPixPaymentPageUrl(null);

      if (!ownerId) {
        throw new Error('Sessão não encontrada. Por favor, faça login novamente.');
      }

      const body = {
        parcela_id: parcelaId,
        payment_method: 'pix',
        admin_id: ownerId,
      };

      const { data, error } = await supabase.functions.invoke('create-pagbank-payment', {
        body,
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Erro ao gerar PIX');

      toast.success('PIX gerado com sucesso!');
      setQrCode(data.qr_codes?.[0]?.links.find((l: any) => l.media === 'image/png')?.href || null);
      setQrCodeText(data.qr_codes?.[0]?.text || null);
      setPixPaymentPageUrl(data.pix_payment_page_url);
      setClienteInfo(data.cliente);
      
    } catch (error: any) {
      console.error('Erro ao gerar PIX:', error);
      toast.error(error.message || 'Erro ao gerar PIX');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyText = async (text: string, setCopiedFn: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedFn(true);
      toast.success('Copiado!');
      setTimeout(() => setCopiedFn(false), 2000);
    } catch (error) {
      toast.error('Erro ao copiar');
    }
  };

  const handleSendWhatsApp = () => {
    if (!clienteInfo?.telefone) {
      toast.error('Telefone do cliente não encontrado');
      return;
    }

    const linkPagamento = pixPaymentPageUrl || qrCodeText || '';
    const telefone = clienteInfo.telefone.replace(/\D/g, '');
    const telefoneFormatado = telefone.startsWith('55') ? telefone : `55${telefone}`;
    
    const mensagem = `Olá ${clienteInfo.nome}! 👋\n\n📱 *Pagamento PIX Facilitado*\n\n👉 Clique no link para ver o QR Code e copiar o código:\n${linkPagamento}\n\n💰 Valor: *R$ ${valorParcela.toFixed(2)}*\n📝 ${descricao}\n\n✅ Rápido, fácil e seguro!`;
    
    const url = `https://wa.me/${telefoneFormatado}?text=${encodeURIComponent(mensagem)}`;
    window.open(url, '_blank');
  };

  const handleSendEmail = async () => {
    if (!parcelaId || !ownerId) return;
    try {
      setSendingEmail(true);
      const { data, error } = await supabase.functions.invoke('send-payment-email', {
        body: { parcela_id: parcelaId, admin_id: ownerId }
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      toast.success('Email enviado com sucesso!');
    } catch (error: any) {
      toast.error('Erro ao enviar email: ' + error.message);
    } finally {
      setSendingEmail(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Gerar Pagamento PIX</DialogTitle>
          <DialogDescription>
            Valor: R$ {valorParcela.toFixed(2)} - {descricao}
          </DialogDescription>
        </DialogHeader>

        {!qrCode ? (
          <div className="py-4">
            <Alert>
              <AlertDescription>
                Clique no botão abaixo para gerar o QR Code PIX dinâmico via PagBank.
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <Alert className="bg-green-50 border-green-200 text-green-800">
              <AlertDescription>PIX gerado com sucesso!</AlertDescription>
            </Alert>

            <div className="flex justify-center border p-4 rounded-lg bg-white">
              <img src={qrCode} alt="QR Code PIX" className="w-48 h-48" />
            </div>

            {pixPaymentPageUrl && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <Label className="text-blue-900 font-semibold flex items-center gap-1 mb-1">
                  <Link2 className="w-3 h-3" /> Link de Pagamento
                </Label>
                <div className="flex gap-2">
                  <Input readOnly value={pixPaymentPageUrl} className="h-8 text-xs bg-white" />
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => handleCopyText(pixPaymentPageUrl, setCopiedLink)}>
                    {copiedLink ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}

            {qrCodeText && (
              <div className="space-y-1">
                <Label className="text-xs">Código PIX Copia e Cola</Label>
                <div className="flex gap-2">
                  <Input readOnly value={qrCodeText} className="h-8 text-xs bg-muted" />
                  <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => handleCopyText(qrCodeText, setCopied)}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}

            <div className="pt-4 border-t flex gap-2">
              <Button variant="outline" className="flex-1" onClick={handleSendWhatsApp} disabled={!clienteInfo?.telefone}>
                <Send className="h-4 w-4 mr-2" /> WhatsApp
              </Button>
              <Button variant="outline" className="flex-1" onClick={handleSendEmail} disabled={sendingEmail || !clienteInfo?.email}>
                {sendingEmail ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />} Email
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          {!qrCode ? (
            <Button onClick={handleGerarPix} disabled={loading} className="w-full">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Gerar PIX
            </Button>
          ) : (
            <Button onClick={() => onOpenChange(false)} className="w-full">Fechar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}