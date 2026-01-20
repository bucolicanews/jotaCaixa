import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface VisualizarCodigoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  code: string;
}

export function VisualizarCodigoDialog({
  open,
  onOpenChange,
  title,
  description,
  code,
}: VisualizarCodigoDialogProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success('Código copiado!');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error('Erro ao copiar');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-3 bg-muted rounded-lg overflow-x-auto">
            <code className="font-mono text-xs whitespace-nowrap select-all">
              {code}
            </code>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleCopy} disabled={copied} className="w-full">
            {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
            {copied ? 'Copiado!' : 'Copiar Código'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}