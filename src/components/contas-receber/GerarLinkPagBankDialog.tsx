import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Copy, Check, Send, Mail, Link2 } from 'lucide-react';
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
  const [checkoutLink, setCheckoutLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [clienteInfo, setClienteInfo] = useState<ClienteInfo | null>(null);

  const handleGerarLink = async () => {
    try {
      setLoading(true);
      if (!ownerId) throw new Error('Sessão não identificada.');

      const { data, error } = await supabase.functions.invoke('create-pagbank-checkout', {
        body: { parcela_id: parcelaId, admin_id: ownerId },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Erro ao gerar link');

      setCheckoutLink(data.checkout_link);
      setClienteInfo(data.cliente);
      toast.success('Link de checkout gerado!');
      if (onSuccess) onSuccess();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!checkoutLink) return;
    await navigator.clipboard.writeText(checkoutLink);
    setCopied(true);
    toast.success('Link copiado!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendWhatsApp = () => {
    if (!clienteInfo?.telefone || !checkoutLink) return;
    const msg = `Olá ${clienteInfo.nome}! 👋\n\n💳 *Link de Pagamento*\n\n👉 Escolha a forma de pagamento (PIX, Boleto ou Cartão):\n${checkoutLink}\n\n💰 Valor: *R$ ${valorParcela.toFixed(2)}*\n📝 ${descricao}`;
    const url = `https://wa.me/55${clienteInfo.telefone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Gerar Link de Checkout</DialogTitle>
          <DialogDescription>Valor: R$ {valorParcela.toFixed(2)} - {descricao}</DialogDescription>
        </DialogHeader>

        {!checkoutLink ? (
          <div className="py-4"><Alert><AlertDescription>O cliente poderá escolher pagar via PIX, Boleto ou Cartão.</AlertDescription></Alert></div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <Label className="text-blue-900 font-semibold flex items-center gap-1 mb-1"><Link2 className="w-3 h-3" /> Link de Pagamento</Label>
              <div className="flex gap-2">
                <Input readOnly value={checkoutLink} className="h-8 text-xs bg-white" />
                <Button size="icon" variant="outline" className="h-8 w-8" onClick={handleCopy}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="pt-4 border-t flex gap-2">
              <Button variant="outline" className="flex-1" onClick={handleSendWhatsApp} disabled={!clienteInfo?.telefone}><Send className="h-4 w-4 mr-2" /> WhatsApp</Button>
            </div>
          </div>
        )}

        <DialogFooter>
          {!checkoutLink ? (
            <Button onClick={handleGerarLink} disabled={loading} className="w-full">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Gerar Link
            </Button>
          ) : (
            <Button onClick={() => onOpenChange(false)} className="w-full">Fechar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}