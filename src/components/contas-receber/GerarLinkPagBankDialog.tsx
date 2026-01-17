import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Copy, Check, CreditCard, FileText, QrCode, ShoppingCart, Send, Mail, Terminal } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useSessao } from '@/hooks/use-sessao';

type PaymentMethodType = 'pix' | 'boleto' | 'checkout';

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
  const [loading, setLoading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [paymentLink, setPaymentLink] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrCodeText, setQrCodeText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [clienteInfo, setClienteInfo] = useState<ClienteInfo | null>(null);

  const handleGerarLink = async () => {
    let functionName: 'create-pagbank-payment' | 'create-pagbank-checkout' = 'create-pagbank-payment';
    let body: any = {};

    try {
      setLoading(true);

      if (!ownerId) throw new Error('Sessão não identificada.');

      if (paymentMethod === 'checkout') {
        functionName = 'create-pagbank-checkout';
        body = { parcela_id: parcelaId, admin_id: ownerId };
      } else {
        functionName = 'create-pagbank-payment';
        body = { parcela_id: parcelaId, payment_method: paymentMethod, admin_id: ownerId };
      }

      const { data, error } = await supabase.functions.invoke(functionName, { body });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Erro ao gerar link');

      // EXIBIÇÃO DE LOGS PARA HOMOLOGAÇÃO (CONFORME SOLICITADO PELO PAGBANK)
      console.log('%c=== 🧾 LOG DE HOMOLOGAÇÃO PAGBANK ===', 'background: #1e40af; color: #fff; font-weight: bold; padding: 4px;');
      console.log('Ambiente:', data.checkout_id?.startsWith('CHEC_') ? 'PRODUÇÃO' : 'TESTE/SANDBOX');
      console.log('📍 Função Chamada:', functionName);
      console.log('📤 REQUEST BODY:', JSON.stringify(body, null, 2));
      console.log('📥 RESPONSE DATA:', JSON.stringify(data, null, 2));
      console.log('%c=== FIM DO LOG - COPIE O CONTEÚDO ACIMA ===', 'background: #1e40af; color: #fff; font-weight: bold; padding: 4px;');

      toast.success('Link gerado! Logs de homologação exibidos no Console (F12).');
      
      if (paymentMethod === 'checkout') {
        setPaymentLink(data.checkout_link);
      } else {
        setQrCode(data.qr_code);
        setQrCodeText(data.qr_code_text);
        if (data.boleto_pdf_url) setPaymentLink(data.boleto_pdf_url);
      }
      setClienteInfo(data.cliente);
      
      if (onSuccess) onSuccess();
    } catch (error: any) {
      console.error('Erro PagBank:', error);
      toast.error(error.message || 'Falha na comunicação com o PagBank');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Copiado para a área de transferência!');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error('Erro ao copiar');
    }
  };

  const handleSendWhatsApp = () => {
    if (!clienteInfo?.telefone) return toast.error('Telefone do cliente não encontrado');
    const telefone = clienteInfo.telefone.replace(/\D/g, '');
    const msg = `Olá ${clienteInfo.nome}! Segue o link para pagamento: ${paymentLink || qrCodeText}`;
    window.open(`https://wa.me/55${telefone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>PagBank: Gerar Cobrança</DialogTitle>
          <DialogDescription>Valor: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorParcela)}</DialogDescription>
        </DialogHeader>

        {!(paymentLink || qrCode) ? (
          <div className="space-y-4 py-4">
            <RadioGroup value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethodType)}>
              <div className="flex items-center space-x-2 border rounded-lg p-3 cursor-pointer hover:bg-accent" onClick={() => setPaymentMethod('checkout')}>
                <RadioGroupItem value="checkout" id="checkout" />
                <Label htmlFor="checkout" className="flex-1 cursor-pointer">
                  <div className="font-bold flex items-center gap-2"><ShoppingCart className="w-4 h-4"/> Checkout PagBank</div>
                  <p className="text-xs text-muted-foreground">Cartão, PIX e Boleto em uma única tela (Recomendado)</p>
                </Label>
              </div>
              <div className="flex items-center space-x-2 border rounded-lg p-3 cursor-pointer hover:bg-accent" onClick={() => setPaymentMethod('pix')}>
                <RadioGroupItem value="pix" id="pix" />
                <Label htmlFor="pix" className="flex-1 cursor-pointer">
                  <div className="font-bold flex items-center gap-2"><QrCode className="w-4 h-4"/> PIX Direto</div>
                  <p className="text-xs text-muted-foreground">Gera QR Code e código Copia e Cola imediato</p>
                </Label>
              </div>
            </RadioGroup>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <Alert className="bg-blue-50 border-blue-200">
                <Terminal className="h-4 w-4" />
                <AlertDescription className="text-xs">
                    Para homologação de produção: Abra o console (F12) para copiar os logs de Request/Response.
                </AlertDescription>
            </Alert>

            {qrCode && (
              <div className="flex flex-col items-center gap-3">
                <img src={qrCode} className="w-40 h-40 border p-2 rounded bg-white" alt="QR Code" />
                <Button variant="outline" size="sm" onClick={() => handleCopyLink(qrCodeText || '')} className="w-full">
                    {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />} Copiar Código PIX
                </Button>
              </div>
            )}

            {paymentLink && (
              <div className="space-y-2">
                <Label className="text-xs">Link de Pagamento / Boleto</Label>
                <div className="flex gap-2">
                  <Input readOnly value={paymentLink} className="text-xs bg-muted" />
                  <Button size="icon" variant="outline" onClick={() => handleCopyLink(paymentLink)}><Copy className="w-4 h-4"/></Button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 pt-4 border-t">
                <Button variant="outline" onClick={handleSendWhatsApp} disabled={!clienteInfo?.telefone}><Send className="w-4 h-4 mr-2" /> WhatsApp</Button>
                <Button variant="outline" onClick={() => toast.info('Funcionalidade de e-mail em breve')}><Mail className="w-4 h-4 mr-2" /> E-mail</Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
          {!(paymentLink || qrCode) && (
            <Button onClick={handleGerarLink} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : 'Gerar Agora'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}