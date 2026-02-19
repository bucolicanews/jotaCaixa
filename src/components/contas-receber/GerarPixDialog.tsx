import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Copy, Check, Send, Mail } from 'lucide-react';
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
  const [clienteInfo, setClienteInfo] = useState<ClienteInfo | null>(null);

  const handleGerarPix = async () => {
    try {
      setLoading(true);

      if (!ownerId) {
        throw new Error('Sessao nao encontrada. Por favor, faca login novamente.');
      }

      const body = {
        parcela_id: parcelaId,
        payment_method: 'pix',
        admin_id: ownerId,
      };

      const { data, error } = await supabase.functions.invoke('create-pagbank-payment', {
        body,
      });

      console.log('[GerarPixDialog] Resposta completa:', { data, error });
      console.log('[GerarPixDialog] data.qr_code:', data?.qr_code);
      console.log('[GerarPixDialog] data.pix_payment_page_url:', data?.pix_payment_page_url);

      if (error) {
        console.log('[GerarPixDialog] Erro detectado:', error);
        throw error;
      }

      if (!data?.success) {
        console.log('[GerarPixDialog] Success = false');
        throw new Error(data?.error || 'Erro ao gerar PIX');
      }

      console.log('[GerarPixDialog] Sucesso! Atualizando estados...');
      
      toast.success('PIX gerado com sucesso!');
      
      console.log('[GerarPixDialog] Setando QR Code:', data.qr_code);
      setQrCode(data.qr_code);
      
      console.log('[GerarPixDialog] Setando QR Code Text:', data.qr_code_text);
      setQrCodeText(data.qr_code_text);
      
      console.log('[GerarPixDialog] Setando PIX URL:', data.pix_payment_page_url);
      setPixPaymentPageUrl(data.pix_payment_page_url);
      
      console.log('[GerarPixDialog] Setando Cliente Info:', data.cliente);
      setClienteInfo(data.cliente);
      
      console.log('[GerarPixDialog] Todos os estados atualizados!');
      
      // NÃO chama onSuccess aqui para evitar que o modal seja fechado
      // A lista será atualizada quando o usuário fechar o modal manualmente
    } catch (error: any) {
      console.error('Erro ao gerar PIX:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro ao gerar PIX';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Copiado!');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error('Erro ao copiar');
    }
  };

  const handleSendWhatsApp = () => {
    if (!clienteInfo?.telefone) {
      toast.error('Telefone do cliente nao encontrado');
      return;
    }

    const telefone = clienteInfo.telefone.replace(/\D/g, '');
    const telefoneFormatado = telefone.startsWith('55') ? telefone : `55${telefone}`;
    
    const mensagem = `Ola ${clienteInfo.nome}! 👋

📱 *Pagamento PIX Facilitado*

👉 Clique no link para ver o QR Code e copiar o codigo:
${pixPaymentPageUrl}

💰 Valor: *R$ ${valorParcela.toFixed(2)}*
📝 ${descricao}

✅ Rapido, facil e seguro!`;
    
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

  const handleClose = () => {
    setQrCode(null);
    setQrCodeText(null);
    setPixPaymentPageUrl(null);
    setCopied(false);
    setClienteInfo(null);
    onOpenChange(false);
    
    // Atualiza a lista apenas quando fechar o modal
    if (onSuccess) {
      onSuccess();
    }
  };

  const handleReset = () => {
    setQrCode(null);
    setQrCodeText(null);
    setPixPaymentPageUrl(null);
    setCopied(false);
    setClienteInfo(null);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Gerar Pagamento PIX</DialogTitle>
          <DialogDescription>
            Valor: R$ {valorParcela.toFixed(2)} - {descricao}
          </DialogDescription>
        </DialogHeader>

        {console.log('[GerarPixDialog] Renderizando. qrCode:', qrCode, 'pixPaymentPageUrl:', pixPaymentPageUrl)}
        
        {!qrCode ? (
          <div className="space-y-4 py-4">
            <Alert>
              <AlertDescription>
                Será gerado um QR Code PIX e uma página de pagamento para enviar ao cliente.
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <Alert className="bg-green-50 border-green-200">
              <AlertDescription className="text-green-800">
                PIX gerado com sucesso! Compartilhe com o cliente.
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              <div className="flex justify-center">
                <img src={qrCode} alt="QR Code PIX" className="w-48 h-48 border rounded-lg" />
              </div>

              {pixPaymentPageUrl && (
                <div className="space-y-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <Label className="text-blue-900 font-semibold">🔗 Link de Pagamento PIX</Label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={pixPaymentPageUrl} 
                      readOnly 
                      className="flex-1 p-2 border rounded text-sm text-blue-900 bg-white"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCopyLink(pixPaymentPageUrl)}
                    >
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-gray-600">Envie este link para o cliente</p>
                </div>
              )}

              {qrCodeText && (
                <div className="space-y-2">
                  <Label>PIX Copia e Cola</Label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={qrCodeText} 
                      readOnly 
                      className="flex-1 p-2 border rounded text-sm bg-muted"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCopyLink(qrCodeText)}
                    >
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t pt-4">
              <Label className="mb-3 block">Enviar para o Cliente</Label>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleSendWhatsApp}
                  disabled={!clienteInfo?.telefone}
                >
                  <Send className="h-4 w-4 mr-2" />
                  WhatsApp
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleSendEmail}
                  disabled={sendingEmail || !clienteInfo?.email || !parcelaId}
                >
                  {sendingEmail ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4 mr-2" />
                  )}
                  Email
                </Button>
              </div>
              {clienteInfo && (
                <p className="text-xs text-muted-foreground mt-2">
                  Cliente: {clienteInfo.nome} 
                  {clienteInfo.telefone && ` | Tel: ${clienteInfo.telefone}`}
                  {clienteInfo.email && ` | Email: ${clienteInfo.email}`}
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          {!qrCode ? (
            <>
              <Button variant="outline" onClick={handleClose} disabled={loading}>
                Cancelar
              </Button>
              <Button onClick={handleGerarPix} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Gerar PIX
              </Button>
            </>
          ) : (
            <div className="flex gap-2 w-full">
              <Button variant="outline" onClick={handleReset} className="flex-1">
                Gerar Novamente
              </Button>
              <Button onClick={handleClose} className="flex-1">
                Fechar
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
