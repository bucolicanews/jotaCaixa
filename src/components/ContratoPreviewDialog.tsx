import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Eye, Printer } from 'lucide-react';
import { usePrint } from '@/hooks/use-print';

interface ContratoPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conteudoHtml: string;
  titulo: string;
}

const ContratoPreviewDialog: React.FC<ContratoPreviewDialogProps> = ({ open, onOpenChange, conteudoHtml, titulo }) => {
  const { printContent } = usePrint();

  const handlePrint = () => {
    printContent(conteudoHtml, `Prévia do Contrato: ${titulo}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Eye className="w-5 h-5 mr-2" /> Prévia do Contrato: {titulo}
          </DialogTitle>
          <DialogDescription>
            Esta é a visualização final do contrato com todas as tags preenchidas.
          </DialogDescription>
        </DialogHeader>
        
        <div className="border rounded-md p-4 bg-background shadow-inner overflow-y-auto max-h-[60vh]">
          {/* Renderiza o HTML usando dangerouslySetInnerHTML */}
          <div dangerouslySetInnerHTML={{ __html: conteudoHtml }} />
        </div>
        
        <div className="flex justify-end space-x-2 pt-4">
            <Button onClick={handlePrint} variant="outline">
                <Printer className="w-4 h-4 mr-2" /> Imprimir / PDF
            </Button>
            <Button onClick={() => onOpenChange(false)} variant="secondary">
                Fechar
            </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ContratoPreviewDialog;