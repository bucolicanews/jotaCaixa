import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Copy, Check, CreditCard, FileText, QrCode, ShoppingCart, Send, Mail } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useSessao } from '@/hooks/use-sessao';

type PaymentMethodType = 'pix' | 'boleto' | 'credit_card' | 'checkout';

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
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>('checkout');
  const [installments, setInstallments] = useState('1');
  const [loading, setLoading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [paymentLink, setPaymentLink] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrCodeText, setQrCodeText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [clienteInfo, setClienteInfo] = useState<ClienteInfo | null>(null);

  const handleGerarLink = async () => {
    try {
      setLoading(true);

      if (!ownerId) {
        throw new Error('Sessao nao encontrada. Por favor, faca login novamente.');
      }

      let data: any;
      let error: any;

      if (paymentMethod === 'checkout') {
        const result = await supabase.functions.invoke('create-pagbank-checkout', {
          body: {
            parcela_id: parcelaId,
            admin_id: ownerId,
          },
        });
        data = result.data;
        error = result.error;

        if (!error && data?.success) {
          setPaymentLink(data.checkout_link);
          setClienteInfo(data.cliente);
        }
      } else {
        const result = await supabase.functions.invoke('create-pagbank-payment', {
          body: {
            parcela_id: parcelaId,
            payment_method: paymentMethod,
            installments: paymentMethod === 'credit_card' ? parseInt(installments) : 1,
            admin_id: ownerId,
          },
        });
        data = result.data;
        error = result.error;

        if (!error && data?.success) {
          setQrCode(data.qr_code);
          setQrCodeText(data.qr_code_text);
          setClienteInfo(data.cliente);
        }
      }

      console.log('[GerarLinkPagBank] Resposta:', { data, error });

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.error || 'Erro ao gerar link de pagamento');
      }

      toast.success('Link de pagamento gerado com sucesso!');
      
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error('Erro ao gerar link PagBank:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao gerar link de pagamento');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Link copiado!');
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

    const telefone = clienteInfo.telefone.replace(/\D/g, '');
    const telefoneFormatado = telefone.startsWith('55') ? telefone : `55${telefone}`;
    
    let mensagem = '';
    if (paymentLink) {
      mensagem = `Ola ${clienteInfo.nome}! Segue o link para pagamento de R$ ${valorParcela.toFixed(2)} referente a ${descricao}: ${paymentLink}`;
    } else if (qrCodeText) {
      mensagem = `Ola ${clienteInfo.nome}! Segue o codigo PIX para pagamento de R$ ${valorParcela.toFixed(2)} referente a ${descricao}:\n\n${qrCodeText}`;
    } else {
      toast.error('Nenhum link ou codigo PIX disponivel');
      return;
    }
    
    const url = `https://wa.me/${telefoneFormatado}?text=${encodeURIComponent(mensagem)}`;
    
    window.open(url, '_blank');
    toast.success('Abrindo WhatsApp...');
  };

  const handleSendEmail = async () => {
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
    setPaymentLink(null);
    setQrCode(null);
    setQrCodeText(null);
    setPaymentMethod('checkout');
    setInstallments('1');
    setCopied(false);
    setClienteInfo(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Gerar Link de Pagamento PagBank</DialogTitle>
          <DialogDescription>
            Valor: R$ {valorParcela.toFixed(2)} - {descricao}
          </DialogDescription>
        </DialogHeader>

        {!(paymentLink || qrCode) ? (
          <div className="space-y-4 py-4">
            <div className="space-y-3">
              <Label>Forma de Pagamento</Label>
              <RadioGroup value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as PaymentMethodType)}>
                <div className="flex items-center space-x-2 border rounded-lg p-3 cursor-pointer hover:bg-accent bg-primary/5 border-primary" onClick={() => setPaymentMethod('checkout')}>
                  <RadioGroupItem value="checkout" id="checkout" />
                  <Label htmlFor="checkout" className="flex items-center gap-2 cursor-pointer flex-1">
                    <ShoppingCart className="h-4 w-4" />
                    <div>
                      <div className="font-medium">Checkout (Recomendado)</div>
                      <div className="text-xs text-muted-foreground">Cliente escolhe PIX, Boleto ou Cartao</div>
                    </div>
                  </Label>
                </div>
                <div className="flex items-center space-x-2 border rounded-lg p-3 cursor-pointer hover:bg-accent" onClick={() => setPaymentMethod('pix')}>
                  <RadioGroupItem value="pix" id="pix" />
                  <Label htmlFor="pix" className="flex items-center gap-2 cursor-pointer flex-1">
                    <QrCode className="h-4 w-4" />
                    PIX (QR Code e Copia e Cola)
                  </Label>
                </div>
                <div className="flex items-center space-x-2 border rounded-lg p-3 cursor-pointer hover:bg-accent" onClick={() => setPaymentMethod('boleto')}>
                  <RadioGroupItem value="boleto" id="boleto" />
                  <Label htmlFor="boleto" className="flex items-center gap-2 cursor-pointer flex-1">
                    <FileText className="h-4 w-4" />
                    Boleto Bancario
                  </Label>
                </div>
                <div className="flex items-center space-x-2 border rounded-lg p-3 cursor-pointer hover:bg-accent" onClick={() => setPaymentMethod('credit_card')}>
                  <RadioGroupItem value="credit_card" id="credit_card" />
                  <Label htmlFor="credit_card" className="flex items-center gap-2 cursor-pointer flex-1">
                    <CreditCard className="h-4 w-4" />
                    Cartao de Credito
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {paymentMethod === 'credit_card' && (
              <div className="space-y-2">
                <Label htmlFor="installments">Numero de Parcelas</Label>
                <Select value={installments} onValueChange={setInstallments}>
                  <SelectTrigger id="installments">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((num) => (
                      <SelectItem key={num} value={num.toString()}>
                        {num}x de R$ {(valorParcela / num).toFixed(2)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <Alert className="bg-green-50 border-green-200">
              <AlertDescription className="text-green-800">
                Link de pagamento gerado com sucesso! Compartilhe com o cliente.
              </AlertDescription>
            </Alert>

            {paymentMethod === 'pix' && qrCode && (
              <div className="space-y-3">
                <div className="flex justify-center">
                  <img src={qrCode} alt="QR Code PIX" className="w-48 h-48 border rounded-lg" />
                </div>
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
            )}

            {paymentLink && (
            <div className="space-y-2">
              <Label>Link de Pagamento</Label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={paymentLink} 
                  readOnly 
                  className="flex-1 p-2 border rounded text-sm bg-muted"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCopyLink(paymentLink)}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            )}

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
                  disabled={sendingEmail || !clienteInfo?.email}
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
          {!(paymentLink || qrCode) ? (
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
            <Button onClick={handleClose} className="w-full">
              Fechar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
