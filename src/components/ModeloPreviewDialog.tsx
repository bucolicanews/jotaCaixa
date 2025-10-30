import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Eye, Printer } from 'lucide-react';
import { usePrint } from '@/hooks/use-print';

interface ModeloPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conteudoTemplate: string;
  titulo: string;
}

const ModeloPreviewDialog: React.FC<ModeloPreviewDialogProps> = ({ open, onOpenChange, conteudoTemplate, titulo }) => {
  const { printContent } = usePrint();

  const handlePrint = () => {
    // Para a prévia do modelo, substituímos as tags por placeholders para a impressão
    let htmlContent = conteudoTemplate;
    htmlContent = htmlContent.replace(/\{\{[A-Z0-9_]+\}\}/g, '[[VALOR DA TAG]]');
    
    printContent(htmlContent, `Prévia do Modelo: ${titulo}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Eye className="w-5 h-5 mr-2" /> Prévia do Template: {titulo}
          </DialogTitle>
          <DialogDescription>
            Visualização da formatação do template. As tags dinâmicas não estão preenchidas nesta etapa.
          </DialogDescription>
        </DialogHeader>
        
        <div className="border rounded-md p-4 bg-background shadow-inner overflow-y-auto max-h-[60vh]">
          {/* Exibe o conteúdo do template diretamente */}
          <div dangerouslySetInnerHTML={{ __html: conteudoTemplate }} />
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

export default ModeloPreviewDialog;