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
  // isHtml removido
}

const ModeloPreviewDialog: React.FC<ModeloPreviewDialogProps> = ({ open, onOpenChange, conteudoTemplate, titulo }) => {
  const { printContent } = usePrint();

  const handlePrint = () => {
    // Assume-se que o conteúdo é HTML
    printContent(conteudoTemplate, `Prévia do Modelo: ${titulo}`);
  };
  
  // Conteúdo a ser exibido na tela (assume-se que o conteúdo é HTML)
  const contentToDisplay = (
    <div dangerouslySetInnerHTML={{ __html: conteudoTemplate }} />
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Ajustado para sm:max-w-full e max-h-[95vh] */}
      <DialogContent className="sm:max-w-full md:max-w-4xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Eye className="w-5 h-5 mr-2" /> Prévia do Template: {titulo}
          </DialogTitle>
          <DialogDescription>
            Visualização da formatação do template.
          </DialogDescription>
        </DialogHeader>
        
        <div className="border rounded-md p-4 bg-background shadow-inner overflow-y-auto max-h-[60vh]">
          {contentToDisplay}
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