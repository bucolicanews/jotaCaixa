import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Copy, Check, Send, Mail } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useSessao } from '@/hooks/use-sessao';

interface GerarLinkPagBankDialogProps {
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

export function GerarLinkPagBankDialog({
  open,
  onOpenChange,
  parcelaId,
  valorParcela,
  descricao,
  onSuccess,
}: GerarLinkPagBankDialogProps) {
  const { ownerId } = useSessao();
  const [loading, setLoading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  
  // ESTADOS DO CHECKOUT (não misturar com PIX)
  const [checkoutLink, setCheckoutLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [clienteInfo, setClienteInfo] = useState<ClienteInfo | null>(null);

  const handleGerarLink = async () => {
    const functionName = 'create-pagbank-checkout';
    const body = {
      parcela_id: parcelaId,
      admin_id: ownerId,
    };

    try {
      setLoading(true);
      
      // Limpar estados anteriores antes de gerar novo
      setCheckoutLink(null);

      if (!ownerId) {
        throw new Error('Sessao nao encontrada. Por favor, faca login novamente.');
      }

      const { data, error } = await supabase.functions.invoke(functionName, {
        body,
      });

      console.log('[GerarLinkPagBank] Resposta:', { data, error });

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.error || 'Erro ao gerar link de pagamento');
      }
      
      // Validar que o checkout_link foi gerado
      if (!data.checkout_link) {
        throw new Error('Link de checkout não foi gerado pelo PagBank');
      }

      toast.success('Link de checkout gerado com sucesso!');
      
      // Salvar apenas dados do CHECKOUT (não misturar com PIX)
      setCheckoutLink(data.checkout_link);
      setClienteInfo(data.cliente);
      
      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      console.error('[GerarLinkPagBank] Erro:', error);
      toast.error(error.message || 'Erro ao gerar link de pagamento');
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
      toast.error('Erro ao copiar link');
    }
  };

  const handleSendWhatsApp = () => {
    if (!clienteInfo?.telefone) {
      toast.error('Telefone do cliente nao encontrado');
      return;
    }
    
    if (!checkoutLink) {
      toast.error('Link de checkout não disponível');
      return;
    }

    const telefone = clienteInfo.telefone.replace(/\D/g, '');
    const telefoneFormatado = telefone.startsWith('55') ? telefone : `55${telefone}`;
    
    // Mensagem para CHECKOUT (múltiplas formas de pagamento)
    const mensagem = `Ola ${clienteInfo.nome}!\n\n💳 Link de Pagamento\n\n👉 Escolha a forma de pagamento:\n${checkoutLink}\n\n💰 Valor: R$ ${valorParcela.toFixed(2)}\n📝 ${descricao}\n\n✅ Aceita PIX, Boleto e Cartão!`;
    
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
    setCheckoutLink(null);
    setCopied(false);
    setClienteInfo(null);
    onOpenChange(false);
  };

  const handleReset = () => {
    setCheckoutLink(null);
    setCopied(false);
    setClienteInfo(null);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Gerar Link de Checkout</DialogTitle>
          <DialogDescription>
            Valor: R$ {valorParcela.toFixed(2)} - {descricao}
          </DialogDescription>
        </DialogHeader>

        {!checkoutLink ? (
          <div className="space-y-4 py-4">
            <Alert className="bg-blue-50 border-blue-200">
              <AlertDescription className="text-blue-800">
                O cliente poderá escolher entre PIX, Boleto ou Cartão de Crédito no checkout.
                <br />
                <strong>Link expira em 24 horas.</strong>
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <Alert className="bg-green-50 border-green-200">
              <AlertDescription className="text-green-800">
                Link de checkout gerado com sucesso! Compartilhe com o cliente.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label>Link de Pagamento (Checkout)</Label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={checkoutLink} 
                  readOnly 
                  className="flex-1 p-2 border rounded text-sm bg-muted"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCopyLink(checkoutLink)}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-gray-600">O cliente escolhe a forma de pagamento (PIX, Boleto ou Cartão)</p>
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
          {!checkoutLink ? (
            <>
              <Button variant="outline" onClick={handleClose} disabled={loading}>
                Cancelar
              </Button>
              <Button onClick={handleGerarLink} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Gerar Link
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