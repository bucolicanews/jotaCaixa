import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Copy, Check, Download, Send, Mail, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface VisualizarBoletoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  barcode: string;
  pdfLink: string;
  valorOriginal: number;
  valorMulta: number;
  valorJuros: number;
  valorTotal: number;
  diasAtraso: number;
  clienteNome?: string;
  clienteTelefone?: string;
  clienteEmail?: string;
}

export function VisualizarBoletoDialog({
  open,
  onOpenChange,
  barcode,
  pdfLink,
  valorOriginal,
  valorMulta,
  valorJuros,
  valorTotal,
  diasAtraso,
  clienteNome,
  clienteTelefone,
  clienteEmail,
}: VisualizarBoletoDialogProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(barcode);
      setCopied(true);
      toast.success('Código copiado!');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error('Erro ao copiar');
    }
  };

  const handleWhatsApp = () => {
    const telefone = clienteTelefone?.replace(/\D/g, '');
    const msg = `Olá ${clienteNome}! Segue o boleto para pagamento:\n\n📄 Código de barras:\n${barcode}\n\n🔗 Link do PDF:\n${pdfLink}\n\n💰 Valor total: R$ ${valorTotal.toFixed(2)}`;
    window.open(`https://wa.me/55${telefone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Boleto Gerado com Sucesso</DialogTitle>
          <DialogDescription>
            Valor total: R$ {valorTotal.toFixed(2)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Alerta de Atraso */}
          {diasAtraso > 0 && (
            <Alert className="border-amber-200 bg-amber-50">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800">
                <strong>Parcela com {diasAtraso} dia(s) de atraso</strong>
                <div className="mt-2 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span>Valor original:</span>
                    <span>R$ {valorOriginal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Multa (2%):</span>
                    <span className="text-red-600">+ R$ {valorMulta.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Juros:</span>
                    <span className="text-red-600">+ R$ {valorJuros.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-semibold border-t pt-1">
                    <span>Total:</span>
                    <span>R$ {valorTotal.toFixed(2)}</span>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Código de Barras */}
          <div className="space-y-2">
            <Label className="text-xs">Código de Barras</Label>
            <div className="flex gap-2">
              <Input readOnly value={barcode} className="h-9 text-xs font-mono bg-muted" />
              <Button size="icon" variant="outline" className="h-9 w-9" onClick={handleCopy}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* PDF Link */}
          <div className="space-y-2">
            <Button 
              variant="outline" 
              className="w-full" 
              onClick={() => window.open(pdfLink, '_blank')}
            >
              <Download className="h-4 w-4 mr-2" />
              Baixar PDF do Boleto
            </Button>
          </div>

          {/* Envio */}
          <div className="border-t pt-4">
            <div className="grid grid-cols-2 gap-2">
              <Button 
                variant="outline" 
                onClick={handleWhatsApp}
                disabled={!clienteTelefone}
              >
                <Send className="h-4 w-4 mr-2" /> WhatsApp
              </Button>
              <Button 
                variant="outline"
                disabled={!clienteEmail}
              >
                <Mail className="h-4 w-4 mr-2" /> Email
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