import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Copy, Check, QrCode, Send, Mail, Loader2, RefreshCw, Terminal, Search, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useSessao } from '@/hooks/use-sessao';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
}) {
  const { ownerId } = useSessao();
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedPix, setCopiedPix] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [manualOrderId, setManualOrderId] = useState('');

  const linkToUse = checkoutLink || paymentLink;

  const handleSyncStatus = async (forceId?: string) => {
    if (!parcelaId) return;
    
    try {
      setSyncing(true);
      const { data, error } = await supabase.functions.invoke('sync-pagbank-transactions', {
        body: { 
            parcelaId,
            manualOrderId: forceId || null
        }
      });

      if (error) throw error;
      
      console.log('%c=== 🔍 INVESTIGAÇÃO DE SINCRONIZAÇÃO ===', 'background: #f59e0b; color: #000; font-weight: bold; padding: 4px;');
      console.log('ID Parcela:', parcelaId);
      console.log('Status do Link:', data.status);
      console.log('Pagamento Confirmado?', data.isPaid);
      console.log('Resposta Bruta:', data.rawResponse);
      console.log('%c====================================', 'background: #f59e0b; color: #000; font-weight: bold; padding: 4px;');

      if (data.isPaid) {
          toast.success('Pagamento detectado! A parcela foi baixada com sucesso.');
          setTimeout(() => onOpenChange(false), 2000);
      } else if (forceId) {
          toast.warning(`A transação ${forceId} foi encontrada, mas o status é "${data.status}" (não pago).`);
      } else {
          toast.info(`Status atual: ${data.status}. Nenhum pagamento confirmado encontrado.`);
      }
      
    } catch (error: any) {
      console.error('Erro ao sincronizar:', error);
      toast.error(error.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleCopyLink = async (text: string, type: 'link' | 'pix') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'link') setCopiedLink(true); else setCopiedPix(true);
      toast.success('Copiado!');
      setTimeout(() => { setCopiedLink(false); setCopiedPix(false); }, 2000);
    } catch (error) {
      toast.error('Erro ao copiar');
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

        <div className="space-y-6">
          {/* Status e Sync Automático */}
          <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
            <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Status:</span>
                <Badge variant={status === 'PAID' ? 'success' : 'warning'}>
                    {status || 'Ativo'}
                </Badge>
            </div>
            <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => handleSyncStatus()} 
                disabled={syncing || status === 'PAID'}
                className="h-8 text-xs bg-amber-50 hover:bg-amber-100 text-amber-700"
            >
                {syncing && !manualOrderId ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <RefreshCw className="h-3 w-3 mr-2" />}
                Sync Automático
            </Button>
          </div>

          {/* NOVO: Busca Manual via ID */}
          {status !== 'PAID' && (
              <div className="space-y-2 p-3 border border-amber-200 rounded-lg bg-amber-50/50">
                  <Label className="text-xs font-bold text-amber-800 flex items-center gap-1">
                      <Search className="w-3 h-3" /> NÃO CONCILIOU AUTOMATICAMENTE?
                  </Label>
                  <p className="text-[10px] text-amber-700 leading-tight mb-2">
                      Se o cliente pagou mas o status não mudou, cole o <b>ID da Transação</b> (Ex: ORDE_...) abaixo:
                  </p>
                  <div className="flex gap-2">
                      <Input 
                        placeholder="ID da Transação (Order ID)" 
                        value={manualOrderId}
                        onChange={(e) => setManualOrderId(e.target.value)}
                        className="h-8 text-xs border-amber-300"
                      />
                      <Button 
                        size="sm" 
                        variant="warning"
                        onClick={() => handleSyncStatus(manualOrderId)}
                        disabled={syncing || !manualOrderId}
                        className="h-8 text-xs"
                      >
                          {syncing && manualOrderId ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Forçar Baixa'}
                      </Button>
                  </div>
              </div>
          )}

          {qrCode && (
            <div className="flex flex-col items-center space-y-2 py-2">
              <img src={qrCode} alt="QR Code PIX" className="w-40 h-40 border rounded-lg bg-white p-2" />
              <Button variant="outline" size="sm" onClick={() => handleCopyLink(qrCodeText || '', 'pix')}>
                {copiedPix ? <Check className="h-3 w-3 mr-2" /> : <QrCode className="h-3 w-3 mr-2" />}
                Copiar Código PIX
              </Button>
            </div>
          )}

          {linkToUse && (
            <div className="space-y-2">
              <Label className="text-xs">Link de Checkout</Label>
              <div className="flex gap-2">
                <Input readOnly value={linkToUse} className="h-9 text-xs bg-muted truncate" />
                <Button size="icon" variant="outline" className="h-9 w-9" onClick={() => handleCopyLink(linkToUse, 'link')}>
                    {copiedLink ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}

          {/* Rodapé de Envio */}
          <div className="border-t pt-4">
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => {
                    const telefone = clienteTelefone?.replace(/\D/g, '');
                    const msg = `Olá ${clienteNome || 'Cliente'}! Segue o link para pagamento de R$ ${valorParcela.toFixed(2)}: ${linkToUse}`;
                    window.open(`https://wa.me/55${telefone}?text=${encodeURIComponent(msg)}`, '_blank');
                }} disabled={!clienteTelefone}>
                  <Send className="h-4 w-4 mr-2" /> WhatsApp
                </Button>
                <Button variant="outline" onClick={async () => {
                    setSendingEmail(true);
                    try {
                        const { data } = await supabase.functions.invoke('send-payment-email', { body: { parcela_id: parcelaId, admin_id: ownerId } });
                        if (data.success) toast.success('E-mail enviado!');
                    } catch (e) { toast.error('Falha ao enviar e-mail'); }
                    finally { setSendingEmail(false); }
                }} disabled={sendingEmail || !clienteEmail}>
                  {sendingEmail ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />} Email
                </Button>
              </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}